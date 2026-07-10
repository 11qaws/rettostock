import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import Sparkline from './Sparkline';

const SURGE_THRESHOLD = 5; // |changePercent| >= 5% triggers surge state

const MARKET_LABELS = {
  REGULAR: { text: '장중', cls: 'ms-open' },
  PRE: { text: '프리장', cls: 'ms-pre' },
  PREPRE: { text: '프리장', cls: 'ms-pre' },
  POST: { text: '애프터', cls: 'ms-post' },
  POSTPOST: { text: '애프터', cls: 'ms-post' },
  CLOSED: { text: '마감', cls: 'ms-closed' },
};

const UP_PARTICLES = ['🚀', '✨', '▲', '💖', '⭐'];
const DOWN_PARTICLES = ['💧', '▼', '💦', '🫧'];

let particleId = 0;

const TickerCard = ({
  symbol, price, changePercent, name, isCrypto, marketState, closes, stale,
  fx = 'full', pixel = false, showSparkline = true, loopPrevPrice,
  ...motionProps
}) => {
  const [animClass, setAnimClass] = useState('');
  const [priceFlash, setPriceFlash] = useState('');
  const [particles, setParticles] = useState([]);
  const prevPriceRef = useRef(loopPrevPrice !== undefined ? loopPrevPrice : price);
  const prevSurgeRef = useRef(null); // null = no data seen yet

  // Tick animation on price change
  useEffect(() => {
    if (price === undefined || prevPriceRef.current === undefined) {
      prevPriceRef.current = price;
      return;
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
      style={{ ...motionProps.style }}
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

      <div className="card-row">
        <div className="card-left">
          <div className="card-symbol-row">
            <h3 className="neon-title">{symbol}</h3>
            {market && <span className={`market-badge ${market.cls}`}>{market.text}</span>}
            {isCrypto && <span className="mini-tag">CRYPTO</span>}
          </div>
          <p className="neon-subtitle">{name}</p>
        </div>

        <div className="card-right">
          <span className={`neon-price ${priceFlash}`}>
            ${typeof price === 'number' ? price.toFixed(2) : '---'}
          </span>
          <span className={`neon-change ${colorClass}`}>
            {Icon && <Icon size={14} className="change-icon" />}
            {typeof changePercent === 'number'
              ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
              : '---'}
            {surged && fx !== 'off' && (
              <span className="surge-badge">{isUp ? '🚀' : '💦'}</span>
            )}
          </span>
        </div>
      </div>

      {/* Space is always reserved so cards never change height as data loads */}
      {showSparkline && (
        <div className={`sparkline-wrap ${colorClass}`}>
          {closes && closes.length > 1 && <Sparkline data={closes} pixel={pixel} />}
        </div>
      )}
    </motion.div>
  );
};

export default TickerCard;
