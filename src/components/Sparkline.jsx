import React from 'react';

const W = 100;
const H = 28;

const Sparkline = ({ data, pixel = false }) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - 2 - ((v - min) / range) * (H - 4),
  ]);

  let line;
  if (pixel) {
    // Step path for a pixel-art feel
    line = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      line += ` L ${pts[i][0]} ${pts[i - 1][1]} L ${pts[i][0]} ${pts[i][1]}`;
    }
  } else {
    line = `M ${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')}`;
  }

  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="currentColor" opacity="0.12" stroke="none" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={pixel ? 2 : 1.6}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin={pixel ? 'miter' : 'round'}
        strokeLinecap={pixel ? 'butt' : 'round'}
      />
    </svg>
  );
};

export default Sparkline;
