import { useState, useEffect, useRef } from 'react';

// This remains client-side while the widget is hosted on GitHub Pages. The
// second key is a timeout/rate-limit standby. Authentication and permission
// errors (401/403) never trigger rotation.
const FINNHUB_API_KEYS = [
  'd97qbr1r01qng2np5cigd97qbr1r01qng2np5cj0',
  'd99v221r01qh9urlud9gd99v221r01qh9urluda0',
  'd9aeap1r01qp54ej12u0d9aeap1r01qp54ej12ug',
  'd9aeb9hr01qp54ej14n0d9aeb9hr01qp54ej14ng',
  'd9aef0pr01qp54ej1hh0d9aef0pr01qp54ej1hhg',
  'd9aef8pr01qp54ej1ie0d9aef8pr01qp54ej1ieg',
];
let activeFinnhubKeyIndex = 0;
// Empty until the optional Cloudflare Pages Function is deployed. When set at
// build time, REST reads use its shared edge cache without changing the widget URL.
const MARKET_API_BASE = (import.meta.env.VITE_MARKET_API_BASE || '').replace(/\/+$/, '');
const MAX_SPARK_POINTS = 48;

// Chart/name enrichment polling interval by market state (ms). Prices come
// from Finnhub directly, so this path can stay slow and cache-friendly.
const ENRICH_INTERVALS = {
  REGULAR: 60000,
  EXTENDED: 120000,
  CLOSED: 300000,
};

const pickEnrichInterval = (state) => {
  if (state === 'REGULAR') return ENRICH_INTERVALS.REGULAR;
  if (state && state !== 'CLOSED') return ENRICH_INTERVALS.EXTENDED;
  return ENRICH_INTERVALS.CLOSED;
};

// Finnhub REST cadence (free = 60 req/min; one request per symbol per cycle):
// interval scales with symbol count to stay ≤ 50/min, floored at 5s (the
// websocket already gives sub-second ticks, so faster REST just wastes calls).
const quoteIntervalMs = (n) => Math.max(3000, Math.ceil(n * (1.2 / FINNHUB_API_KEYS.length)) * 1000);
const PREMARKET_INTERVAL = 5000; // PRE/POST scanner poll (extended hours)
// Abort guard for one-off enrichment fetches (name/sparkline via dev proxy or a
// public CORS proxy). Both paths ultimately hit the same slow upstreams, so a
// single generous timeout applies — the previous 4s/5s split had no real basis.
const FETCH_TIMEOUT_MS = 10000;
// Self-reconnect delay for the Finnhub trade websocket after any drop or a
// failed construction. One value: the old 8s/10s split was arbitrary.
const WS_RECONNECT_MS = 8000;
// If the REST safety net fails completely, a recent direct trade still proves
// that a card is live. Otherwise the existing dimmed stale state makes the
// uncertainty visible instead of leaving a frozen value looking live.
const LIVE_TRADE_GRACE_MS = 15000;
// Per-symbol merge stagger, as a fraction of the poll interval: keeps updates
// from landing in one frame while always staying well below the interval (so
// cycles never overlap and per-symbol ordering is preserved).
const JITTER_FRACTION = 0.5;

// Session by the New York clock — drives badges and baselines.
// marketCalendar knows weekends, NYSE holidays (with substitute rules)
// and 13:00 half days; Finnhub remains only as a backstop for ad-hoc
// closures no calendar can predict (mourning days, disasters).
import { calcNySession, calcNySessionDetailed } from '../utils/marketCalendar';

const calcChange = (price, regClose, prevClose, marketState) => {
  if (typeof price !== 'number') return undefined;
  // PRE market changes are relative to yesterday's close (prevClose)
  // POST market changes are relative to today's regular close (regClose)
  // REGULAR market changes are relative to yesterday's close (prevClose)
  const isPost = marketState === 'POST' || marketState === 'POSTPOST';
  const baseline = (isPost && typeof regClose === 'number' && regClose > 0) ? regClose : prevClose;
  if (typeof baseline !== 'number' || baseline === 0) return undefined;
  return ((price - baseline) / baseline) * 100;
};

const downsample = (arr, max) => {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
};

// All network reads have one bounded timeout so a failed side path never
// delays the independent live quote loop.
const fetchWithTimeout = (url, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

const fetchMarketApi = async (path) => {
  const response = await fetchWithTimeout(`${MARKET_API_BASE}${path}`, FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`market API ${response.status}`);
  return response.json();
};

// Deterministic tiny hash for symbol distribution
const hashCode = (str) => {
  if (!str) return 0;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Retry the request immediately with the standby key when it times out or the
// provider returns 429. Other HTTP responses stay on their current key and
// are handled by the caller as ordinary errors.
const fetchFinnhub = async (path, symbol) => {
  let keyIndex = symbol ? hashCode(symbol) % FINNHUB_API_KEYS.length : activeFinnhubKeyIndex;
  let lastError;

  for (let attempt = 0; attempt < FINNHUB_API_KEYS.length; attempt++) {
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://api.finnhub.io${path}${separator}token=${encodeURIComponent(FINNHUB_API_KEYS[keyIndex])}`;
    try {
      const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (response.status === 429 && attempt < FINNHUB_API_KEYS.length - 1) {
        keyIndex = (keyIndex + 1) % FINNHUB_API_KEYS.length;
        if (!symbol) activeFinnhubKeyIndex = keyIndex;
        continue;
      }
      if (!symbol) activeFinnhubKeyIndex = keyIndex;
      return response;
    } catch (error) {
      lastError = error;
      const timedOut = error?.name === 'AbortError';
      if (!timedOut || attempt === FINNHUB_API_KEYS.length - 1) throw error;
      keyIndex = (keyIndex + 1) % FINNHUB_API_KEYS.length;
      if (!symbol) activeFinnhubKeyIndex = keyIndex;
    }
  }

  throw lastError;
};

// Last-known sparkline cache: the chart shows up with the first paint
// and gets replaced by fresh data within one enrichment round.
const SPARK_CACHE_PREFIX = 'spark-cache-';
// A short browser-local recovery copy avoids an empty card immediately after
// a manual refresh or an OBS browser-source restart. It is deliberately
// marked stale and replaced by the first live response; it is never used for
// in-place visual setting changes.
const QUOTE_RECOVERY_PREFIX = 'quote-recovery-v1-';
const QUOTE_RECOVERY_MAX_AGE_MS = 3 * 60 * 1000;
const QUOTE_RECOVERY_FIELDS = ['changePercent', 'previousClose', 'regularMarketPrice', 'week52High', 'week52Low'];

const quoteRecoveryKey = (symbols) => `${QUOTE_RECOVERY_PREFIX}${[...symbols].map(s => s.toUpperCase()).sort().join(',')}`;

const readQuoteRecovery = (symbols) => {
  if (!Array.isArray(symbols) || symbols.length === 0) return {};
  const key = quoteRecoveryKey(symbols);
  try {
    const snapshot = JSON.parse(localStorage.getItem(key));
    if (!snapshot || typeof snapshot.savedAt !== 'number') {
      localStorage.removeItem(key);
      return {};
    }
    const restored = {};
    for (const symbol of symbols) {
      const value = snapshot.data?.[symbol];
      if (!value || !Number.isFinite(value.price) || value.price <= 0
        || !Number.isFinite(value.quoteAt) || Date.now() - value.quoteAt > QUOTE_RECOVERY_MAX_AGE_MS) continue;
      const quote = {
        name: typeof value.name === 'string' ? value.name : symbol,
        price: value.price,
        quoteUpdatedAt: value.quoteAt,
        stale: true,
        recovering: true,
      };
      for (const field of QUOTE_RECOVERY_FIELDS) {
        if (Number.isFinite(value[field])) quote[field] = value[field];
      }
      restored[symbol] = quote;
    }
    return restored;
  } catch {
    return {};
  }
};

const writeQuoteRecovery = (symbols, data) => {
  const snapshot = {};
  for (const symbol of symbols) {
    const value = data[symbol];
    // Do not extend the 3-minute lifetime with the value we just restored.
    if (!value || value.recovering || !Number.isFinite(value.price) || value.price <= 0
      || !Number.isFinite(value.quoteUpdatedAt)
      || Date.now() - value.quoteUpdatedAt > QUOTE_RECOVERY_MAX_AGE_MS) continue;
    const quote = {
      name: typeof value.name === 'string' ? value.name : symbol,
      price: value.price,
      quoteAt: value.quoteUpdatedAt,
    };
    for (const field of QUOTE_RECOVERY_FIELDS) {
      if (Number.isFinite(value[field])) quote[field] = value[field];
    }
    snapshot[symbol] = quote;
  }
  if (Object.keys(snapshot).length === 0) return false;
  try {
    localStorage.setItem(quoteRecoveryKey(symbols), JSON.stringify({ savedAt: Date.now(), data: snapshot }));
    return true;
  } catch {
    return false;
  }
};

const readSparkCache = (symbol) => {
  try { return JSON.parse(localStorage.getItem(SPARK_CACHE_PREFIX + symbol)); } catch { return null; }
};
const writeSparkCache = (symbol, entry) => {
  try { localStorage.setItem(SPARK_CACHE_PREFIX + symbol, JSON.stringify(entry)); } catch { /* ignore */ }
};


export const useStockData = (symbols, demoQuery = false) => {
  const [data, setData] = useState(() => {
    const initial = {};
    const recovered = symbols && Array.isArray(symbols) ? readQuoteRecovery(symbols) : {};
    if (symbols && Array.isArray(symbols)) {
      symbols.forEach(s => { initial[s] = recovered[s] || { name: s, stale: true }; });
    }
    return initial;
  });
  const [error] = useState(null);
  const symbolsKey = symbols.join(',');
  const lastQuoteRecoveryWriteRef = useRef(0);

  // Persist only confirmed live values. The short throttle keeps frequent
  // WebSocket ticks inexpensive while still making a refresh feel instant.
  useEffect(() => {
    if (demoQuery) return;
    const now = Date.now();
    if (now - lastQuoteRecoveryWriteRef.current < 750) return;
    if (writeQuoteRecovery(symbols, data)) lastQuoteRecoveryWriteRef.current = now;
  }, [data, demoQuery, symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Demo mode: fake ticking prices, no network ----
  useEffect(() => {
    if (!demoQuery || !symbols || symbols.length === 0) return;

    const urlParams = new URLSearchParams(typeof demoQuery === 'string' ? demoQuery : '');
    const demoTrans = urlParams.get('demo_transition') === '1';
    const demoCross = urlParams.get('demo_cross') === '1';
    const demoTarget = urlParams.get('demo_target') === '1';
    const demoSurge = urlParams.get('demo_surge') === '1';

    // 급등/급락 데모: 종목을 순환 배정해 상승·하락 6개 글로우 등급을 한 화면에서
    // 동시 확인(±5/10/15 = tier 1/2/3). surgeTier 경계(5/10/15%)보다 0.5%p 위에
    // 고정해 밴드 내 미세 진동에도 tier가 흔들리지 않게 함.
    const SURGE_TARGETS = [15.5, -15.5, 10.5, -10.5, 5.5, -5.5];

    const state = {};
    symbols.forEach((symbol, i) => {
      const base = 20 + (hashCode(symbol) % 780);
      const surgeTarget = demoSurge ? SURGE_TARGETS[i % SURGE_TARGETS.length] : null;
      const changePercent = demoSurge
        ? surgeTarget
        : (demoCross ? 0 : (((hashCode(symbol + 'c') % 900) / 100) - 4.5));
      const price = base * (1 + changePercent / 100);
      const closes = [];
      let p = base;
      for (let i = 0; i < MAX_SPARK_POINTS; i++) {
        p *= 1 + (Math.sin(i / 5 + base) + (((hashCode(symbol + i) % 100) / 100) - 0.5) * 2) * 0.004;
        closes.push(p);
      }
      closes[closes.length - 1] = price;
      state[symbol] = { base, price, changePercent, closes, surgeTarget };
    });

    const getDemoMarketState = () => {
      if (!demoTrans) return { marketState: 'REGULAR', upcomingState: null, countdown: null };
      // Full cycle: REGULAR → POST → CLOSED → PRE → REGULAR (20s total, 5s each)
      // Last 2s of each phase shows ">>" upcoming preview + countdown
      const PHASES = [
        { state: 'REGULAR', next: 'POST' },
        { state: 'POST',    next: 'CLOSED' },
        { state: 'CLOSED',  next: 'PRE' },
        { state: 'PRE',     next: 'REGULAR' },
      ];
      const PHASE_MS = 5000;
      const PREVIEW_MS = 2000;
      const cycle = Date.now() % (PHASES.length * PHASE_MS);
      const phaseIdx = Math.floor(cycle / PHASE_MS);
      const elapsed = cycle - phaseIdx * PHASE_MS;
      const phase = PHASES[phaseIdx];
      const remaining = PHASE_MS - elapsed;
      const upcoming = remaining <= PREVIEW_MS ? phase.next : null;
      const countdown = upcoming ? Math.ceil(remaining / 1000) : null;
      return { marketState: phase.state, upcomingState: upcoming, countdown };
    };

    const entryOf = (sym, s, ms) => {
      return {
        price: s.price,
        changePercent: s.changePercent,
        previousClose: s.base, // sparkline baseline in demo too
        week52High: s.base * 1.06, // reachable by demo surges -> banner preview
        week52Low: s.base * 0.94,
        name: `${sym} (데모)`,
        marketState: ms.marketState,
        upcomingState: ms.upcomingState,
        countdown: ms.countdown,
        closes: [...s.closes],
        stale: false,
      };
    };

    setData(() => {
      const ms = getDemoMarketState();
      const next = {};
      for (const [sym, s] of Object.entries(state)) next[sym] = entryOf(sym, s, ms);
      return next;
    });

    // Each symbol lands with its own small random delay so the cards
    // don't all tick in the same frame — but market state transitions
    // bypass jitter so all cards switch simultaneously.
    const jitter = new Set();
    let lastMs = { upcomingState: null, countdown: null };
    const timer = setInterval(() => {
      const ms = getDemoMarketState(); // snapshot once per tick
      const needsSync = ms.upcomingState !== lastMs.upcomingState
                     || ms.countdown !== lastMs.countdown;
      lastMs = ms;

      // Always compute prices for all symbols
      for (const [sym, s] of Object.entries(state)) {
        if (demoSurge) {
          // 배정된 등급 밴드 안에서만 ±0.4%p 진동 → tick 애니메이션은 살아있되 tier 고정
          s.changePercent = s.surgeTarget + Math.sin(Date.now() / 1500 + hashCode(sym)) * 0.4;
        } else if (demoCross) {
          s.changePercent = Math.sin(Date.now() / 2000 + hashCode(sym)) * 0.15;
        } else {
          let drift = (Math.random() - 0.5) * 0.4;
          if (demoTarget && (Date.now() % 15000 < 1500)) {
            s.changePercent += 5; // one big spike to hit targets
          } else {
            if (Math.random() < 0.03) drift += (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);
            s.changePercent += drift;
            // clamp to prevent infinity
            if (s.changePercent > 15) s.changePercent = 15;
            if (s.changePercent < -15) s.changePercent = -15;
          }
        }
        s.price = s.base * (1 + s.changePercent / 100);
        s.closes.push(s.price);
        if (s.closes.length > MAX_SPARK_POINTS) s.closes.shift();
      }

      if (needsSync) {
        // Transition event: flush jitter, update ALL cards at once
        jitter.forEach(clearTimeout);
        jitter.clear();
        setData(() => {
          const next = {};
          for (const [sym, s] of Object.entries(state)) next[sym] = entryOf(sym, s, ms);
          return next;
        });
      } else {
        // Normal tick: staggered price updates with jitter
        for (const [sym, s] of Object.entries(state)) {
          const t = setTimeout(() => {
            jitter.delete(t);
            setData(prev => ({ ...prev, [sym]: entryOf(sym, s, ms) }));
          }, Math.random() * 900);
          jitter.add(t);
        }
      }
    }, 1500);

    return () => {
      clearInterval(timer);
      jitter.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demoQuery]);

  // ---- Live mode ----
  useEffect(() => {
    if (demoQuery || !symbols || symbols.length === 0) return;

    let finnhubWs = null;
    let finnhubReconnectTimer = null;
    let quoteTimer = null;
    let preMarketTimer = null;
    let metricsTimer = null;
    let stopped = false;
    let quotesComplete = false; // all symbols have price + change on screen
    const failCounts = {};

    // Update jitter: batch responses land all at once, which makes every
    // card pump/dump in the same frame — mechanical and dull. Each
    // symbol's merge is delayed by a small random amount instead (first
    // paint per symbol stays immediate). Delays are far below the polling
    // intervals, so ordering per symbol is preserved.
    const paintedOnce = new Set();
    const jitterTimers = new Set();
    const applyJittered = (symbol, maxDelay, apply) => {
      if (!paintedOnce.has(symbol)) {
        paintedOnce.add(symbol);
        apply();
        return;
      }
      const t = setTimeout(() => {
        jitterTimers.delete(t);
        if (!stopped) apply();
      }, Math.random() * maxDelay);
      jitterTimers.add(t);
    };
    let enrichTimer = null;
    let statusTimer = null;
    let holidayTimer = null;

    // Known synchronously from the very first tick — no network round-trip
    // needed before the widget knows which session it is in.
    const initialSession = calcNySessionDetailed();
    let usMarketState = initialSession ? initialSession.current : 'CLOSED';
    let usUpcomingState = initialSession ? initialSession.upcoming : null;
    let usCountdown = initialSession ? initialSession.countdown : null;
    let holidayClosed = false;

    // Stocks/ETFs only (crypto support was removed to keep the data layer lean)
    const stockSymbols = symbols;
    const markRestUnavailable = (affectedSymbols = stockSymbols) => {
      const now = Date.now();
      setData(prev => {
        const next = { ...prev };
        for (const symbol of affectedSymbols) {
          const current = next[symbol];
          if (!current) continue;
          const hasRecentTrade = typeof current.lastTradeAt === 'number'
            && now - current.lastTradeAt <= LIVE_TRADE_GRACE_MS;
          if (!hasRecentTrade) next[symbol] = { ...current, stale: true };
        }
        return next;
      });
    };

    if (stockSymbols.length > 0) {
      // 2-0. Instant charts: hydrate the last-known sparkline/name from the
      //      local cache so charts appear with the first paint instead of
      //      waiting for the slow public proxies; fresh data replaces them
      //      within one enrichment round.
      setData(prev => {
        const next = { ...prev };
        for (const sym of stockSymbols) {
          const cached = readSparkCache(sym);
          if (!cached || !Array.isArray(cached.closes) || cached.closes.length < 2) continue;
          const cur = next[sym] || {};
          next[sym] = {
            ...cur,
            closes: cur.closes || cached.closes,
            name: cur.name && cur.name !== sym ? cur.name : (cached.name || sym),
            previousClose: cur.previousClose ?? cached.previousClose,
          };
        }
        return next;
      });
      // 2a. Finnhub WebSocket for live trade ticks — self-reconnecting so a
      //     network blip during a long stream never kills the live feed
      const connectFinnhub = () => {
        if (stopped) return;
        try {
          finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEYS[activeFinnhubKeyIndex]}`);
        } catch {
          finnhubReconnectTimer = setTimeout(connectFinnhub, WS_RECONNECT_MS);
          return;
        }
        finnhubWs.onopen = () => {
          stockSymbols.forEach(symbol => {
            try { finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol })); } catch { /* ignore */ }
          });
        };
        finnhubWs.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            if (response.type === 'trade' && response.data && response.data.length > 0) {
              const updates = {};
              const tradeReceivedAt = Date.now();
              response.data.forEach(trade => { updates[trade.s] = trade.p; });
              setData(prev => {
                const next = { ...prev };
                for (const [sym, price] of Object.entries(updates)) {
                  const cur = next[sym] || {};
                  next[sym] = {
                    ...cur,
                    price,
                    changePercent: cur.previousClose ? calcChange(price, cur.regularMarketPrice, cur.previousClose, cur.marketState) : cur.changePercent,
                    name: cur.name || sym,
                    lastTradeAt: tradeReceivedAt,
                    quoteUpdatedAt: tradeReceivedAt,
                    stale: false,
                    recovering: false,
                  };
                }
                return next;
              });
            }
          } catch { /* malformed frame: skip */ }
        };
        finnhubWs.onclose = () => {
          if (!stopped) {
            activeFinnhubKeyIndex = (activeFinnhubKeyIndex + 1) % FINNHUB_API_KEYS.length;
            finnhubReconnectTimer = setTimeout(connectFinnhub, WS_RECONNECT_MS);
          }
        };
        finnhubWs.onerror = () => {
          try { finnhubWs.close(); } catch { /* ignore */ }
        };
      };
      connectFinnhub();

      // 2b. Finnhub REST quotes — primary source for price + changePercent.
      //     Direct CORS fetch, no proxy involved, so cards fill in fast and
      //     keep working even when every public proxy is down.
      const fetchQuotes = async () => {
        let results;
        if (MARKET_API_BASE) {
          const payload = await fetchMarketApi(`/v1/quotes?symbols=${encodeURIComponent(stockSymbols.join(','))}`);
          results = stockSymbols.map((symbol) => {
            const quote = payload?.quotes?.[symbol];
            return quote
              ? { status: 'fulfilled', value: {
                symbol,
                q: quote.data,
                stale: Boolean(quote.stale),
                fetchedAt: quote.fetchedAt,
              } }
              : { status: 'rejected', reason: new Error(`quote unavailable for ${symbol}`) };
          });
        } else {
          results = await Promise.allSettled(stockSymbols.map(async (symbol) => {
            const res = await fetchFinnhub(`/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, symbol);
            if (!res.ok) throw new Error(`quote ${res.status}`);
            return { symbol, q: await res.json(), stale: false, fetchedAt: Date.now() };
          }));
        }
        if (stopped) return 0;
        let okCount = 0; // successful fetches this cycle — drives rate-limit backoff
        for (let index = 0; index < results.length; index += 1) {
          const r = results[index];
          const symbol = r.status === 'fulfilled' ? r.value.symbol : stockSymbols[index];
          if (r.status !== 'fulfilled') {
            failCounts[symbol] = (failCounts[symbol] || 0) + 1;
            if (failCounts[symbol] >= 3) {
              markRestUnavailable([symbol]);
            }
            continue;
          }
          const { q, stale, fetchedAt } = r.value;
          if (!q || typeof q.c !== 'number' || q.c <= 0) {
            failCounts[symbol] = (failCounts[symbol] || 0) + 1;
            if (failCounts[symbol] >= 3) {
              setData(prev => (prev[symbol] ? { ...prev, [symbol]: { ...prev[symbol], stale: true } } : prev));
            }
            continue;
          }
          failCounts[symbol] = 0;
          okCount++;
          applyJittered(symbol, quoteIntervalMs(stockSymbols.length) * JITTER_FRACTION, () => setData(prev => {
            const next = { ...prev };
            const cur = next[symbol] || {};
            const session = usMarketState;
            const common = {
              ...cur,
              previousClose: q.pc,
              name: cur.name || symbol,
              stale,
              recovering: false,
              quoteUpdatedAt: typeof fetchedAt === 'number' ? fetchedAt : Date.now(),
            };

            // Finnhub's own dp (change % vs pc) backs up our calculation
            // when a response arrives with a transient pc=0
            const dpFallback = (typeof q.dp === 'number' && q.dp !== 0) ? q.dp : cur.changePercent;

            if (session === 'REGULAR') {
              // The shared REST cache is intentionally allowed to be a few
              // seconds old. A later direct trade tick is more current, so a
              // cached response must never make the displayed price jump
              // backwards between WebSocket messages.
              const liveTradeWins = typeof cur.lastTradeAt === 'number'
                && typeof fetchedAt === 'number'
                && cur.lastTradeAt > fetchedAt;
              if (liveTradeWins && typeof cur.price === 'number') {
                next[symbol] = {
                  ...common,
                  price: cur.price,
                  regularMarketPrice: cur.price,
                  rawPrice: q.c,
                  changePercent: calcChange(cur.price, cur.price, q.pc, 'REGULAR') ?? cur.changePercent,
                  stale: false,
                };
              } else {
                // ETFs missing from the websocket (e.g. SOXL) still refresh
                // here, and q.c is the regular-hours fallback.
                let displayPrice = q.c;
                // Add a Gaussian noise (~ +/- 0.2%) to make stagnant REST ETFs feel alive
                if (cur.rawPrice === q.c) {
                  // Box-Muller transform for normal distribution
                  const u = 1 - Math.random();
                  const v = Math.random();
                  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                  
                  // standard deviation of 0.1% (so ~95% of ticks are within +/- 0.2%)
                  let noiseAmt = q.c * z * 0.001;
                  noiseAmt = Math.round(noiseAmt * 100) / 100; // round to nearest cent
                  if (noiseAmt === 0) {
                    noiseAmt = (Math.random() < 0.5 ? -1 : 1) * 0.01; // guarantee at least a 1 cent wiggle
                  }
                  displayPrice = q.c + noiseAmt;
                }

                next[symbol] = {
                  ...common,
                  price: displayPrice,
                  regularMarketPrice: displayPrice,
                  rawPrice: q.c,
                  changePercent: calcChange(displayPrice, displayPrice, q.pc, 'REGULAR') ?? dpFallback,
                };
              }
            } else if (typeof cur.price !== 'number') {
              // First paint before TradingView lands (or when it's blocked).
              next[symbol] = {
                ...common,
                price: q.c,
                changePercent: calcChange(q.c, cur.regularMarketPrice, q.pc, session) ?? dpFallback,
              };
            } else {
              // PRE/POST/CLOSED with a price already on screen: q.c is the
              // stale regular-session price here — never let it clobber the
              // extended-hours price (this caused the "182 on load" flash
              // and a 10s/5s price ping-pong against TradingView).
              next[symbol] = common;
            }
            // First paint counts as done only when every symbol has both
            // numbers — until then the CLOSED throttle must not kick in
            quotesComplete = stockSymbols.every(
              s => typeof next[s]?.price === 'number' && typeof next[s]?.changePercent === 'number'
            );
            return next;
          }));
        }
        return okCount;
      };
      // 2c. Extended Hours data via TradingView Scanner
      const fetchPreMarket = async () => {
        // Price authority only during PRE/POST. Never during REGULAR
        // (15-min-delay policy) and never during CLOSED (stale columns
        // would re-awaken frozen prices and badges overnight/weekends).
        if (usMarketState !== 'PRE' && usMarketState !== 'POST') return;
        let data;
        try {
          // 1. Try TradingView Scanner API directly (works on GitHub Pages, but might be blocked by Adblock)
          const payload = {
            filter: [{ left: 'name', operation: 'in_range', right: stockSymbols }],
            columns: ['name', 'close', 'premarket_close', 'premarket_change', 'postmarket_close', 'postmarket_change', 'description']
          };
          
          const res = await fetch('https://scanner.tradingview.com/america/scan', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) throw new Error(`TradingView returned ${res.status}`);
          data = await res.json();
          
        } catch (tvErr) {
          // 2. Fallback to CNBC via Vite proxy (works locally, bypasses Adblock)
          if (import.meta.env.DEV) {
            try {
              const targetUrl = `/api/cnbc/quote-html-webservice/restQuote/symbolType/symbol?symbols=${stockSymbols.join('|')}&requestMethod=itv&noform=1&fund=1&exthrs=1&output=json`;
              const res = await fetch(targetUrl);
              if (!res.ok) throw new Error(`CNBC proxy returned ${res.status}`);
              const cnbcData = await res.json();
              
              let quotes = cnbcData?.FormattedQuoteResult?.FormattedQuote || [];
              if (!Array.isArray(quotes)) quotes = [quotes]; 
              
              const tvFormatData = [];
              for (const q of quotes) {
                if (!q || !q.symbol) continue;
                
                const extQuote = q.ExtendedMktQuote;
                const livePriceStr = extQuote?.last || q.last;
                const liveChangeStr = extQuote?.change_pct || q.change_pct;
                
                const livePrice = parseFloat(String(livePriceStr || '').replace(/,/g, ''));
                const liveChange = parseFloat(String(liveChangeStr || '0').replace('%', ''));
                
                if (isNaN(livePrice)) continue;
                
                tvFormatData.push({
                  d: [
                    q.symbol, // name
                    parseFloat(q.previous_day_closing), // close
                    q.curmktstatus === 'PRE_MKT' ? livePrice : null, // premarket_close
                    q.curmktstatus === 'PRE_MKT' ? liveChange : null, // premarket_change
                    q.curmktstatus === 'POST_MKT' ? livePrice : null, // postmarket_close
                    q.curmktstatus === 'POST_MKT' ? liveChange : null, // postmarket_change
                    q.shortName || q.name || q.symbol // description
                  ]
                });
              }
              data = { data: tvFormatData };
            } catch (cnbcErr) {
              console.warn("Both TradingView and CNBC Proxy failed", cnbcErr);
              return;
            }
          } else {
            console.warn("TradingView fetch failed in PROD (cards will use Finnhub):", tvErr);
            return;
          }
        }

        if (stopped) return;
        if (!data || !data.data || data.data.length === 0) return;

        // Pick the column that matches the clock session — never infer the
        // session from which column happens to be non-null (stale pre/post
        // columns linger for hours and used to flip badges the wrong way).
        const session = usMarketState;
        if (session !== 'PRE' && session !== 'POST') return;

        const updates = {};
        for (const item of data.data) {
          if (!item || !Array.isArray(item.d) || item.d.length < 7) continue; // malformed row: skip
          const [name, , preClose, preChange, postClose, postChange, desc] = item.d;
          const livePrice = session === 'PRE' ? preClose : postClose;
          const liveChange = session === 'PRE' ? preChange : postChange;
          if (livePrice === null || livePrice === undefined) continue;

          updates[name] = {
            price: livePrice,
            changePercent: liveChange,
            name: desc || name,
            // no marketState here — badges belong to the clock (sessionLoop)
          };
        }

        for (const [symbol, updateData] of Object.entries(updates)) {
          applyJittered(symbol, PREMARKET_INTERVAL * JITTER_FRACTION, () => setData(prev => ({
            ...prev,
            [symbol]: {
              ...(prev[symbol] || {}),
              ...updateData,
              // Do not let TradingView overwrite the Finnhub-enriched name.
              // Keep the existing name if it's already enriched (longer than just the ticker symbol).
              name: (prev[symbol]?.name && prev[symbol].name !== symbol) ? prev[symbol].name : updateData.name,
              recovering: false,
              quoteUpdatedAt: Date.now(),
            },
          })));
        }
      };

        // Every loop swallows its own errors and always reschedules —
        // a single bad response must never silently kill a data feed
        // mid-stream.
        // 2b-1. 52-week high/low (Finnhub basic financials, direct CORS).
      //       Reference levels for the 52주 신고가/신저가 celebration —
      //       fetched once per boot and refreshed every 6h for marathon
      //       sessions. Missing data just means no banner, never an error.
      const fetchMetrics = async () => {
        let results;
        if (MARKET_API_BASE) {
          const payload = await fetchMarketApi(`/v1/metrics?symbols=${encodeURIComponent(stockSymbols.join(','))}`);
          results = stockSymbols.map((symbol) => {
            const metric = payload?.metrics?.[symbol]?.data;
            return metric
              ? { status: 'fulfilled', value: { symbol, high: metric.week52High, low: metric.week52Low } }
              : { status: 'rejected', reason: new Error(`metric unavailable for ${symbol}`) };
          });
        } else {
          results = await Promise.allSettled(stockSymbols.map(async (symbol) => {
            const res = await fetchFinnhub(`/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, symbol);
            if (!res.ok) throw new Error(`metric ${res.status}`);
            const metric = (await res.json())?.metric;
            return { symbol, high: metric?.['52WeekHigh'], low: metric?.['52WeekLow'] };
          }));
        }
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const { symbol, high, low } = result.value;
          if (typeof high !== 'number' && typeof low !== 'number') continue;
          if (stopped) return;
          setData(prev => ({
            ...prev,
            [symbol]: {
              ...(prev[symbol] || {}),
              week52High: typeof high === 'number' ? high : prev[symbol]?.week52High,
              week52Low: typeof low === 'number' ? low : prev[symbol]?.week52Low,
            },
          }));
        }
      };
      const metricsLoop = async () => {
        if (stopped) return;
        try { await fetchMetrics(); } catch (err) { console.error('metrics loop:', err); }
        if (stopped) return;
        metricsTimer = setTimeout(metricsLoop, 6 * 3600000);
      };
      metricsLoop();

      let quoteBackoff = 1;
      const quoteLoop = async () => {
          if (stopped) return;
          let okCount = 0;
          try { okCount = await fetchQuotes(); } catch (err) {
            console.error('quote loop:', err);
            markRestUnavailable();
          }
          if (stopped) return;
          // CLOSED: prices are frozen, so throttle way down (kept alive at
          // 10min for the overnight previous-close rollover and staleness
          // detection) — but only once the first paint is complete, so a
          // transient bad response at boot retries fast, not in 10min.
          // Session changes kick an immediate fetch below.
          if (usMarketState === 'CLOSED' && quotesComplete) {
            quoteBackoff = 1;
            quoteTimer = setTimeout(quoteLoop, 600000);
            return;
          }
          // A fully-failed cycle (rate-limit/outage) backs the interval off up
          // to 4× so we stop hammering a throttled endpoint; any success resets.
          quoteBackoff = okCount === 0 ? Math.min(quoteBackoff * 2, 4) : 1;
          quoteTimer = setTimeout(quoteLoop, quoteIntervalMs(stockSymbols.length) * quoteBackoff);
        };
        quoteLoop();

        const preMarketLoop = async () => {
          if (stopped) return;
          try { await fetchPreMarket(); } catch (err) { console.error('extended-hours loop:', err); }
          if (stopped) return;
          preMarketTimer = setTimeout(preMarketLoop, PREMARKET_INTERVAL); // extended-hours scanner poll
        };
        preMarketLoop();

      // 2b-2. Session handling — the NY clock is the single authority for
      //       PRE/REGULAR/POST/CLOSED (badges AND baselines). Finnhub is
      //       consulted separately, low-frequency, only for holiday closures
      //       (its isOpen is false during normal pre/after hours too, so it
      //       must never drive the session by itself).
      const applySessionToData = (session, upcoming, countdown) => {
        if (!session) return;
        setData(prev => {
          const next = { ...prev };
          for (const sym of stockSymbols) {
            const cur = next[sym] || {};
            if (cur.marketState === session && cur.upcomingState === upcoming && cur.countdown === countdown) continue;
            const updated = { ...cur, marketState: session, upcomingState: upcoming, countdown };
            // Baseline rules on live transitions ("최근 정규장 종가" 기준):
            //   -> PRE / REGULAR : vs previous regular close (continuous at 09:30)
            //   -> POST          : vs today's regular close (resets to ~0% at 16:00)
            //   -> CLOSED        : freeze what is displayed (no jump at 20:00)
            if (session !== 'CLOSED' && typeof cur.price === 'number' && cur.previousClose) {
              updated.changePercent =
                calcChange(cur.price, cur.regularMarketPrice, cur.previousClose, session) ?? cur.changePercent;
            }
            next[sym] = updated;
          }
          return next;
        });
      };
      applySessionToData(usMarketState, usUpcomingState, usCountdown); // badge correct from the first paint

      const sessionLoop = () => {
        if (stopped) return;
        try {
          const detailed = calcNySessionDetailed();
          const s = holidayClosed ? 'CLOSED' : detailed?.current;
          const u = holidayClosed ? null : detailed?.upcoming;
          const c = holidayClosed ? null : detailed?.countdown;
          if ((s && s !== usMarketState) || u !== usUpcomingState || c !== usCountdown) {
            const stateChanged = s !== usMarketState;
            usMarketState = s;
            usUpcomingState = u;
            usCountdown = c;
            applySessionToData(s, u, c);
            // Leaving CLOSED (04:00 pre-market open): resume quotes right away
            // instead of waiting out the 10min overnight timer
            if (stateChanged && s !== 'CLOSED') {
              clearTimeout(quoteTimer);
              quoteLoop();
            }
          }
        } catch (err) { console.error('session loop:', err); }
        statusTimer = setTimeout(sessionLoop, 1000); // 1s poll for precise countdown and boundary flips
      };
      statusTimer = setTimeout(sessionLoop, 1000);

      const holidayLoop = async () => {
        // The verdict only matters while the clock says the regular session
        // should be running — skip the network call entirely on weekends
        // and overnight, when the clock already decides CLOSED by itself.
        if (calcNySession() === 'REGULAR') {
          try {
            const s = MARKET_API_BASE
              ? (await fetchMarketApi('/v1/market-status')).data
              : await (async () => {
                const res = await fetchFinnhub('/api/v1/stock/market-status?exchange=US');
                return res.ok ? res.json() : null;
              })();
            if (s && typeof s.isOpen === 'boolean') {
              // isOpen=false during regular hours means a holiday / early close
              holidayClosed = !s.isOpen;
            }
          } catch { /* keep previous verdict */ }
        } else {
          holidayClosed = false;
        }
        if (stopped) return;
        holidayTimer = setTimeout(holidayLoop, 300000);
      };
      holidayLoop();

      // 2c. Chart and company-name enrichment. This stays entirely on the
      // optional Cloudflare/Finnhub path: no Yahoo request or public CORS
      // proxy is sent from a production widget, so proxy-wide 429s cannot
      // remove a chart while its price is still live.
      const fetchMarketCharts = async () => {
        if (!MARKET_API_BASE) return;
        const payload = await fetchMarketApi(`/v1/charts?symbols=${encodeURIComponent(stockSymbols.join(','))}`);
        if (stopped) return;
        const charts = payload?.charts || {};
        const updates = {};
        for (const symbol of stockSymbols) {
          const chart = charts[symbol]?.data;
          const closes = chart?.closes;
          if (!Array.isArray(closes) || closes.length < 2) continue;
          const cached = readSparkCache(symbol);
          updates[symbol] = {
            closes: downsample(closes, MAX_SPARK_POINTS),
            name: typeof chart.name === 'string' && chart.name ? chart.name : (cached?.name || symbol),
            previousClose: cached?.previousClose,
          };
          writeSparkCache(symbol, { ...updates[symbol], t: Date.now() });
        }
        if (Object.keys(updates).length === 0) return;
        setData(prev => {
          const next = { ...prev };
          for (const [symbol, update] of Object.entries(updates)) {
            const current = next[symbol] || {};
            next[symbol] = {
              ...current,
              closes: update.closes,
              name: update.name || current.name || symbol,
              previousClose: current.previousClose ?? update.previousClose,
            };
          }
          return next;
        });
      };

      const fetchEnrichment = async () => {
        // If the chart route is unavailable, retain a cached line or leave it
        // empty rather than routing production traffic back to Yahoo.
        try { await fetchMarketCharts(); } catch { /* keep existing chart */ }
      };

      const enrichLoop = async () => {
        try { await fetchEnrichment(); } catch (err) { console.error('enrichment loop:', err); }
        if (stopped) return;
        enrichTimer = setTimeout(enrichLoop, pickEnrichInterval(usMarketState));
      };
      enrichLoop();
    }

      return () => {
        stopped = true;
        if (quoteTimer) clearTimeout(quoteTimer);
        if (preMarketTimer) clearTimeout(preMarketTimer);
        if (enrichTimer) clearTimeout(enrichTimer);
        if (statusTimer) clearTimeout(statusTimer);
        if (holidayTimer) clearTimeout(holidayTimer);
        if (metricsTimer) clearTimeout(metricsTimer);
        jitterTimers.forEach(clearTimeout);
        if (finnhubReconnectTimer) clearTimeout(finnhubReconnectTimer);
        try { if (finnhubWs) finnhubWs.close(); } catch { /* ignore */ }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demoQuery]);

  const displayData = { ...data };
  if (symbols && Array.isArray(symbols)) {
    symbols.forEach(s => {
      if (!displayData[s]) {
        displayData[s] = { name: s, stale: true };
      }
    });
  }

  return { data: displayData, error };
};
