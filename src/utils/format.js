// Adaptive price precision: keep the on-screen width roughly constant as the
// number grows, so a big 4-digit price never squeezes the symbol out of the
// card (and it matches brokerage convention — fewer decimals for pricier names).
//   $12.34 / $782.55 → 2 decimals
//   $1234.5          → 1 decimal  (4-digit integer)
//   $12345           → 0 decimals (5-digit+)
export const fmtPrice = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '---';
  const abs = Math.abs(v);
  const decimals = abs >= 10000 ? 0 : abs >= 1000 ? 1 : 2;
  return v.toFixed(decimals);
};
