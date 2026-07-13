import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TickerCard from '../components/TickerCard';
import Sparkline from '../components/Sparkline';
import { useStockData } from '../hooks/useStockData';
import { useWidgetSync } from '../hooks/useRemoteSync';
import { fmtPrice } from '../utils/format';
import { surgeTier } from '../utils/effects';
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

const PREVIEW_VARIANTS = ['surge', 'cross', 'target', 'record'];

const Widget = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const symbolsParam = searchParams.get('symbols');
  const urlThemeParam = searchParams.get('theme') || '';
  // No detail parameter means an existing OBS URL retains its original,
  // undecorated rendering. New URLs opt into the static rich treatment.
  const urlThemeDetailParam = searchParams.get('detail') === 'rich' ? 'rich' : 'basic';
  // No shape parameter preserves the legacy, roomier card geometry.
  const urlCardShapeParam = searchParams.get('shape') === 'card' ? 'card' : 'box';
  const urlColorsParam = normalizeColors(searchParams.get('colors'));
  const urlModeParam = searchParams.get('mode') || 'list';
  const roomParam = searchParams.get('room') || '';
  const keyParam = searchParams.get('k') || ''; // remote's public key (relay is signature-gated)
  const demoParam = searchParams.get('demo') === '1';
  const urlEventFocusParam = searchParams.get('event_focus') !== '0';
  const urlPreviewFxToken = searchParams.get('fx_preview') || '';
  // Keep parameter-less legacy OBS URLs on their original Full behavior.
  // Old Calm/Soft/Strong URLs map to the new Weak option.
  const rawFxParam = searchParams.get('fx');
  const urlFxParam = ['calm', 'soft', 'event'].includes(rawFxParam) ? 'card'
    : ['off', 'card', 'full'].includes(rawFxParam) ? rawFxParam : 'full';
  const [previewControl, setPreviewControl] = useState(null);
  const previewControlMode = previewControl?.mode;

  // Configurator previews update all presentation settings in place. OBS
  // sources never receive this message and continue to use only their URL.
  useEffect(() => {
    const onPreviewControl = (event) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.type !== 'RETTOSTOCK_PREVIEW_CONFIG') return;
      const fx = ['full', 'card', 'off'].includes(message.fx) ? message.fx : 'full';
      const mode = ['list', 'rotate', 'scroll'].includes(message.mode) ? message.mode : 'list';
      const detail = message.detail === 'rich' ? 'rich' : 'basic';
      const shape = message.shape === 'card' ? 'card' : 'box';
      const targets = {};
      if (message.targets && typeof message.targets === 'object') {
        for (const [symbol, value] of Object.entries(message.targets)) {
          const price = Number(value);
          if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) && Number.isFinite(price) && price > 0) {
            targets[symbol] = price;
          }
        }
      }
      setPreviewControl({
        theme: typeof message.theme === 'string' ? message.theme : '',
        detail,
        shape,
        colors: typeof message.colors === 'string' ? normalizeColors(message.colors) : '',
        mode,
        interval: clampNum(message.interval, 3, 120, 10),
        eventFocus: message.eventFocus !== false,
        speed: clampNum(message.speed, 0.25, 3, 1),
        opacity: clampNum(message.opacity, 0.1, 1, 1),
        fx,
        targets,
        previewToken: message.previewToken ? String(message.previewToken) : '',
      });
    };
    window.addEventListener('message', onPreviewControl);
    return () => window.removeEventListener('message', onPreviewControl);
  }, []);

  // Handshake after the listener exists. This closes the small race where an
  // iframe's load event can precede its first React effect on a slow device.
  useEffect(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'RETTOSTOCK_PREVIEW_READY' }, window.location.origin);
    }
  }, []);

  // The configurator deliberately waits for this committed render before it
  // shrinks the preview viewport. Without the acknowledgement, List can exist
  // for one paint inside Rotate's 200px or Marquee's 100px frame.
  useEffect(() => {
    if (previewControlMode && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'RETTOSTOCK_PREVIEW_APPLIED',
        mode: previewControlMode,
      }, window.location.origin);
    }
  }, [previewControlMode]);

  const urlIntervalParam = clampNum(searchParams.get('interval'), 3, 120, 10);
  const urlOpacityParam = clampNum(searchParams.get('opacity'), 0.1, 1, 1);
  const urlSpeedParam = clampNum(searchParams.get('speed'), 0.25, 3, 1);
  // targets=SYM:price,SYM:price — optional per-symbol target lines
  const urlTargets = useMemo(() => {
    const out = {};
    for (const pair of (searchParams.get('targets') || '').split(',')) {
      const [sym, val] = pair.split(':');
      const n = parseFloat(val);
      if (sym && Number.isFinite(n) && n > 0) out[sym.trim().toUpperCase()] = n;
    }
    return out;
  }, [searchParams]);

  const themeParam = previewControl?.theme ?? urlThemeParam;
  const themeDetailParam = previewControl?.detail ?? urlThemeDetailParam;
  const cardShapeParam = previewControl?.shape ?? urlCardShapeParam;
  const colorsParam = previewControl?.colors ?? urlColorsParam;
  const modeParam = previewControl?.mode ?? urlModeParam;
  const intervalParam = previewControl?.interval ?? urlIntervalParam;
  const opacityParam = previewControl?.opacity ?? urlOpacityParam;
  const speedParam = previewControl?.speed ?? urlSpeedParam;
  const eventFocusParam = previewControl?.eventFocus ?? urlEventFocusParam;
  const targets = previewControl?.targets ?? urlTargets;
  const fxParam = previewControl?.fx ?? urlFxParam;
  const previewFxToken = previewControl?.previewToken ?? urlPreviewFxToken;

  const [currentIndex, setCurrentIndex] = useState(0);

  const symbols = useMemo(() => {
    // Cap at 10: keeps Finnhub REST polling under the free 60-req/min limit
    // (10 symbols × 5 polls/min = 50) so the feed never rate-limits mid-stream.
    return symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s).slice(0, 10) : [];
  }, [symbolsParam]);

  const demoQuery = demoParam ? searchParams.toString() : false;
  const { data } = useStockData(symbols, demoQuery);

  useEffect(() => {
    const themeClass = themeParam && themeParam !== 'default' ? themeParam : '';
    const detailClass = themeDetailParam === 'rich' ? 'theme-detail-rich' : '';
    if (themeClass) document.body.classList.add(themeClass);
    if (detailClass) document.body.classList.add(detailClass);
    if (colorsParam) document.body.classList.add(colorsParam);
    return () => {
      if (themeClass) document.body.classList.remove(themeClass);
      if (detailClass) document.body.classList.remove(detailClass);
      if (colorsParam) document.body.classList.remove(colorsParam);
    };
  }, [themeParam, themeDetailParam, colorsParam]);

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
  const [focusNonce, setFocusNonce] = useState(0); // bumps to restart the dwell timer after an auto-focus

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (modeParam !== 'rotate' || symbols.length <= 1) return;

    // focusNonce in deps: an auto-focus restarts this timer so the cut-to
    // card gets a full dwell before the rotation resumes.
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
  }, [modeParam, symbols, intervalParam, focusNonce]);

  // Rotate mode auto-focus ("cut to the action"): every symbol is polled even
  // while its card is off-screen, so when a big moment fires on a hidden symbol
  // we jump the rotation to it. Only rare/big events qualify (surge tier climb,
  // 52-week record, target reached); a 6s cooldown prevents thrashing. Minor
  // effects (zero-cross, shake) are intentionally NOT focus-worthy.
  const eventStateRef = useRef({}); // per-symbol { tier, price }
  const lastFocusRef = useRef(0);
  const focusBornRef = useRef(null);
  useEffect(() => {
    if (!eventFocusParam || modeParam !== 'rotate' || symbols.length <= 1) return;
    const prev = eventStateRef.current;
    // Warm-up: at boot every symbol's value lands at once (and can wobble as
    // Finnhub/Yahoo/cache sources settle). Spend the first 5s only recording a
    // baseline — never focusing — so the initial mass-set can't masquerade as a
    // live surge. A symbol that boots already surged becomes the baseline; only
    // a genuine climb afterward earns a cut.
    if (focusBornRef.current === null) focusBornRef.current = Date.now();
    const warm = Date.now() - focusBornRef.current > 5000;
    const curSym = symbols[currentIndex % symbols.length];
    let focusSym = null;
    for (const sym of symbols) {
      const d = data[sym];
      if (!d || typeof d.price !== 'number') continue;
      const tier = surgeTier(d.changePercent);
      const pv = prev[sym];
      if (pv) {
        const surgeUp = tier > pv.tier && tier >= 1;
        const hi = typeof d.week52High === 'number' && d.week52High > 0 && d.price > d.week52High && pv.price <= d.week52High;
        const lo = typeof d.week52Low === 'number' && d.week52Low > 0 && d.price < d.week52Low && pv.price >= d.week52Low;
        const t = targets[sym];
        const tgt = typeof t === 'number' && ((pv.price < t && d.price >= t) || (pv.price > t && d.price <= t));
        if (!focusSym && sym !== curSym && (surgeUp || hi || lo || tgt)) focusSym = sym;
      }
      prev[sym] = { tier, price: d.price };
    }
    if (focusSym && warm && Date.now() - lastFocusRef.current > 6000) {
      lastFocusRef.current = Date.now();
      const idx = symbols.indexOf(focusSym);
      if (idx >= 0) { setCurrentIndex(idx); setFocusNonce(n => n + 1); }
    }
  }, [data, modeParam, symbols, currentIndex, targets, eventFocusParam]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [symbols.length]);

  const rootClass = `widget-root mode-${modeParam} fx-${fxParam} shape-${cardShapeParam}`;
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

  const renderCard = (symbol, previewIndex = 0) => {
    const ticker = data[symbol];
    const loopPrevPrice = snapshotPrices.current[symbol];
    const previewVariant = PREVIEW_VARIANTS[previewIndex % PREVIEW_VARIANTS.length];
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
        countdown={ticker?.countdown}
        week52High={ticker?.week52High}
        week52Low={ticker?.week52Low}
        targetPrice={targets[symbol]}
        closes={ticker?.closes}
        stale={ticker?.stale}
        recovering={ticker?.recovering}
        fx={fxParam}
        previewFxToken={previewFxToken}
        previewFxVariant={previewVariant}
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
        <div className={`ticker-inline glass-card ${ticker?.recovering ? 'is-stale' : ''}`} key={`${trackId}-${item.k}`}>
          <span className="neon-title">{item.s}</span>
          <span className="neon-price">
            ${fmtPrice(ticker?.price)}
          </span>
          <span className={`neon-change ${colorClass}`}>
            {isUp ? '▲' : isDown ? '▼' : ''}
            {typeof ticker?.changePercent === 'number'
              ? ` ${ticker.changePercent > 0 ? '+' : ''}${ticker.changePercent.toFixed(2)}%`
              : ' ---'}
          </span>
          {ticker?.recovering && <span className="recovery-inline" aria-label="저장 시세를 업데이트 중">↻</span>}
          {ticker?.closes && ticker.closes.length > 1 && (
            <span className={`inline-spark ${colorClass}`}>
              <Sparkline data={ticker.closes} baseline={ticker?.previousClose} />
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
            {renderCard(symbols[currentIndex % symbols.length], currentIndex)}
          </AnimatePresence>
        ) : (
          symbols.map((symbol, index) => renderCard(symbol, index))
        )}
      </div>
    </div>
  );
};

export default Widget;
