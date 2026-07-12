// Surge intensity tier from the day's change %:
//   0 none · 1 (±5%) · 2 (±10%) · 3 (±15%)
// Drives the escalating glow (tier 3 borrows the 52-week record colour) and
// the rotate-mode auto-focus.
export const surgeTier = (cp) => {
  if (typeof cp !== 'number') return 0;
  const a = Math.abs(cp);
  return a >= 15 ? 3 : a >= 10 ? 2 : a >= 5 ? 1 : 0;
};
