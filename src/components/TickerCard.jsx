import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import Sparkline from './Sparkline';

const SURGE_THRESHOLD = 5; // |changePercent| >= 5% triggers surge state

const MARKET_LABELS = {
  REGULAR: { text: '장중', cls: 'ms-open' },
  PRE: { text: '프리', cls: 'ms-pre' },
  PREPRE: { text: '프리', cls: 'ms-pre' },
  POST: { text: '애프터', cls: 'ms-post' },
  POSTPOST: { text: '애프터', cls: 'ms-post' },
  CLOSED: { text: '마감', cls: 'ms-closed' },
};

const UP_PARTICLES = ['🔥', '✨', '▲', '💖', '⭐'];
const DOWN_PARTICLES = ['💧', '▼', '💦', '🫧'];

let particleId = 0;

const TickerCard = ({
  symbol, price, changePercent, previousClose, regularMarketPrice, name, marketState, upcomingState, closes, stale,
  week52High, week52Low, targetPrice,
  fx = 'full', pixel = false, showSparkline = true, loopPrevPrice,
  ...motionProps
}) => {
  const [animClass, setAnimClass] = useState('');
  const [priceFlash, setPriceFlash] = useState('');
  const [particles, setParticles] = useState([]);
  const [crossFx, setCrossFx] = useState(null); // 'up' (양전) | 'down' (음전)
  const [fxIntensity, setFxIntensity] = useState(1); // tick effect strength ∝ move size
  const [w52Pop, setW52Pop] = useState(null); // 'high' | 'low' — 52-week record broken
  const w52Ref = useRef({ effHigh: null, effLow: null, bornAt: Date.now(), lastFx: { high: 0, low: 0 } });
  // Reset timers live in refs, NOT in effect cleanups: a fast next tick
  // re-running the effect must never cancel the pending state reset
  // (that stuck the effect state and swallowed future same-direction fires)
  const w52TimerRef = useRef(null);
  const crossTimerRef = useRef(null);
  const targetTimerRef = useRef(null);
  useEffect(() => () => {
    clearTimeout(w52TimerRef.current);
    clearTimeout(crossTimerRef.current);
    clearTimeout(targetTimerRef.current);
  }, []);

  // Target price (스트리머 지정): a milestone. Celebrates once when the
  // price first crosses the target, then auto-disarms — a reached goal is
  // consumed, no repeat nagging. A ±0.15% dead zone keeps boundary noise
  // from flipping the side; editing the target re-arms it silently (a new
  // number never pops on its own).
  const [targetPop, setTargetPop] = useState(null); // { n } — nonce for remount
  const targetRef = useRef({ side: null, lastTarget: null, done: false, bornAt: Date.now() });
  useEffect(() => {
    if (typeof price !== 'number' || typeof targetPrice !== 'number' || targetPrice <= 0) return;
    const t = targetRef.current;

    const margin = targetPrice * 0.0015;
    let side;
    if (price >= targetPrice + margin) side = 1;
    else if (price <= targetPrice - margin) side = -1;
    else side = t.side ?? (price >= targetPrice ? 1 : -1); // inside dead zone: hold

    // Target changed (or first run): re-arm silently
    if (t.lastTarget !== targetPrice) {
      t.lastTarget = targetPrice;
      t.side = side;
      t.done = false;
      return;
    }

    const prev = t.side;
    t.side = side;
    if (prev === null || prev === side) return; // no genuine cross
    if (t.done) return;                         // milestone already reached
    if (Date.now() - t.bornAt < 10000) return;  // warm-up: booting isn't "reaching"
    if (fx === 'off') return;

    t.done = true; // reached — auto-disarm until the target is changed
    clearTimeout(targetTimerRef.current);
    setTargetPop(p => ({ n: (p?.n || 0) + 1 }));
    targetTimerRef.current = setTimeout(() => setTargetPop(null), 2700);

    // If running in the Configurator's preview iframe, notify it to clear the target UI
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'TARGET_REACHED', symbol }, '*');
    }
  }, [price, targetPrice, fx, symbol]);
  const prevPriceRef = useRef(loopPrevPrice !== undefined ? loopPrevPrice : price);
  const prevSurgeRef = useRef(null); // null = no data seen yet
  const prevSignRef = useRef(null);
  const lastCrossRef = useRef(0);

  // Transition animation state
  const prevMarketRef = useRef(marketState);
  const prevUpcomingRef = useRef(upcomingState);
  const [transitioning, setTransitioning] = useState(null);

  useEffect(() => {
    if (prevUpcomingRef.current && !upcomingState && marketState !== prevMarketRef.current) {
      setTransitioning({ from: prevMarketRef.current, to: marketState });
      setTimeout(() => setTransitioning(null), 1000); // 1초 뒤 애니메이션 초기화
    }
    prevUpcomingRef.current = upcomingState;
    prevMarketRef.current = marketState;
  }, [upcomingState, marketState]);

  let changeAbs = null;
  if (typeof price === 'number' && typeof changePercent === 'number') {
    const impliedBaseline = price / (1 + changePercent / 100);
    changeAbs = price - impliedBaseline;
  }

  // Tick animation on price change
  useEffect(() => {
    if (price === undefined || prevPriceRef.current === undefined) {
      prevPriceRef.current = price;
      return;
    }

    // Effect strength follows the size of this tick's move:
    // a 0.02% wiggle barely nudges, a 0.4%+ jump hits full strength
    const prev = prevPriceRef.current;
    if (price !== prev && prev > 0) {
      const movePct = (Math.abs(price - prev) / prev) * 100;
      setFxIntensity(Math.min(1, Math.max(0.15, movePct / 0.4)));
    }

    if (price > prevPriceRef.current) {
      setAnimClass('anim-pump');
      setPriceFlash('price-flash-up');
    } else if (price < prevPriceRef.current) {
      setAnimClass('anim-dump');
      setPriceFlash('price-flash-down');
    }

    const timer = setTimeout(() => {
      setAnimClass('');
      setPriceFlash('');
    }, 600);

    prevPriceRef.current = price;
    return () => clearTimeout(timer);
  }, [price]);

  // Surge detection: particle burst the moment |change| crosses the threshold
  useEffect(() => {
    if (changePercent === undefined || changePercent === null) return;
    const surged = Math.abs(changePercent) >= SURGE_THRESHOLD;

    if (prevSurgeRef.current === null) {
      // First data point: record state without celebrating stale news
      prevSurgeRef.current = surged;
      return;
    }

    if (surged && !prevSurgeRef.current && fx === 'full') {
      const pool = changePercent > 0 ? UP_PARTICLES : DOWN_PARTICLES;
      const burst = Array.from({ length: 14 }, () => ({
        id: ++particleId,
        char: pool[Math.floor(Math.random() * pool.length)],
        dx: `${(Math.random() - 0.5) * 180}px`,
        dy: `${changePercent > 0 ? -(20 + Math.random() * 90) : (20 + Math.random() * 90)}px`,
        rot: `${(Math.random() - 0.5) * 240}deg`,
        delay: `${Math.random() * 0.15}s`,
      }));
      setParticles(burst);
      const timer = setTimeout(() => setParticles([]), 1400);
      prevSurgeRef.current = surged;
      return () => clearTimeout(timer);
    }

    prevSurgeRef.current = surged;
  }, [changePercent, fx]);

  // 52-week record: a rare, big broadcast moment. Fires when the price
  // crosses the 52-week high/low from Finnhub metrics. Guards: 10s
  // warm-up, 5min per-direction cooldown, and each re-fire needs the
  // record beaten by another 0.2% (the running record is tracked locally
  // so a slow climb doesn't spam banners).
  useEffect(() => {
    if (typeof price !== 'number') return;
    const s = w52Ref.current;
    const now = Date.now();
    const warm = now - s.bornAt > 10000;

    const fire = (dir) => {
      clearTimeout(w52TimerRef.current);
      // nonce key remounts the elements so the animation replays even for
      // back-to-back same-direction events (no rAF: it can be frozen)
      setW52Pop(p => ({ dir, n: (p?.n || 0) + 1 }));
      w52TimerRef.current = setTimeout(() => setW52Pop(null), 2700);
    };

    if (typeof week52High === 'number' && week52High > 0) {
      const ref = Math.max(week52High, s.effHigh ?? 0);
      if (price > ref) {
        if (warm && fx !== 'off' && now - s.lastFx.high > 300000) {
          s.lastFx.high = now;
          s.effHigh = price * 1.002; // next banner needs +0.2% on top
          fire('high');
          return;
        }
        s.effHigh = Math.max(s.effHigh ?? 0, price);
      }
    }
    if (typeof week52Low === 'number' && week52Low > 0) {
      const ref = Math.min(week52Low, s.effLow ?? Infinity);
      if (price < ref) {
        if (warm && fx !== 'off' && now - s.lastFx.low > 300000) {
          s.lastFx.low = now;
          s.effLow = price * 0.998;
          fire('low');
          return;
        }
        s.effLow = Math.min(s.effLow ?? Infinity, price);
      }
    }
  }, [price, week52High, week52Low, fx]);

  // Zero-cross (양전/음전): color wipe + sign flip the moment the change
  // flips sign. Tiny values never commit a sign (hysteresis) and a
  // cooldown stops noise around 0% from spamming the effect.
  useEffect(() => {
    if (typeof changePercent !== 'number') return;
    if (Math.abs(changePercent) < 0.05) return; // too small to count as a sign
    const sign = changePercent > 0 ? 1 : -1;
    const prev = prevSignRef.current;
    prevSignRef.current = sign;
    if (prev === null || prev === sign) return;

    if (fx === 'off') return;
    const now = Date.now();
    if (now - lastCrossRef.current < 10000) return;
    lastCrossRef.current = now;

    clearTimeout(crossTimerRef.current);
    setCrossFx(p => ({ dir: sign > 0 ? 'up' : 'down', n: (p?.n || 0) + 1 }));
    crossTimerRef.current = setTimeout(() => setCrossFx(null), 1100);
  }, [changePercent, fx]);

  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const Icon = isUp ? TrendingUp : (isDown ? TrendingDown : Minus);
  const colorClass = isUp ? 'text-up' : (isDown ? 'text-down' : '');
  const surged = typeof changePercent === 'number' && Math.abs(changePercent) >= SURGE_THRESHOLD;
  const surgeClass = surged ? (isUp ? 'is-surge-up' : 'is-surge-down') : '';

  const market = MARKET_LABELS[marketState];

  return (
    <motion.div
      className={`glass-card tick-card ${animClass} ${surgeClass} ${stale ? 'is-stale' : ''}`}
      style={{ '--fx-i': fxIntensity, ...motionProps.style }}
      {...motionProps}
    >
      {particles.map(p => (
        <span
          key={p.id}
          className="fx-particle"
          style={{ '--dx': p.dx, '--dy': p.dy, '--rot': p.rot, animationDelay: p.delay }}
        >
          {p.char}
        </span>
      ))}

      {/* Zero-cross: shimmer wipe + an arrow passing through the card,
          easing off at the center before shooting out (full fx only) */}
      {crossFx && fx === 'full' && (
        <React.Fragment key={`cross-${crossFx.n}`}>
          <span className={`cross-wipe wipe-${crossFx.dir}`} aria-hidden="true" />
          <span className={`cross-arrow arrow-${crossFx.dir}`} aria-hidden="true">
            {crossFx.dir === 'up' ? '▲' : '▼'}
          </span>
        </React.Fragment>
      )}

      {/* 52-week record celebration */}
      {w52Pop && (
        <React.Fragment key={`w52-${w52Pop.n}`}>
          <span className={`w52-ring w52-ring-${w52Pop.dir}`} aria-hidden="true" />
          <span className={`w52-banner w52-${w52Pop.dir}`} aria-hidden="true">
            {w52Pop.dir === 'high' ? '🏆 52주 신고가' : '❄️ 52주 신저가'}
          </span>
        </React.Fragment>
      )}

      {/* Target price reached (opt-in) */}
      {targetPop && (
        <React.Fragment key={`target-${targetPop.n}`}>
          <span className="w52-ring target-ring" aria-hidden="true" />
          <span className="w52-banner target-banner" aria-hidden="true">
            🎯 목표가 ${typeof targetPrice === 'number' ? targetPrice.toFixed(2) : ''}
          </span>
        </React.Fragment>
      )}

      <div className="card-row">
        <div className="card-left">
          <div className="card-symbol-row">
            <h3 className="neon-title">{symbol}</h3>
          </div>
          <p className="neon-subtitle">{name}</p>
        </div>

        <div className="card-right">
          {(surged || market) && (
            <div className="badge-row">
              {surged && fx !== 'off' && (
                <span className="surge-badge">{isUp ? '🔥' : '💦'}</span>
              )}
              {market && (
                <span className={`market-badge ${market.cls}`}>
                  {upcomingState && MARKET_LABELS[upcomingState] ? (
                    <span className="transition-slide-in">
                      {market.text} <span className="blink-arrows">&gt;&gt;</span> {MARKET_LABELS[upcomingState].text}
                    </span>
                  ) : transitioning && MARKET_LABELS[transitioning.from] && MARKET_LABELS[transitioning.to] ? (
                    <span>
                      <span className="fade-out-left">{MARKET_LABELS[transitioning.from].text} <span className="blink-arrows">&gt;&gt;</span> </span>
                      {MARKET_LABELS[transitioning.to].text}
                    </span>
                  ) : (
                    market.text
                  )}
                </span>
              )}
            </div>
          )}
          <span className={`neon-price ${priceFlash}`}>
            ${typeof price === 'number' ? price.toFixed(2) : '---'}
          </span>
          <span className={`neon-change ${colorClass} ${crossFx ? 'sign-flip' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
            {Icon && <Icon size={14} className="change-icon" style={{ flexShrink: 0 }} />}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
              {typeof changeAbs === 'number' && (
                <span className="change-abs" style={{ fontSize: '0.92em', opacity: 0.9, fontWeight: 500 }}>
                  {changeAbs > 0 ? '+' : ''}{changeAbs.toFixed(2)}
                </span>
              )}
              {typeof changePercent === 'number' ? (
                <span className="change-pct" style={{ fontSize: '0.78em', opacity: 0.7 }}>
                  ({changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%)
                </span>
              ) : (
                <span>---</span>
              )}
            </span>
          </span>
        </div>
      </div>

      {/* Space is always reserved so cards never change height as data loads */}
      {showSparkline && (
        <div className={`sparkline-wrap ${colorClass}`}>
          {closes && closes.length > 1 && <Sparkline data={closes} baseline={previousClose} pixel={pixel} />}
        </div>
      )}
    </motion.div>
  );
};

export default TickerCard;

