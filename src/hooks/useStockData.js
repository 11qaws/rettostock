import { useState, useEffect } from 'react';

const API_KEY = 'd97qbr1r01qng2np5cigd97qbr1r01qng2np5cj0';
const MAX_SPARK_POINTS = 48;

// Polling interval by market state (ms)
const POLL_INTERVALS = {
  REGULAR: 8000,
  PRE: 30000,
  PREPRE: 30000,
  POST: 30000,
  POSTPOST: 30000,
  CLOSED: 120000,
};

const pickPollInterval = (states) => {
  if (states.some(s => s === 'REGULAR')) return POLL_INTERVALS.REGULAR;
  if (states.some(s => s && s !== 'CLOSED')) return POLL_INTERVALS.PRE;
  return POLL_INTERVALS.CLOSED;
};

const downsample = (arr, max) => {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
};

const fetchViaProxy = async (targetUrl) => {
  // Primary: allorigins. Fallback: corsproxy.io
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, { cache: 'no-store' });
    const proxyData = await res.json();
    return JSON.parse(proxyData.contents);
  } catch {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, { cache: 'no-store' });
    return await res.json();
  }
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
    let pollTimer = null;
    let stopped = false;
    const failCounts = {};
    const marketStates = {};

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
      // Finnhub WebSocket for live trade prices
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
              next[sym] = { ...next[sym], price, name: next[sym]?.name || sym, isCrypto: false, stale: false };
            }
            return next;
          });
        }
      };

      // Yahoo polling: names, changePercent, marketState, sparkline closes
      const fetchStocks = async () => {
        const fetchedUpdates = {};
        for (const symbol of stockSymbols) {
          try {
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d&t=${Date.now()}`;
            const result = await fetchViaProxy(targetUrl);

            if (result.chart?.result?.length > 0) {
              const chart = result.chart.result[0];
              const quote = chart.meta;
              const currentPrice = quote.regularMarketPrice;
              const previousClose = quote.chartPreviousClose;
              const changePercent = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
              const rawCloses = (chart.indicators?.quote?.[0]?.close || []).filter(v => v !== null && v !== undefined);

              fetchedUpdates[symbol] = {
                price: currentPrice,
                changePercent,
                name: quote.shortName || symbol,
                marketState: quote.marketState || 'REGULAR',
                closes: downsample(rawCloses, MAX_SPARK_POINTS),
              };
              failCounts[symbol] = 0;
              marketStates[symbol] = quote.marketState;
            }
          } catch (err) {
            failCounts[symbol] = (failCounts[symbol] || 0) + 1;
            console.error(`Error fetching data for ${symbol}:`, err);
          }
        }
        if (stopped) return;
        setData(prev => {
          const next = { ...prev };
          for (const [sym, update] of Object.entries(fetchedUpdates)) {
            next[sym] = {
              // Finnhub live price wins if already streaming
              price: next[sym]?.price ?? update.price,
              changePercent: update.changePercent,
              name: update.name,
              isCrypto: false,
              marketState: update.marketState,
              closes: update.closes,
              stale: false,
            };
            // Outside regular hours Finnhub is silent; trust Yahoo price
            if (update.marketState !== 'REGULAR') next[sym].price = update.price;
          }
          // Mark repeatedly-failing symbols as stale (keep last data visible)
          for (const sym of stockSymbols) {
            if ((failCounts[sym] || 0) >= 3 && next[sym]) next[sym] = { ...next[sym], stale: true };
          }
          return next;
        });
      };

      const loop = async () => {
        await fetchStocks();
        if (stopped) return;
        pollTimer = setTimeout(loop, pickPollInterval(Object.values(marketStates)));
      };
      loop();
    }

    return () => {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (btcWs) btcWs.close();
      if (finnhubWs) finnhubWs.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, demo]);

  return { data, error };
};
