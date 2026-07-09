import { useEffect, useRef } from 'react';

// Remote-control sync, three channels:
//  1) BroadcastChannel + localStorage — same browser (OBS custom dock scenario)
//  2) localhost dev API — Vite dev cross-origin fallback
//  3) ntfy.sh pub/sub with a room code — different browsers/devices (phone -> OBS)

const CHANNEL_NAME = 'obs-widget-sync';
const STORAGE_KEY = 'obs-widget-sync-data';
const ROOM_STORAGE_KEY = 'obs-widget-room';

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

export function publishSync(payload, room) {
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

  // Cross-browser relay: debounced to be gentle on ntfy
  if (room) {
    clearTimeout(ntfyTimer);
    ntfyTimer = setTimeout(() => {
      fetch(ntfyTopic(room), {
        method: 'POST',
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 800);
  }
}

export function useWidgetSync(room, onSync) {
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

    // 4. ntfy.sh SSE relay (cross-browser / cross-device)
    let es;
    if (room) {
      try {
        es = new EventSource(`${ntfyTopic(room)}/sse`);
        es.onmessage = (e) => {
          try {
            const envelope = JSON.parse(e.data);
            if (envelope.event === 'message' && envelope.message) {
              handle(JSON.parse(envelope.message));
            }
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
  }, [room]);
}
