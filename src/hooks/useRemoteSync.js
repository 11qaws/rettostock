import { useEffect, useRef } from 'react';

// Remote-control sync, three channels:
//  1) BroadcastChannel + localStorage — same browser (OBS custom dock scenario)
//  2) localhost dev API — Vite dev cross-origin fallback
//  3) ntfy.sh pub/sub with a room code — different browsers/devices (phone -> OBS)

const CHANNEL_NAME = 'obs-widget-sync';
const STORAGE_KEY = 'obs-widget-sync-data';
const ROOM_STORAGE_KEY = 'obs-widget-room';
const KEYS_STORAGE_KEY = 'obs-widget-keys';

// ---- Relay signing (ECDSA P-256 via WebCrypto) ----
// The private key never leaves the remote's browser; the widget URL only
// carries the public key. The widget rejects any relayed payload whose
// signature does not verify, so knowing the room code is NOT enough to
// control someone's widget — only this browser can.

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4 ? '='.repeat(4 - (t.length % 4)) : '';
  return Uint8Array.from(atob(t + pad), c => c.charCodeAt(0));
};

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' };

export async function getOrCreateSigningKeys() {
  try {
    const stored = localStorage.getItem(KEYS_STORAGE_KEY);
    if (stored) {
      const { priv, pub } = JSON.parse(stored);
      const privateKey = await crypto.subtle.importKey('jwk', priv, ECDSA, false, ['sign']);
      return { privateKey, publicKeyB64: pub };
    }
  } catch { /* fall through to a fresh pair */ }

  const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKeyB64 = b64url(await crypto.subtle.exportKey('raw', pair.publicKey));
  try {
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ priv: privJwk, pub: publicKeyB64 }));
  } catch { /* ignore */ }
  return { privateKey: pair.privateKey, publicKeyB64 };
}

export function resetSigningKeys() {
  try { localStorage.removeItem(KEYS_STORAGE_KEY); } catch { /* ignore */ }
}

const signPayload = async (privateKey, url, timestamp) => {
  const data = new TextEncoder().encode(`${url}|${timestamp}`);
  return b64url(await crypto.subtle.sign(SIGN_ALGO, privateKey, data));
};

const verifyPayload = async (publicKeyB64, payload) => {
  try {
    if (!payload || !payload.sig || !payload.url || !payload.timestamp) return false;
    const key = await crypto.subtle.importKey('raw', fromB64url(publicKeyB64), ECDSA, false, ['verify']);
    const data = new TextEncoder().encode(`${payload.url}|${payload.timestamp}`);
    return await crypto.subtle.verify(SIGN_ALGO, key, fromB64url(payload.sig), data);
  } catch {
    return false;
  }
};

const isLocalDev = () =>
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const ntfyTopic = (room) => `https://ntfy.sh/rettostock-${room}`;

export function getOrCreateRoom() {
  try {
    let room = localStorage.getItem(ROOM_STORAGE_KEY);
    if (!room) {
      room = createRoom();
      localStorage.setItem(ROOM_STORAGE_KEY, room);
    }
    return room;
  } catch {
    return createRoom();
  }
}

export function createRoom() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function saveRoom(room) {
  try { localStorage.setItem(ROOM_STORAGE_KEY, room); } catch { /* ignore */ }
}

let ntfyTimer = null;

export function publishSync(payload, room, privateKey) {
  // Same-browser channels: immediate
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch { /* ignore */ }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }

  if (isLocalDev()) {
    fetch(`${window.location.origin}/api/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  // Cross-browser relay: debounced, and always signed — the widget
  // ignores anything without a valid signature from this browser's key
  if (room && privateKey) {
    clearTimeout(ntfyTimer);
    ntfyTimer = setTimeout(async () => {
      try {
        const sig = await signPayload(privateKey, payload.url, payload.timestamp);
        await fetch(ntfyTopic(room), {
          method: 'POST',
          body: JSON.stringify({ ...payload, sig }),
        });
      } catch { /* ignore */ }
    }, 800);
  }
}

export function useWidgetSync(room, publicKeyB64, onSync) {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    const handle = (payload) => {
      if (payload && payload.url) onSyncRef.current(payload);
    };

    // 1. localStorage event (same browser, other tab)
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { handle(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);

    // 2. BroadcastChannel (same browser)
    let channel;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => handle(e.data);
    } catch { /* ignore */ }

    // 3. Local dev API polling
    let devInterval;
    if (isLocalDev()) {
      let lastTimestamp = 0;
      devInterval = setInterval(async () => {
        try {
          const res = await fetch(`${window.location.origin}/api/sync`);
          const payload = await res.json();
          if (payload && payload.url && payload.timestamp > lastTimestamp) {
            lastTimestamp = payload.timestamp;
            handle(payload);
          }
        } catch { /* ignore */ }
      }, 1000);
    }

    // 4. ntfy.sh SSE relay (cross-browser / cross-device).
    //    Signature-gated: without the matching public key in the widget
    //    URL nothing is accepted, and forged/unsigned messages are dropped.
    let es;
    if (room && publicKeyB64) {
      let lastAcceptedTs = 0; // replay guard
      try {
        es = new EventSource(`${ntfyTopic(room)}/sse`);
        es.onmessage = async (e) => {
          try {
            const envelope = JSON.parse(e.data);
            if (envelope.event !== 'message' || !envelope.message) return;
            const payload = JSON.parse(envelope.message);
            if (!(await verifyPayload(publicKeyB64, payload))) return;
            if (payload.timestamp <= lastAcceptedTs) return;
            lastAcceptedTs = payload.timestamp;
            handle(payload);
          } catch { /* ignore */ }
        };
      } catch { /* ignore */ }
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
      if (devInterval) clearInterval(devInterval);
      if (es) es.close();
    };
  }, [room, publicKeyB64]);
}
