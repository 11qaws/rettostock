import { useState, useEffect } from 'react';

export const useStockData = (symbols) => {
  const [data, setData] = useState({});
  const [error, setError] = useState(null);
  const apiKey = 'd97qbr1r01qng2np5cigd97qbr1r01qng2np5cj0';

  useEffect(() => {
    if (!symbols || symbols.length === 0) return;

    let btcWs = null;
    let finnhubWs = null;

    // 1. Setup Binance WebSocket for Crypto
    const cryptoSymbols = symbols.filter(s => s.toUpperCase() === 'BTC');
    if (cryptoSymbols.includes('BTC') || cryptoSymbols.includes('BTCUSDT')) {
      btcWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
      btcWs.onmessage = (event) => {
        const result = JSON.parse(event.data);
        setData(prev => ({
          ...prev,
          ['BTC']: {
            price: parseFloat(result.c),
            changePercent: parseFloat(result.P),
            name: 'Bitcoin (USD)',
            isCrypto: true,
          }
        }));
      };
    }

    // 2. Setup Stocks
    const stockSymbols = symbols.filter(s => s.toUpperCase() !== 'BTC');
    let pollInterval = null;

    if (stockSymbols.length > 0) {
      if (apiKey) {
        // Use Finnhub WebSocket for TRULY live US Stocks
        finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
        
        finnhubWs.onopen = () => {
          stockSymbols.forEach(symbol => {
            finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol: symbol }));
          });
        };

        finnhubWs.onmessage = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === 'trade' && response.data && response.data.length > 0) {
            // Finnhub trade data doesn't include changePercent easily without REST call.
            // But we can just update price live.
            const trades = response.data;
            const updates = {};
            trades.forEach(trade => {
              updates[trade.s] = {
                price: trade.p,
                name: trade.s,
                isCrypto: false,
                // We leave changePercent undefined or fetch it once via REST
              };
            });
            
            setData(prev => {
              const next = { ...prev };
              for (const [sym, update] of Object.entries(updates)) {
                next[sym] = {
                  ...next[sym], // Keep previous changePercent if exists
                  price: update.price,
                  name: next[sym]?.name && next[sym].name !== sym ? next[sym].name : update.name,
                  isCrypto: update.isCrypto
                };
              }
              return next;
            });
          }
        };
        
        // Also fetch initial data from Yahoo to get names and changePercent
      }

      // Fallback or Initial fetch using Yahoo Polling (10s interval to prevent block)
      const fetchStocks = async () => {
        const fetchedUpdates = {};
        for (const symbol of stockSymbols) {
          try {
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d&t=${Date.now()}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            const res = await fetch(proxyUrl, { cache: 'no-store' });
            const proxyData = await res.json();
            const result = JSON.parse(proxyData.contents);
            
            if (result.chart.result && result.chart.result.length > 0) {
              const quote = result.chart.result[0].meta;
              const currentPrice = quote.regularMarketPrice;
              const previousClose = quote.chartPreviousClose;
              const changePercent = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
              
              fetchedUpdates[symbol] = {
                price: currentPrice, // If Finnhub is running, this will quickly get overwritten by live data
                changePercent: changePercent,
                name: quote.shortName || symbol,
                isCrypto: false,
              };
            }
          } catch (err) {
            console.error(`Error fetching data for ${symbol}:`, err);
          }
        }
        setData(prev => {
          const next = { ...prev };
          for (const [sym, update] of Object.entries(fetchedUpdates)) {
            // If we have live finnhub data, don't overwrite price, only name/changePercent
            next[sym] = {
              price: apiKey && next[sym]?.price ? next[sym].price : update.price,
              changePercent: update.changePercent,
              name: update.name,
              isCrypto: update.isCrypto
            };
          }
          return next;
        });
      };

      fetchStocks();
      // Poll every 3 seconds (Yahoo) to compensate for Finnhub's BATS-only free tier limits.
      pollInterval = setInterval(fetchStocks, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (btcWs) btcWs.close();
      if (finnhubWs) finnhubWs.close();
    };
  }, [symbols.join(','), apiKey]);

  return { data, error };
};
