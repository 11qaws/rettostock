import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import Sparkline from './Sparkline';
import { fmtPrice } from '../utils/format';
import { surgeTier } from '../utils/effects';

const SURGE_THRESHOLD = 5; // |changePercent| >= 5% triggers surge state

// Effect-reset delays: each clears its effect state just AFTER the matching CSS
// animation finishes (keyframe duration + a small buffer, so nothing is torn
// down mid-animation). Keep in sync with index.css if those durations change.
const TICK_MS = 600;      // anim-pump / price-flash (CSS 0.5–0.6s)
const PARTICLE_MS = 1400; // fxPop burst (CSS 1.15s + up to 0.15s stagger)
const BANNER_MS = 2700;   // w52Pop / target banner (CSS 2.6s)
const CROSS_MS = 1500;    // crossFlip zero-cross (CSS 1.4s)
const PREVIEW_MS = 3000;  // configurator-only effect preview

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

const makeParticleBurst = (changePercent) => {
  const pool = changePercent > 0 ? UP_PARTICLES : DOWN_PARTICLES;
  return Array.from({ length: 14 }, () => ({
    id: ++particleId,
    char: pool[Math.floor(Math.random() * pool.length)],
    dx: `${(Math.random() - 0.5) * 180}px`,
    dy: `${changePercent > 0 ? -(20 + Math.random() * 90) : (20 + Math.random() * 90)}px`,
    rot: `${(Math.random() - 0.5) * 240}deg`,
    delay: `${Math.random() * 0.15}s`,
  }));
};

// Preview particles render from props rather than a transient state update.
// Three short waves cover the whole three-second preview, keeping Full visibly
// distinct from Card effects from start to finish.
const makePreviewParticleBurst = (token) => Array.from({ length: 18 }, (_, index) => {
  const wave = Math.floor(index / 6);
  const slot = index % 6;
  return {
    id: `preview-${token}-${index}`,
    char: UP_PARTICLES[index % UP_PARTICLES.length],
    dx: `${(slot - 2.5) * 28}px`,
    dy: `${-(38 + ((index * 17) % 58))}px`,
    rot: `${-115 + ((index * 43) % 230)}deg`,
    delay: `${wave * 0.84 + slot * 0.035}s`,
  };
});

const TickerCard = ({
  symbol, price, changePercent, previousClose, name, marketState, upcomingState, countdown, closes, stale, recovering,
  week52High, week52Low, targetPrice,
  fx = 'full', showSparkline = true, loopPrevPrice, previewFxToken = '', previewFxVariant = 'surge',
  ...motionProps
}) => {
  const [animClass, setAnimClass] = useState('');
  const [priceFlash, setPriceFlash] = useState('');
  const [particles, setParticles] = useState([]);
  const [previewExpired, setPreviewExpired] = useState(false);
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
  const previewTimerRef = useRef(null);
  const previewTokenRef = useRef('');
  useEffect(() => () => {
    clearTimeout(w52TimerRef.current);
    clearTimeout(crossTimerRef.current);
    clearTimeout(targetTimerRef.current);
    clearTimeout(previewTimerRef.current);
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
    // Snapshot the reached target so the banner keeps its number through the
    // whole animation even after the live target is disarmed/cleared (the
    // Configurator wipes it on TARGET_REACHED, which would otherwise blank $).
    setTargetPop(p => ({ n: (p?.n || 0) + 1, price: targetPrice }));
    targetTimerRef.current = setTimeout(() => setTargetPop(null), BANNER_MS);

    // If running in the Configurator's preview iframe, notify it to clear the target UI
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'TARGET_REACHED', symbol }, '*');
    }
  }, [price, targetPrice, fx, symbol]);
  const prevPriceRef = useRef(loopPrevPrice !== undefined ? loopPrevPrice : price);
  const prevSurgeRef = useRef(null); // null = no data seen yet
  const prevSignRef = useRef(null);
  const recoveryPriceRef = useRef(Boolean(recovering));
  const recoverySurgeRef = useRef(Boolean(recovering));
  const recoverySignRef = useRef(Boolean(recovering));
  const lastCrossRef = useRef(0);

  // The configurator passes a token only to its embedded preview. The visual
  // itself is derived directly from that token below: production builds were
  // dropping state-driven overlays on cards after the first one. This timer
  // only controls when that deterministic layer expires.
  useEffect(() => {
    clearTimeout(previewTimerRef.current);
    if (!previewFxToken) {
      previewTokenRef.current = '';
      setPreviewExpired(false);
      return;
    }
    if (previewTokenRef.current === previewFxToken) return;
    previewTokenRef.current = previewFxToken;
    setPreviewExpired(false);
    previewTimerRef.current = setTimeout(() => setPreviewExpired(true), PREVIEW_MS);
  }, [previewFxToken]);

  // Transition animation state
  const prevMarketRef = useRef(marketState);
  const prevUpcomingRef = useRef(upcomingState);
  const [transitioning, setTransitioning] = useState(null);

  const transitionTimerRef = useRef(null);
  useEffect(() => {
    if (fx !== 'off' && prevUpcomingRef.current && !upcomingState && marketState !== prevMarketRef.current) {
      setTransitioning({ from: prevMarketRef.current, to: marketState });
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => setTransitioning(null), 1000); // 1초 뒤 애니메이션 초기화
    } else if (fx === 'off') {
      setTransitioning(null);
    }
    prevUpcomingRef.current = upcomingState;
    prevMarketRef.current = marketState;
  }, [upcomingState, marketState, fx]);

  useEffect(() => {
    return () => clearTimeout(transitionTimerRef.current);
  }, []);

  let changeAbs = null;
  if (typeof price === 'number' && typeof changePercent === 'number') {
    const impliedBaseline = price / (1 + changePercent / 100);
    changeAbs = price - impliedBaseline;
  }

  // Tick animation on price change
  useEffect(() => {
    // The first live response after a restored value is a reconciliation, not
    // a market event. Establish a fresh baseline so it cannot create a false
    // pump/dump, surge, or sign-flip animation.
    if (recovering) {
      recoveryPriceRef.current = true;
      prevPriceRef.current = price;
      return;
    }
    if (recoveryPriceRef.current) {
      recoveryPriceRef.current = false;
      prevPriceRef.current = price;
      return;
    }
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
    }, TICK_MS);

    prevPriceRef.current = price;
    return () => clearTimeout(timer);
  }, [price, recovering]);

  // Surge detection: particle burst the moment |change| crosses the threshold
  useEffect(() => {
    if (changePercent === undefined || changePercent === null) return;
    const surged = Math.abs(changePercent) >= SURGE_THRESHOLD;

    if (recovering) {
      recoverySurgeRef.current = true;
      prevSurgeRef.current = surged;
      return;
    }
    if (recoverySurgeRef.current) {
      recoverySurgeRef.current = false;
      prevSurgeRef.current = surged;
      return;
    }

    if (prevSurgeRef.current === null) {
      // First data point: record state without celebrating stale news
      prevSurgeRef.current = surged;
      return;
    }

    if (surged && !prevSurgeRef.current && fx === 'full') {
      setParticles(makeParticleBurst(changePercent));
      const timer = setTimeout(() => setParticles([]), PARTICLE_MS);
      prevSurgeRef.current = surged;
      return () => clearTimeout(timer);
    }

    prevSurgeRef.current = surged;
  }, [changePercent, fx, recovering]);

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
      w52TimerRef.current = setTimeout(() => setW52Pop(null), BANNER_MS);
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
    const sign = Math.abs(changePercent) < 0.05 ? null : (changePercent > 0 ? 1 : -1);
    if (recovering) {
      recoverySignRef.current = true;
      prevSignRef.current = sign;
      return;
    }
    if (recoverySignRef.current) {
      recoverySignRef.current = false;
      prevSignRef.current = sign;
      return;
    }
    if (Math.abs(changePercent) < 0.05) return; // too small to count as a sign
    const prev = prevSignRef.current;
    prevSignRef.current = sign;
    if (prev === null || prev === sign) return;

    if (fx === 'off') return;
    const now = Date.now();
    if (now - lastCrossRef.current < 10000) return;
    lastCrossRef.current = now;

    clearTimeout(crossTimerRef.current);
    setCrossFx(p => ({ dir: sign > 0 ? 'up' : 'down', n: (p?.n || 0) + 1 }));
    crossTimerRef.current = setTimeout(() => setCrossFx(null), CROSS_MS);
  }, [changePercent, fx, recovering]);

  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const Icon = isUp ? TrendingUp : (isDown ? TrendingDown : Minus);
  const colorClass = isUp ? 'text-up' : (isDown ? 'text-down' : '');
  // Persistent visual tier by move size (1: ±5%, 2: ±10%, 3: ±15%). The glow
  // escalates and heats/cools its hue: up ramps theme colour → orange → yellow
  // (달아오름), down ramps theme colour → ice → white-blue (얼어붙음). See the
  // .surge-*-N rules in index.css.
  const tier = surgeTier(changePercent);
  const surged = tier >= 1;
  const dir = isUp ? 'up' : 'down';
  const previewVisible = Boolean(previewFxToken) && !previewExpired && fx !== 'off';
  const previewSurge = previewVisible && previewFxVariant === 'surge';
  const previewFullMotion = previewSurge && fx === 'full';
  const previewParticles = previewFullMotion ? makePreviewParticleBurst(previewFxToken) : [];
  const previewCrossFx = previewVisible && previewFxVariant === 'cross'
    ? { dir: 'up', n: previewFxToken }
    : null;
  const previewW52Pop = previewVisible && previewFxVariant === 'record'
    ? { dir: 'high', n: previewFxToken }
    : null;
  const previewTargetPop = previewVisible && previewFxVariant === 'target'
    ? { n: previewFxToken, price: targetPrice ?? price }
    : null;
  // A live event must not mask the assigned demonstration during its three
  // seconds; each card owns one independently derived preview variant.
  const visibleAnimClass = previewVisible ? '' : animClass;
  const visiblePriceFlash = previewVisible ? (previewSurge ? 'price-flash-up' : '') : priceFlash;
  const visibleParticles = previewVisible ? previewParticles : particles;
  const visibleCrossFx = previewVisible ? previewCrossFx : crossFx;
  const visibleW52Pop = previewVisible ? previewW52Pop : w52Pop;
  const visibleTargetPop = previewVisible ? previewTargetPop : targetPop;
  const visualTier = previewSurge ? Math.max(tier, 2) : tier;
  const visualDir = previewSurge ? 'up' : dir;
  const cardFxEnabled = fx === 'full' || fx === 'card';
  const surgeClass = cardFxEnabled && (surged || previewSurge) ? `is-surge-${visualDir} surge-${visualDir}-${visualTier}` : '';
  // 4-digit+ prices ($1000+) render one step smaller so the wide number never
  // squeezes the ticker (stacks with fmtPrice dropping decimals).
  const bigPrice = typeof price === 'number' && Math.abs(price) >= 1000;

  const market = MARKET_LABELS[marketState];

  return (
    <motion.div
      className={`glass-card tick-card ${visibleAnimClass} ${previewFullMotion ? 'preview-full-motion' : ''} ${surgeClass} ${stale ? 'is-stale' : ''}`}
      style={{ '--fx-i': fxIntensity, ...motionProps.style }}
      {...motionProps}
    >
      {/* Body atmosphere for big moves. Tier 3 (±15%) fills the card with a
          full mood — "달아오른"(heated) rising up, "얼어붙은"(frozen) coming
          down. Tier 2 (±10%) is the same tint at a whisper (aura-mid), so the
          card visibly warms/cools on the way to tier 3. Sits behind content. */}
      {visualTier >= 2 && cardFxEnabled && (
        <div
          className={`surge-aura ${visualDir === 'up' ? 'aura-hot' : 'aura-frozen'} ${visualTier === 2 ? 'aura-mid' : ''}`}
          aria-hidden="true"
        />
      )}

      {(fx === 'full' ? visibleParticles : []).map(p => (
        <span
          key={p.id}
          className="fx-particle"
          style={{ '--dx': p.dx, '--dy': p.dy, '--rot': p.rot, animationDelay: p.delay }}
        >
          {p.char}
        </span>
      ))}

      {/* Zero-cross: shimmer wipe + an arrow passing through the card,
          easing off at the center before shooting out (Weak and Full only) */}
      {visibleCrossFx && fx !== 'off' && (
        <React.Fragment key={`cross-${visibleCrossFx.n}`}>
          <span className={`cross-wipe wipe-${visibleCrossFx.dir}`} aria-hidden="true" />
          {/* Render the OLD-direction glyph; the scaleY flip reveals the new
              one (▼→▲ for 양전, ▲→▼ for 음전) mid-animation. */}
          <span className={`cross-arrow arrow-${visibleCrossFx.dir}`} aria-hidden="true">
            {visibleCrossFx.dir === 'up' ? '▼' : '▲'}
          </span>
        </React.Fragment>
      )}

      {/* 52-week record celebration */}
      {visibleW52Pop && (
        <React.Fragment key={`w52-${visibleW52Pop.n}`}>
          <span className={`w52-ring w52-ring-${visibleW52Pop.dir}`} aria-hidden="true" />
          <span className={`w52-banner w52-${visibleW52Pop.dir}`} aria-hidden="true">
            {visibleW52Pop.dir === 'high' ? '🏆 52주 신고가' : '❄️ 52주 신저가'}
          </span>
        </React.Fragment>
      )}

      {/* Target price reached (opt-in) */}
      {visibleTargetPop && (
        <React.Fragment key={`target-${visibleTargetPop.n}`}>
          <span className="w52-ring target-ring" aria-hidden="true" />
          <span className="w52-banner target-banner" aria-hidden="true">
            🎯 목표가 ${typeof visibleTargetPop.price === 'number' ? visibleTargetPop.price.toFixed(2) : ''}
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
          {market && (
            <div className="badge-row">
              {countdown != null && (
                <span className="market-countdown">{countdown}초</span>
              )}
              <span className={`market-badge ${market.cls}`}>
                {upcomingState && MARKET_LABELS[upcomingState] ? (
                  fx !== 'off' ? (
                    <span className="transition-slide-in">
                      {market.text} <span className="blink-arrows">&gt;&gt;</span> {MARKET_LABELS[upcomingState].text}
                    </span>
                  ) : (
                    <span>{market.text} → {MARKET_LABELS[upcomingState].text}</span>
                  )
                ) : fx !== 'off' && transitioning && MARKET_LABELS[transitioning.from] && MARKET_LABELS[transitioning.to] ? (
                  <span>
                    <span className="fade-out-left">{MARKET_LABELS[transitioning.from].text} <span className="blink-arrows">&gt;&gt;</span> </span>
                    {MARKET_LABELS[transitioning.to].text}
                  </span>
                ) : (
                  market.text
                )}
              </span>
            </div>
          )}
          <span className={`neon-price ${visiblePriceFlash} ${bigPrice ? 'price-lg' : ''}`}>
            ${fmtPrice(price)}
          </span>
          <span className={`neon-change ${colorClass} ${visibleCrossFx ? 'sign-flip' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
            {Icon && <Icon size={14} className="change-icon" style={{ flexShrink: 0 }} />}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
              {typeof changeAbs === 'number' && (
                <span className="change-abs" style={{ fontSize: '0.92em', opacity: 0.9, fontWeight: 500 }}>
                  {changeAbs > 0 ? '+' : ''}{fmtPrice(changeAbs)}
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
          {closes && closes.length > 1 && <Sparkline data={closes} baseline={previousClose} />}
        </div>
      )}
    </motion.div>
  );
};

export default TickerCard;
