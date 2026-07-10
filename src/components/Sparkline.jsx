import React, { useId } from 'react';

const W = 100;
const H = 28;

// Intraday sparkline. When `baseline` (previous regular close) is given,
// the chart is split at that level: above it draws in the up color and
// below in the down color, with a dashed reference line — so the shape
// alone tells the day's story. Without a baseline it falls back to a
// single-color line inheriting currentColor.
const Sparkline = ({ data, baseline, pixel = false }) => {
  const uid = useId();
  if (!data || data.length < 2) return null;

  const hasBase = typeof baseline === 'number' && baseline > 0;
  const min = Math.min(...data, ...(hasBase ? [baseline] : []));
  const max = Math.max(...data, ...(hasBase ? [baseline] : []));
  const range = max - min || 1;
  const y = (v) => H - 2 - ((v - min) / range) * (H - 4);

  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, y(v)]);

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

  const strokeProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: pixel ? 2 : 1.6,
    vectorEffect: 'non-scaling-stroke',
    strokeLinejoin: pixel ? 'miter' : 'round',
    strokeLinecap: pixel ? 'butt' : 'round',
  };

  if (!hasBase) {
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return (
      <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={area} fill="currentColor" opacity="0.12" stroke="none" />
        <path d={line} {...strokeProps} />
      </svg>
    );
  }

  const yBase = y(baseline);
  const area = `${line} L ${W} ${yBase} L 0 ${yBase} Z`; // filled toward the baseline

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={`sa-${uid}`}><rect x="0" y="-2" width={W} height={Math.max(0, yBase + 2)} /></clipPath>
        <clipPath id={`sb-${uid}`}><rect x="0" y={yBase} width={W} height={Math.max(0, H - yBase + 2)} /></clipPath>
      </defs>
      <line
        x1="0" x2={W} y1={yBase} y2={yBase}
        stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke" opacity="0.55"
      />
      <g clipPath={`url(#sa-${uid})`} style={{ color: 'var(--color-up)' }}>
        <path d={area} fill="currentColor" opacity="0.15" stroke="none" />
        <path d={line} {...strokeProps} />
      </g>
      <g clipPath={`url(#sb-${uid})`} style={{ color: 'var(--color-down)' }}>
        <path d={area} fill="currentColor" opacity="0.15" stroke="none" />
        <path d={line} {...strokeProps} />
      </g>
    </svg>
  );
};

export default Sparkline;
