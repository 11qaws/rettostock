import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

const TickerCard = ({ symbol, price, changePercent, name, isCrypto, loopPrevPrice, ...motionProps }) => {
  const [animClass, setAnimClass] = useState('');
  const prevPriceRef = useRef(loopPrevPrice !== undefined ? loopPrevPrice : price);

  useEffect(() => {
    if (price === undefined || prevPriceRef.current === undefined) {
      prevPriceRef.current = price;
      return;
    }

    if (price > prevPriceRef.current) {
      setAnimClass('anim-pump');
    } else if (price < prevPriceRef.current) {
      setAnimClass('anim-dump');
    }

    const timer = setTimeout(() => {
      setAnimClass('');
    }, 500); // Animation duration

    prevPriceRef.current = price;
    return () => clearTimeout(timer);
  }, [price]);

  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const Icon = isUp ? TrendingUp : (isDown ? TrendingDown : Minus);
  const colorClass = isUp ? 'text-up' : (isDown ? 'text-down' : '');

  return (
    <motion.div 
      className={`glass-card ${animClass}`}
      style={{ marginBottom: '16px', ...motionProps.style }}
      {...motionProps}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="neon-title">{symbol}</h3>
            {isCrypto && (
              <span style={{ 
                fontSize: '10px', 
                background: 'rgba(255,42,133,0.1)', 
                color: 'var(--color-primary)', 
                border: '1px solid rgba(255,42,133,0.5)', 
                padding: '2px 6px', 
                borderRadius: '4px', 
                textShadow: '0 0 5px var(--color-primary)',
                fontWeight: 'bold',
                letterSpacing: '1px'
              }}>
                CRYPTO
              </span>
            )}
          </div>
          <p className="neon-subtitle">{name}</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span className="neon-price">
            ${typeof price === 'number' ? price.toFixed(2) : '---'}
          </span>
          <span className={`neon-change ${colorClass}`} style={{ display: 'flex', alignItems: 'center' }}>
            {Icon && <Icon size={14} style={{ marginRight: '4px' }}/>}
            {changePercent ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '---'}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default TickerCard;
