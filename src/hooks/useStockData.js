import { useState, useEffect } from 'react';

const API_KEY = 'd97qbr1r01qng2np5cigd97qbr1r01qng2np5cj0';
const MAX_SPARK_POINTS = 48;

// Yahoo enrichment (name, market state, sparkline) polling interval by market state (ms).
// Prices come from Finnhub directly, so this can stay slow and proxy-friendly.
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

// Session by the New York clock — drives badges and baselines.
// marketCalendar knows weekends, NYSE holidays (with substitute rules)
// and 13:00 half days; Finnhub remains only as a backstop for ad-hoc
// closures no calendar can predict (mourning days, disasters).
import { calcNySession } from '../utils/marketCalendar';

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

// Public CORS proxies are flaky; try several in order.
const PROXIES = [
  (u) => ({ url: `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, unwrap: async (res) => JSON.parse((await res.json()).contents) }),
  (u) => ({ url: `https://corsproxy.io/?url=${encodeURIComponent(u)}`, unwrap: (res) => res.json() }),
  (u) => ({ url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, unwrap: (res) => res.json() }),
];

// A hung proxy must fail fast so the next one gets its turn
const fetchWithTimeout = (url, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

const fetchViaProxy = async (targetUrl) => {
  // If running locally in dev mode, use Vite's built-in proxy to bypass CORS directly
  if (import.meta.env.DEV) {
    // Vite dev proxies are mounted at the server root, not under the app base
    if (targetUrl.includes('quote.cnbc.com')) {
      const localUrl = targetUrl.replace('https://quote.cnbc.com', '/api/cnbc');
      const res = await fetchWithTimeout(localUrl, 4000).catch(() => null);
      if (res && res.ok) return res.json();
    }
    if (targetUrl.includes('query1.finance.yahoo.com')) {
      const localUrl = targetUrl.replace('https://query1.finance.yahoo.com', '/api/yahoo');
      const res = await fetchWithTimeout(localUrl, 4000).catch(() => null);
      if (res && res.ok) return res.json();
    }
  }

  let lastErr;
  for (const make of PROXIES) {
    try {
      const { url, unwrap } = make(targetUrl);
      const res = await fetchWithTimeout(url, 5000);
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      return await unwrap(res);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
};

// Last-known sparkline cache: the chart shows up with the first paint
// and gets replaced by fresh data within one enrichment round.
const SPARK_CACHE_PREFIX = 'spark-cache-';
const readSparkCache = (symbol) => {
  try { return JSON.parse(localStorage.getItem(SPARK_CACHE_PREFIX + symbol)); } catch { return null; }
};
const writeSparkCache = (symbol, entry) => {
  try { localStorage.setItem(SPARK_CACHE_PREFIX + symbol, JSON.stringify(entry)); } catch { /* ignore */ }
};

// Deterministic tiny hash for demo prices
const hashCode = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const useStockData = (symbols, demo = false) => {
  const [data, setData] = useState(() => {
    const initial = {};
    if (symbols && Array.isArray(symbols)) {
      symbols.forEach(s => { initial[s] = { name: s, stale: true, isCrypto: s === 'BTC' }; });
    }
    return initial;
  });
  const [error] = useState(null);
  const symbolsKey = symbols.join(',');

  // ---- Demo mode: fake ticking prices, no network ----
  useEffect(() => {
    if (!demo || !symbols || symbols.length === 0) return;

    const state = {};
    symbols.forEach((symbol) => {
      const base = 20 + (hashCode(symbol) % 780);
      const changePercent = ((hashCode(symbol + 'c') % 900) / 100) - 4.5;
      const price = base * (1 + changePercent / 100);
      const closes = [];
      let p = base;
      for (let i = 0; i < MAX_SPARK_POINTS; i++) {
        p *= 1 + (Math.sin(i / 5 + base) + (((hashCode(symbol + i) % 100) / 100) - 0.5) * 2) * 0.004;
        closes.push(p);
      }
      closes[closes.length - 1] = price;
      state[symbol] = { base, price, changePercent, closes };
    });

    const snapshot = () => {
      const next = {};
      for (const [sym, s] of Object.entries(state)) {
        next[sym] = {
          price: s.price,
          changePercent: s.changePercent,
          previousClose: s.base, // sparkline baseline in demo too
          name: `${sym} (데모)`,
          isCrypto: false,
          marketState: 'REGULAR',
          closes: [...s.closes],
          stale: false,
        };
      }
      setData(next);
    };
    snapshot();

    const timer = setInterval(() => {
      for (const s of Object.values(state)) {
        let drift = (Math.random() - 0.5) * 0.4;
        if (Math.random() < 0.03) drift += (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);
        s.changePercent += drift;
        s.price = s.base * (1 + s.changePercent / 100);
        s.closes.push(s.price);
        if (s.closes.length > MAX_SPARK_POINTS) s.closes.shift();
      }
      snapshot();
    }, 1500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demo]);

  // ---- Live mode ----
  useEffect(() => {
    if (demo || !symbols || symbols.length === 0) return;

    let btcWs = null;
    let finnhubWs = null;
    let quoteTimer = null;
    let preMarketTimer = null;
    let enrichTimer = null;
    let statusTimer = null;
    let holidayTimer = null;
    let stopped = false;
    const failCounts = {};
    // Known synchronously from the very first tick — no network round-trip
    // needed before the widget knows which session it is in.
    let usMarketState = calcNySession();
    let holidayClosed = false;

    // 1. Binance WebSocket for BTC
    const cryptoSymbols = symbols.filter(s => s.toUpperCase() === 'BTC');
    if (cryptoSymbols.length > 0) {
      btcWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
      btcWs.onmessage = (event) => {
        const result = JSON.parse(event.data);
        setData(prev => ({
          ...prev,
          BTC: {
            ...prev.BTC,
            price: parseFloat(result.c),
            changePercent: parseFloat(result.P),
            name: 'Bitcoin (USD)',
            isCrypto: true,
            marketState: 'REGULAR',
            stale: false,
          }
        }));
      };
    }

    // 2. Stocks
    const stockSymbols = symbols.filter(s => s.toUpperCase() !== 'BTC');

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
            isCrypto: false,
          };
        }
        return next;
      });
      // 2a. Finnhub WebSocket for live trade ticks
      finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${API_KEY}`);
      finnhubWs.onopen = () => {
        stockSymbols.forEach(symbol => {
          finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol }));
        });
      };
      finnhubWs.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.type === 'trade' && response.data && response.data.length > 0) {
          const updates = {};
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
                isCrypto: false, 
                stale: false 
              };
            }
            return next;
          });
        }
      };

      // 2b. Finnhub REST quotes — primary source for price + changePercent.
      //     Direct CORS fetch, no proxy involved, so cards fill in fast and
      //     keep working even when every public proxy is down.
      const fetchQuotes = async () => {
        const results = await Promise.allSettled(stockSymbols.map(async (symbol) => {
          const res = await fetch(
            `https://api.finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`,
            { cache: 'no-store' }
          );
          if (!res.ok) throw new Error(`quote ${res.status}`);
          return { symbol, q: await res.json() };
        }));
        if (stopped) return;
        setData(prev => {
          const next = { ...prev };
          for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { symbol, q } = r.value;
            if (!q || typeof q.c !== 'number' || q.c <= 0) {
              failCounts[symbol] = (failCounts[symbol] || 0) + 1;
              if (failCounts[symbol] >= 3 && next[symbol]) next[symbol] = { ...next[symbol], stale: true };
              continue;
            }
            failCounts[symbol] = 0;
            const cur = next[symbol] || {};
            const session = usMarketState;
            const common = { ...cur, previousClose: q.pc, name: cur.name || symbol, isCrypto: false, stale: false };

            if (session === 'REGULAR') {
              // Overwrite unconditionally: ETFs missing from the websocket
              // (e.g. SOXL) must refresh here, and q.c is live in regular hours.
              next[symbol] = {
                ...common,
                price: q.c,
                regularMarketPrice: q.c,
                changePercent: calcChange(q.c, q.c, q.pc, 'REGULAR') ?? cur.changePercent,
              };
            } else if (typeof cur.price !== 'number') {
              // First paint before TradingView lands (or when it's blocked).
              next[symbol] = {
                ...common,
                price: q.c,
                changePercent: calcChange(q.c, cur.regularMarketPrice, q.pc, session) ?? cur.changePercent,
              };
            } else {
              // PRE/POST/CLOSED with a price already on screen: q.c is the
              // stale regular-session price here — never let it clobber the
              // extended-hours price (this caused the "182 on load" flash
              // and a 10s/5s price ping-pong against TradingView).
              next[symbol] = common;
            }
          }
          return next;
        });
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

        setData(prev => {
          const next = { ...prev };
          let changed = false;
          for (const [symbol, updateData] of Object.entries(updates)) {
            const cur = next[symbol] || {};
            next[symbol] = {
              ...cur,
              ...updateData,
            };
            changed = true;
          }
          return changed ? next : prev;
        });
      };

        const quoteLoop = async () => {
          if (stopped) return;
          await fetchQuotes();
          if (stopped) return;
          // CLOSED: prices are frozen, so throttle way down (kept alive at
          // 10min for the overnight previous-close rollover and staleness
          // detection). Session changes kick an immediate fetch below.
          quoteTimer = setTimeout(quoteLoop, usMarketState === 'CLOSED' ? 600000 : 10000);
        };
        quoteLoop();

        const preMarketLoop = async () => {
          if (stopped) return;
          await fetchPreMarket();
          preMarketTimer = setTimeout(preMarketLoop, 5000); // 5s for faster pre/post updates
        };
        preMarketLoop();

      // 2b-2. Session handling — the NY clock is the single authority for
      //       PRE/REGULAR/POST/CLOSED (badges AND baselines). Finnhub is
      //       consulted separately, low-frequency, only for holiday closures
      //       (its isOpen is false during normal pre/after hours too, so it
      //       must never drive the session by itself).
      const applySessionToData = (session) => {
        if (!session) return;
        setData(prev => {
          const next = { ...prev };
          for (const sym of stockSymbols) {
            const cur = next[sym] || {};
            if (cur.marketState === session) continue;
            const updated = { ...cur, marketState: session };
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
      applySessionToData(usMarketState); // badge correct from the first paint

      const sessionLoop = () => {
        if (stopped) return;
        const s = holidayClosed ? 'CLOSED' : calcNySession();
        if (s && s !== usMarketState) {
          usMarketState = s;
          applySessionToData(s);
          // Leaving CLOSED (04:00 pre-market open): resume quotes right away
          // instead of waiting out the 10min overnight timer
          if (s !== 'CLOSED') {
            clearTimeout(quoteTimer);
            quoteLoop();
          }
        }
        statusTimer = setTimeout(sessionLoop, 10000); // boundaries flip within 10s
      };
      statusTimer = setTimeout(sessionLoop, 10000);

      const holidayLoop = async () => {
        // The verdict only matters while the clock says the regular session
        // should be running — skip the network call entirely on weekends
        // and overnight, when the clock already decides CLOSED by itself.
        if (calcNySession() === 'REGULAR') {
          try {
            const res = await fetch(
              `https://api.finnhub.io/api/v1/stock/market-status?exchange=US&token=${API_KEY}`,
              { cache: 'no-store' }
            );
            const s = await res.json();
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

      // 2c. Yahoo enrichment via public proxies (slow, non-critical):
      //     company name, market state badge, sparkline closes.
      const fetchEnrichment = async () => {
        // All symbols in parallel: chart latency = one proxy round-trip,
        // not one round-trip per symbol stacked end to end
        await Promise.allSettled(stockSymbols.map(async (symbol) => {
          try {
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d&includePrePost=true&t=${Date.now()}`;
            const result = await fetchViaProxy(targetUrl);
            if (stopped) return;

            if (result.chart?.result?.length > 0) {
              const chart = result.chart.result[0];
              const quote = chart.meta;
              const rawCloses = (chart.indicators?.quote?.[0]?.close || []).filter(v => v !== null && v !== undefined);
              const previousClose = quote.chartPreviousClose;

              if (rawCloses.length > 1) {
                writeSparkCache(symbol, {
                  closes: downsample(rawCloses, MAX_SPARK_POINTS),
                  name: quote.shortName || symbol,
                  previousClose,
                  t: Date.now(),
                });
              }

              setData(prev => {
                const cur = prev[symbol] || {};
                // Use regularMarketPrice directly instead of the last chart close, as chart endpoints are often cached by proxies
                const livePrice = quote.regularMarketPrice;
                const newPrice = cur.price ?? livePrice;
                const regClose = quote.regularMarketPrice;
                return {
                  ...prev,
                  [symbol]: {
                    ...cur,
                    price: newPrice,
                    previousClose: previousClose,
                    regularMarketPrice: regClose,
                    // CLOSED stays frozen — a slow proxy response must not
                    // re-baseline the after-hours change overnight
                    changePercent: cur.marketState === 'CLOSED'
                      ? cur.changePercent
                      : (calcChange(newPrice, regClose, previousClose, cur.marketState) ?? cur.changePercent),
                    name: quote.shortName || cur.name || symbol,
                    closes: downsample(rawCloses, MAX_SPARK_POINTS),
                    isCrypto: false,
                  },
                };
              });
            }
          } catch (err) {
            console.error(`Enrichment failed for ${symbol}:`, err);
          }
        }));
      };

      const enrichLoop = async () => {
        await fetchEnrichment();
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
        if (btcWs) btcWs.close();
        if (finnhubWs) finnhubWs.close();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demo]);

  const displayData = { ...data };
  if (symbols && Array.isArray(symbols)) {
    symbols.forEach(s => {
      if (!displayData[s]) {
        displayData[s] = { name: s, stale: true, isCrypto: s === 'BTC' };
      }
    });
  }

  return { data: displayData, error };
};
