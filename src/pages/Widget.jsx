import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import TickerCard from '../components/TickerCard';
import { useStockData } from '../hooks/useStockData';
import { motion, AnimatePresence } from 'framer-motion';

const Widget = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const symbolsParam = searchParams.get('symbols');
  const themeParam = searchParams.get('theme') || '';
  const modeParam = searchParams.get('mode') || 'list';
  
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const symbols = useMemo(() => {
    return symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s) : [];
  }, [symbolsParam]);

  const { data } = useStockData(symbols);

  useEffect(() => {
    if (themeParam) {
      document.body.classList.add(themeParam);
    }
    return () => {
      if (themeParam) {
        document.body.classList.remove(themeParam);
      }
    };
  }, [themeParam]);

  // Sync for both GitHub Pages (localStorage/BroadcastChannel) and Local Dev (API Polling)
  useEffect(() => {
    const handleSync = (data) => {
      if (data && data.url) {
        try {
          const newUrlObj = new URL(data.url, window.location.origin);
          if (window.location.hash !== newUrlObj.hash) {
            const hashPath = newUrlObj.hash.replace(/^#/, '');
            navigate(hashPath, { replace: true });
          }
        } catch (e) {}
      }
    };

    // 1. Storage Event Listener
    const handleStorage = (e) => {
      if (e.key === 'obs-widget-sync-data' && e.newValue) {
        try { handleSync(JSON.parse(e.newValue)); } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    // 2. BroadcastChannel Listener
    let channel;
    try {
      channel = new BroadcastChannel('obs-widget-sync');
      channel.onmessage = (e) => handleSync(e.data);
    } catch (err) {}

    // 3. Local API Polling (Only for localhost/127.0.0.1)
    let interval;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      let lastTimestamp = 0;
      const pollSync = async () => {
        try {
          const res = await fetch('http://localhost:5173/api/sync');
          const data = await res.json();
          if (data && data.url && data.timestamp > lastTimestamp) {
            lastTimestamp = data.timestamp;
            handleSync(data);
          }
        } catch (e) {}
      };
      interval = setInterval(pollSync, 1000);
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
      if (interval) clearInterval(interval);
    };
  }, []);

  // Rotation logic
  const snapshotPrices = useRef({});
  const prevIndexRef = useRef(currentIndex);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (modeParam !== 'rotate' || symbols.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        // Snapshot the price of the current symbol before it disappears
        const currentSymbol = symbols[prev];
        if (currentSymbol && dataRef.current[currentSymbol]?.price !== undefined) {
          snapshotPrices.current[currentSymbol] = dataRef.current[currentSymbol].price;
        }
        return (prev + 1) % symbols.length;
      });
    }, 10000); // 10 seconds
    
    return () => clearInterval(interval);
  }, [modeParam, symbols]);

  if (symbols.length === 0) {
    return (
      <div style={{ color: 'white', padding: '20px', textShadow: '0 0 5px black' }}>
        No symbols provided. Use ?symbols=AAPL,TSLA,BTC
      </div>
    );
  }

  const renderCard = (symbol) => {
    const ticker = data[symbol];
    const loopPrevPrice = snapshotPrices.current[symbol];
    return (
      <TickerCard 
        key={symbol}
        symbol={symbol}
        price={ticker?.price}
        changePercent={ticker?.changePercent}
        name={ticker?.name || 'Loading...'}
        isCrypto={ticker?.isCrypto}
        loopPrevPrice={loopPrevPrice}
        initial={modeParam === 'rotate' ? { opacity: 0, y: 20 } : false}
        animate={modeParam === 'rotate' ? { opacity: 1, y: 0 } : false}
        exit={modeParam === 'rotate' ? { opacity: 0, y: -20, position: 'absolute', top: 0, left: 0, width: '100%' } : undefined}
        transition={{ duration: 0.5 }}
      />
    );
  };

  return (
    <div className={themeParam} style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'relative', width: '100%' }}>
        {modeParam === 'rotate' ? (
          <AnimatePresence mode="popLayout">
            {renderCard(symbols[currentIndex])}
          </AnimatePresence>
        ) : (
          symbols.map(symbol => renderCard(symbol))
        )}
      </div>
    </div>
  );
};

export default Widget;
