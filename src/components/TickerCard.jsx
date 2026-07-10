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
  symbol, price, changePercent, previousClose, regularMarketPrice, name, isCrypto, marketState, closes, stale,
  fx = 'full', pixel = false, showSparkline = true, loopPrevPrice,
  ...motionProps
}) => {
  const [animClass, setAnimClass] = useState('');
  const [priceFlash, setPriceFlash] = useState('');
  const [particles, setParticles] = useState([]);
  const [crossFx, setCrossFx] = useState(null); // 'up' (양전) | 'down' (음전)
  const [fxIntensity, setFxIntensity] = useState(1); // tick effect strength ∝ move size
  const [hiloPop, setHiloPop] = useState(null); // 'high' | 'low' — session record broken
  const sessionRef = useRef({ high: null, low: null, effectHigh: null, effectLow: null, bornAt: Date.now(), lastFx: { high: 0, low: 0 } });
  const prevPriceRef = useRef(loopPrevPrice !== undefined ? loopPrevPrice : price);
  const prevSurgeRef = useRef(null); // null = no data seen yet
  const prevSignRef = useRef(null);
  const lastCrossRef = useRef(0);

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

  // Session high/low tracking: flash a 신고가/신저가 pop the moment the
  // day's record breaks. Guards: 25s warm-up after mount (initial fills),
  // 45s per-direction cooldown, and the record must beat the last
  // celebrated one by 0.1% so a creeping trend doesn't spam.
  useEffect(() => {
    if (typeof price !== 'number') return;
    const s = sessionRef.current;
    if (s.high === null) {
      s.high = price; s.low = price;
      s.effectHigh = price; s.effectLow = price;
      return;
    }
    const now = Date.now();
    const warm = now - s.bornAt > 25000;

    if (price > s.high) {
      s.high = price;
      if (warm && fx !== 'off' && now - s.lastFx.high > 45000 && price >= s.effectHigh * 1.001) {
        s.lastFx.high = now;
        s.effectHigh = price;
        setHiloPop('high');
        const t = setTimeout(() => setHiloPop(null), 1700);
        return () => clearTimeout(t);
      }
    } else if (price < s.low) {
      s.low = price;
      if (warm && fx !== 'off' && now - s.lastFx.low > 45000 && price <= s.effectLow * 0.999) {
        s.lastFx.low = now;
        s.effectLow = price;
        setHiloPop('low');
        const t = setTimeout(() => setHiloPop(null), 1700);
        return () => clearTimeout(t);
      }
    }
  }, [price, fx]);

  // New regular session -> fresh records
  useEffect(() => {
    if (marketState === 'REGULAR') {
      const s = sessionRef.current;
      s.high = null; s.low = null; s.effectHigh = null; s.effectLow = null;
    }
  }, [marketState]);

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

    setCrossFx(sign > 0 ? 'up' : 'down');
    const timer = setTimeout(() => setCrossFx(null), 1100);
    return () => clearTimeout(timer);
  }, [changePercent, fx]);

  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const Icon = isUp ? TrendingUp : (isDown ? TrendingDown : Minus);
  const colorClass = isUp ? 'text-up' : (isDown ? 'text-down' : '');
  const surged = typeof changePercent === 'number' && Math.abs(changePercent) >= SURGE_THRESHOLD;
  const surgeClass = surged ? (isUp ? 'is-surge-up' : 'is-surge-down') : '';

  const market = isCrypto
    ? { text: '24H', cls: 'ms-open' }
    : MARKET_LABELS[marketState];

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

      {/* Zero-cross color wipe (full fx only) */}
      {crossFx && fx === 'full' && <span className={`cross-wipe wipe-${crossFx}`} aria-hidden="true" />}

      {/* Session record pop */}
      {hiloPop && (
        <span className={`hilo-pop hilo-${hiloPop}`} aria-hidden="true">
          {hiloPop === 'high' ? '✨ 신고가' : '신저가'}
        </span>
      )}

      <div className="card-row">
        <div className="card-left">
          <div className="card-symbol-row">
            <h3 className="neon-title">{symbol}</h3>
            {isCrypto && <span className="mini-tag">CRYPTO</span>}
          </div>
          <p className="neon-subtitle">{name}</p>
        </div>

        <div className="card-right">
          {(surged || market) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              {surged && fx !== 'off' && (
                <span className="surge-badge" style={{ flexShrink: 0, fontSize: '1.1em' }}>{isUp ? '🔥' : '💦'}</span>
              )}
              {market && <span className={`market-badge ${market.cls}`}>{market.text}</span>}
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

