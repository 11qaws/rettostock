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

// Finnhub session -> our badge states
const SESSION_MAP = { 'pre-market': 'PRE', regular: 'REGULAR', 'post-market': 'POST' };

const calcChange = (price, regClose, prevClose, marketState) => {
  if (typeof price !== 'number') return undefined;
  // PRE/POST market changes are relative to the regular market close (which is yesterday's close in PRE, and today's close in POST)
  // REGULAR market changes are relative to the previous day's close
  const isExtended = marketState === 'PRE' || marketState === 'POST' || marketState === 'POSTPOST';
  const baseline = (isExtended && typeof regClose === 'number' && regClose > 0) ? regClose : prevClose;
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
const PROXY_LIST = [
  'https://api.allorigins.win/raw?url={url}',
  'https://api.allorigins.win/get?url={url}',
  'https://corsproxy.io/?{url}',
  'https://thingproxy.freeboard.io/fetch/{url}'
];

const PROXIES = [
  (u) => ({ url: `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, unwrap: async (res) => JSON.parse((await res.json()).contents) }),
  (u) => ({ url: `https://corsproxy.io/?url=${encodeURIComponent(u)}`, unwrap: (res) => res.json() }),
  (u) => ({ url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, unwrap: (res) => res.json() }),
];

const fetchViaProxy = async (targetUrl) => {
  // If running locally in dev mode, use Vite's built-in proxy to bypass CORS directly
  if (import.meta.env.DEV) {
    if (targetUrl.includes('quote.cnbc.com')) {
      const localUrl = targetUrl.replace('https://quote.cnbc.com', '/rettostock/api/cnbc');
      const res = await fetch(localUrl, { cache: 'no-store' });
      if (res.ok) return res.json();
    }
    if (targetUrl.includes('query1.finance.yahoo.com')) {
      const localUrl = targetUrl.replace('https://query1.finance.yahoo.com', '/rettostock/api/yahoo');
      const res = await fetch(localUrl, { cache: 'no-store' });
      if (res.ok) return res.json();
    }
  }

  let lastErr;
  for (const make of PROXIES) {
    try {
      const { url, unwrap } = make(targetUrl);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      return await unwrap(res);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
};

// Deterministic tiny hash for demo prices
const hashCode = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const useStockData = (symbols, demo = false) => {
  const [data, setData] = useState({});
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
    let enrichTimer = null;
    let statusTimer = null;
    let stopped = false;
    const failCounts = {};
    let usMarketState = null;

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
            const newPrice = cur.price ?? q.c; // keep live price if available, else fallback to quote
            next[symbol] = {
              ...cur,
              price: newPrice,
              previousClose: q.pc,
              regularMarketPrice: q.c,
              changePercent: calcChange(newPrice, q.c, q.pc, cur.marketState) ?? cur.changePercent,
              name: cur.name || symbol,
              isCrypto: false,
              stale: false,
            };
          }
          return next;
        });
      };
      // 2c. Extended Hours data via TradingView Scanner
      const fetchPreMarket = async () => {
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
                const isExt = q.curmktstatus === 'PRE_MKT' || q.curmktstatus === 'POST_MKT';
                if (!isExt) continue;
                
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
        
        const updates = {};
        for (const item of data.data) {
          const [name, close, preClose, preChange, postClose, postChange, desc] = item.d;
          
          let livePrice = null;
          let liveChange = null;
          let marketState = 'REGULAR';
          
          if (preClose !== null && preClose !== undefined) {
            livePrice = preClose;
            liveChange = preChange;
            marketState = 'PRE';
          } else if (postClose !== null && postClose !== undefined) {
            livePrice = postClose;
            liveChange = postChange;
            marketState = 'POST';
          }
          
          if (marketState === 'REGULAR') continue;

          updates[name] = {
            price: livePrice, 
            changePercent: liveChange,
            name: desc || name,
            marketState: marketState
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
        await fetchPreMarket();
        quoteTimer = setTimeout(quoteLoop, 8000);
      };
      quoteLoop();

      // 2b-2. US market session (pre/regular/post/closed) — one direct
      //       Finnhub call covers every US symbol. Yahoo's chart meta has
      //       no marketState field, so this is the real source.
      const statusLoop = async () => {
        try {
          const res = await fetch(
            `https://api.finnhub.io/api/v1/stock/market-status?exchange=US&token=${API_KEY}`,
            { cache: 'no-store' }
          );
          const s = await res.json();
          usMarketState = s && s.session ? (SESSION_MAP[s.session] || 'REGULAR') : 'CLOSED';
        } catch { /* keep previous state */ }
        if (stopped) return;
        if (usMarketState) {
          setData(prev => {
            const next = { ...prev };
            for (const sym of stockSymbols) {
              const cur = next[sym] || {};
              if (cur.marketState !== usMarketState) {
                next[sym] = { 
                  ...cur, 
                  marketState: usMarketState,
                  // recalculate change if market state flipped (e.g. REGULAR -> POST)
                  changePercent: cur.previousClose ? calcChange(cur.price, cur.regularMarketPrice, cur.previousClose, usMarketState) : cur.changePercent
                };
              }
            }
            return next;
          });
        }
        statusTimer = setTimeout(statusLoop, 60000);
      };
      statusLoop();

      // 2c. Yahoo enrichment via public proxies (slow, non-critical):
      //     company name, market state badge, sparkline closes.
      const fetchEnrichment = async () => {
        for (const symbol of stockSymbols) {
          try {
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d&includePrePost=true&t=${Date.now()}`;
            const result = await fetchViaProxy(targetUrl);
            if (stopped) return;

            if (result.chart?.result?.length > 0) {
              const chart = result.chart.result[0];
              const quote = chart.meta;
              const rawCloses = (chart.indicators?.quote?.[0]?.close || []).filter(v => v !== null && v !== undefined);
              const previousClose = quote.chartPreviousClose;

              setData(prev => {
                const cur = prev[symbol] || {};
                const livePrice = rawCloses.length > 0 ? rawCloses[rawCloses.length - 1] : quote.regularMarketPrice;
                const newPrice = cur.price ?? livePrice;
                const regClose = quote.regularMarketPrice;
                return {
                  ...prev,
                  [symbol]: {
                    ...cur,
                    price: newPrice,
                    previousClose: previousClose,
                    regularMarketPrice: regClose,
                    changePercent: calcChange(newPrice, regClose, previousClose, cur.marketState) ?? cur.changePercent,
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
        }
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
      if (enrichTimer) clearTimeout(enrichTimer);
      if (statusTimer) clearTimeout(statusTimer);
      if (btcWs) btcWs.close();
      if (finnhubWs) finnhubWs.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demo]);

  return { data, error };
};
