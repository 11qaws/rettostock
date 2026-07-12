const DEFAULT_ALLOWED_ORIGINS = [
  'https://11qaws.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

const UPSTREAM_TIMEOUT_MS = 5000;
const RETRY_AFTER_FAILURE_MS = 5000;
const inFlightRefreshes = new Map();

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const requestOrigin = (request) => request.headers.get('Origin');

export const originIsAllowed = (request, env) => {
  const origin = requestOrigin(request);
  return Boolean(origin) && allowedOrigins(env).includes(origin);
};

const corsHeaders = (request, env) => {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
};

export const json = (request, env, body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(request, env),
  },
});

export const options = (request, env) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const symbolsFrom = (request) => {
  const raw = new URL(request.url).searchParams.get('symbols') || '';
  const symbols = [...new Set(raw.split(',').map((symbol) => symbol.trim().toUpperCase()))];
  if (!symbols.length || symbols.length > 10 || symbols.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))) {
    return null;
  }
  return symbols;
};

const cacheRequestFor = (request, namespace, key) => {
  const url = new URL(request.url);
  url.pathname = `/_cache/${namespace}/${encodeURIComponent(key)}`;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
};

const readCache = async (cacheRequest) => {
  const response = await caches.default.match(cacheRequest);
  if (!response) return null;
  try {
    const entry = await response.json();
    return entry && typeof entry.fetchedAt === 'number' ? entry : null;
  } catch {
    return null;
  }
};

const writeCache = async (cacheRequest, entry, staleMs) => {
  const response = new Response(JSON.stringify(entry), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browser clients never receive this response. The TTL only controls the
      // Worker cache's own retention window for the stale fallback.
      'Cache-Control': `public, max-age=${Math.ceil(staleMs / 1000)}`,
    },
  });
  await caches.default.put(cacheRequest, response);
};

const cacheAge = (entry, now) => now - entry.fetchedAt;

// A POP-local cache cannot coalesce a global burst, but this in-memory lock
// prevents simultaneous cache misses in the same isolate from stampeding
// Finnhub. The result is then stored in Cache API for later isolates.
export const cached = async ({ request, namespace, key, freshMs, staleMs, load }) => {
  const cacheRequest = cacheRequestFor(request, namespace, key);
  const now = Date.now();
  const previous = await readCache(cacheRequest);
  const previousIsUsable = previous && cacheAge(previous, now) <= staleMs;

  if (previousIsUsable && cacheAge(previous, now) <= freshMs) {
    return { data: previous.data, fetchedAt: previous.fetchedAt, stale: false };
  }
  if (previousIsUsable && previous.retryAfter > now) {
    return { data: previous.data, fetchedAt: previous.fetchedAt, stale: true };
  }

  const flightKey = cacheRequest.url;
  let refresh = inFlightRefreshes.get(flightKey);
  if (!refresh) {
    refresh = (async () => {
      const data = await load();
      const entry = { data, fetchedAt: Date.now(), retryAfter: 0 };
      await writeCache(cacheRequest, entry, staleMs);
      return entry;
    })();
    inFlightRefreshes.set(flightKey, refresh);
    refresh.then(
      () => inFlightRefreshes.delete(flightKey),
      () => inFlightRefreshes.delete(flightKey),
    );
  }

  try {
    const entry = await refresh;
    return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
  } catch (error) {
    if (!previousIsUsable) throw error;
    const retryEntry = { ...previous, retryAfter: now + RETRY_AFTER_FAILURE_MS };
    await writeCache(cacheRequest, retryEntry, staleMs);
    return { data: previous.data, fetchedAt: previous.fetchedAt, stale: true };
  }
};

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Finnhub's 429 and a network timeout can be recovered by trying the standby
// key. Authentication/authorization failures deliberately do not rotate: a
// second key cannot fix a malformed or revoked credential.
export const finnhub = async (path, env) => {
  const keys = [env.FINNHUB_API_KEY_1, env.FINNHUB_API_KEY_2].filter(Boolean);
  if (!keys.length) throw new Error('Finnhub API keys are not configured');

  let lastError;
  for (let index = 0; index < keys.length; index += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://api.finnhub.io${path}${separator}token=${encodeURIComponent(keys[index])}`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === 429 && index < keys.length - 1) continue;
      if (!response.ok) throw new Error(`Finnhub returned ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (error?.name !== 'AbortError' || index === keys.length - 1) throw error;
    }
  }
  throw lastError || new Error('Finnhub request failed');
};
