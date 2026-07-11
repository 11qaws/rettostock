import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TickerCard from '../components/TickerCard';
import Sparkline from '../components/Sparkline';
import { useStockData } from '../hooks/useStockData';
import { useWidgetSync } from '../hooks/useRemoteSync';
import { AnimatePresence } from 'framer-motion';

// Backwards compat: old URLs used color-red-blue / color-green-red
const normalizeColors = (value) => {
  if (!value || value === 'color-theme-default' || value === 'colors-theme-default') return '';
  return value.replace(/^color-/, 'colors-');
};

const clampNum = (value, min, max, fallback) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const Widget = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const symbolsParam = searchParams.get('symbols');
  const themeParam = searchParams.get('theme') || '';
  const colorsParam = normalizeColors(searchParams.get('colors'));
  const modeParam = searchParams.get('mode') || 'list';
  const roomParam = searchParams.get('room') || '';
  const keyParam = searchParams.get('k') || ''; // remote's public key (relay is signature-gated)
  const demoParam = searchParams.get('demo') === '1';
  const fxParam = ['off', 'soft', 'full'].includes(searchParams.get('fx')) ? searchParams.get('fx') : 'full';

  const intervalParam = clampNum(searchParams.get('interval'), 3, 120, 10);
  const opacityParam = clampNum(searchParams.get('opacity'), 0.1, 1, 1);
  const speedParam = clampNum(searchParams.get('speed'), 0.25, 3, 1);
  // targets=SYM:price,SYM:price — optional per-symbol target lines
  const targets = useMemo(() => {
    const out = {};
    for (const pair of (searchParams.get('targets') || '').split(',')) {
      const [sym, val] = pair.split(':');
      const n = parseFloat(val);
      if (sym && Number.isFinite(n) && n > 0) out[sym.trim().toUpperCase()] = n;
    }
    return out;
  }, [searchParams]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const symbols = useMemo(() => {
    return symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s) : [];
  }, [symbolsParam]);

  const { data } = useStockData(symbols, demoParam);
  const pixel = themeParam === 'theme-retto-pixel';

  useEffect(() => {
    const themeClass = themeParam && themeParam !== 'default' ? themeParam : '';
    if (themeClass) document.body.classList.add(themeClass);
    if (colorsParam) document.body.classList.add(colorsParam);
    return () => {
      if (themeClass) document.body.classList.remove(themeClass);
      if (colorsParam) document.body.classList.remove(colorsParam);
    };
  }, [themeParam, colorsParam]);

  // Remote control sync: BroadcastChannel/localStorage (same browser),
  // dev API (localhost), ntfy relay (cross-device via room code)
  useWidgetSync(roomParam, keyParam, (payload) => {
    try {
      const newUrlObj = new URL(payload.url, window.location.origin);
      const newParams = new URLSearchParams(newUrlObj.hash.split('?')[1] || '');
      const newTargets = newParams.get('targets');
      
      const currentParams = new URLSearchParams(searchParams);
      const currentTargets = currentParams.get('targets');
      
      if (newTargets !== currentTargets) {
        if (newTargets) {
          currentParams.set('targets', newTargets);
        } else {
          currentParams.delete('targets');
        }
        navigate(`?${currentParams.toString()}`, { replace: true });
      }
    } catch { /* ignore */ }
  });

  // Rotation logic
  const snapshotPrices = useRef({});
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
    }, intervalParam * 1000);

    return () => clearInterval(interval);
  }, [modeParam, symbols, intervalParam]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [symbols.length]);

  const rootClass = `widget-root mode-${modeParam} fx-${fxParam}`;
  const rootStyle = { '--card-opacity': opacityParam };

  if (symbols.length === 0) {
    return (
      <div className={rootClass} style={rootStyle}>
        <div className="glass-card empty-card">
          <span className="neon-title">종목이 없어요</span>
          <p className="neon-subtitle">리모컨 페이지에서 종목을 추가해 주세요</p>
        </div>
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
        previousClose={ticker?.previousClose}
        regularMarketPrice={ticker?.regularMarketPrice}
        name={ticker?.name || 'Loading...'}
        marketState={ticker?.marketState}
        upcomingState={ticker?.upcomingState}
        week52High={ticker?.week52High}
        week52Low={ticker?.week52Low}
        targetPrice={targets[symbol]}
        closes={ticker?.closes}
        stale={ticker?.stale}
        fx={fxParam}
        pixel={pixel}
        loopPrevPrice={loopPrevPrice}
        initial={modeParam === 'rotate' ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        exit={modeParam === 'rotate' ? { opacity: 0, y: -20, position: 'absolute', top: 0, left: 0, width: '100%' } : undefined}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      />
    );
  };

  // Marquee: one line, electronic-board style infinite scroll
  if (modeParam === 'scroll') {
    const repeat = Math.max(3, Math.ceil(24 / symbols.length));
    const half = Array.from({ length: repeat }, (_, r) => symbols.map(s => ({ s, k: `${s}-${r}` }))).flat();
    const duration = `${(half.length * 5) / speedParam}s`;

    const renderInline = (item, trackId) => {
      const ticker = data[item.s];
      const isUp = ticker?.changePercent > 0;
      const isDown = ticker?.changePercent < 0;
      const colorClass = isUp ? 'text-up' : (isDown ? 'text-down' : '');
      return (
        <div className="ticker-inline glass-card" key={`${trackId}-${item.k}`}>
          <span className="neon-title">{item.s}</span>
          <span className="neon-price">
            ${typeof ticker?.price === 'number' ? ticker.price.toFixed(2) : '---'}
          </span>
          <span className={`neon-change ${colorClass}`}>
            {isUp ? '▲' : isDown ? '▼' : ''}
            {typeof ticker?.changePercent === 'number'
              ? ` ${ticker.changePercent > 0 ? '+' : ''}${ticker.changePercent.toFixed(2)}%`
              : ' ---'}
          </span>
          {ticker?.closes && ticker.closes.length > 1 && (
            <span className={`inline-spark ${colorClass}`}>
              <Sparkline data={ticker.closes} baseline={ticker?.previousClose} pixel={pixel} />
            </span>
          )}
        </div>
      );
    };

    return (
      <div className={rootClass} style={rootStyle}>
        <div className="marquee-viewport">
          <div className="marquee-track" style={{ '--marquee-dur': duration }}>
            {half.map(item => renderInline(item, 'a'))}
          </div>
          <div className="marquee-track" style={{ '--marquee-dur': duration }} aria-hidden="true">
            {half.map(item => renderInline(item, 'b'))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass} style={rootStyle}>
      <div style={{ position: 'relative', width: '100%' }}>
        {modeParam === 'rotate' ? (
          <AnimatePresence mode="popLayout">
            {renderCard(symbols[currentIndex % symbols.length])}
          </AnimatePresence>
        ) : (
          symbols.map(symbol => renderCard(symbol))
        )}
      </div>
    </div>
  );
};

export default Widget;
