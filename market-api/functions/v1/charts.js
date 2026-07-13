import { cached, finnhub, json, options, originIsAllowed, symbolsFrom } from '../_lib/market.js';

// Charts are presentation data, not the live price path. Two-minute freshness
// keeps the trend current while leaving room under Finnhub's free request cap
// for the 5-second quote correction loop.
const CHART_FRESH_MS = 2 * 60 * 1000;
const CHART_STALE_MS = 15 * 60 * 1000;
const PROFILE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const CHART_LOOKBACK_SECONDS = 30 * 60 * 60;
const MIN_POINTS = 2;

export const onRequestOptions = ({ request, env }) => options(request, env);

export const onRequestGet = async ({ request, env }) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  const symbols = symbolsFrom(request);
  if (!symbols) return json(request, env, { error: 'invalid_symbols' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const from = now - CHART_LOOKBACK_SECONDS;
  const settled = await Promise.allSettled(symbols.map(async (symbol) => {
    // A profile lookup is deliberately independent from the short chart
    // cache. Company names almost never change, so it costs one upstream
    // request per symbol per week rather than once per chart refresh.
    const [chart, profile] = await Promise.all([
      cached({
        request,
        namespace: 'chart',
        key: symbol,
        freshMs: CHART_FRESH_MS,
        staleMs: CHART_STALE_MS,
        load: async () => {
          const candle = await finnhub(
            `/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=5&from=${from}&to=${now}`,
            env,
          );
          const closes = Array.isArray(candle?.c)
            ? candle.c.filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
            : [];
          if (candle?.s !== 'ok' || closes.length < MIN_POINTS) throw new Error('insufficient Finnhub candle data');
          return { closes };
        },
      }),
      cached({
        request,
        namespace: 'profile',
        key: symbol,
        freshMs: PROFILE_FRESH_MS,
        staleMs: PROFILE_STALE_MS,
        load: async () => {
          const profile = await finnhub(`/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}`, env);
          const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
          if (!name) throw new Error('invalid Finnhub company profile');
          return { name };
        },
      }).catch(() => null),
    ]);
    return {
      symbol,
      data: { ...chart.data, ...(profile?.data?.name ? { name: profile.data.name } : {}) },
      fetchedAt: chart.fetchedAt,
      stale: chart.stale || Boolean(profile?.stale),
    };
  }));

  const charts = {};
  const failed = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') charts[result.value.symbol] = result.value;
    else failed.push(symbols[index]);
  });
  if (!Object.keys(charts).length) return json(request, env, { error: 'chart_unavailable', failed }, 502);
  return json(request, env, { charts, failed });
};
