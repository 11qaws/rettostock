import { cached, json, options, originIsAllowed, symbolsFrom, yahooChart } from '../_lib/market.js';

// Charts are presentation data, not the live price path. Two-minute freshness
// keeps the trend current while preventing per-browser public-proxy requests.
const CHART_FRESH_MS = 2 * 60 * 1000;
const CHART_STALE_MS = 15 * 60 * 1000;

export const onRequestOptions = ({ request, env }) => options(request, env);

export const onRequestGet = async ({ request, env }) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  const symbols = symbolsFrom(request);
  if (!symbols) return json(request, env, { error: 'invalid_symbols' }, 400);

  const settled = await Promise.allSettled(symbols.map(async (symbol) => ({
    symbol,
    ...(await cached({
      request,
      namespace: 'chart',
      key: symbol,
      freshMs: CHART_FRESH_MS,
      staleMs: CHART_STALE_MS,
      load: () => yahooChart(symbol, request.headers.get('User-Agent')),
    })),
  })));

  const charts = {};
  const failed = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') charts[result.value.symbol] = result.value;
    else failed.push(symbols[index]);
  });
  if (!Object.keys(charts).length) return json(request, env, { error: 'chart_unavailable', failed }, 502);
  return json(request, env, { charts, failed });
};
