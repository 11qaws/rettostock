import { cached, finnhub, json, options, originIsAllowed, symbolsFrom } from '../_lib/market.js';

const METRIC_FRESH_MS = 6 * 60 * 60 * 1000;
const METRIC_STALE_MS = 24 * 60 * 60 * 1000;

export const onRequestOptions = ({ request, env }) => options(request, env);

export const onRequestGet = async ({ request, env }) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  const symbols = symbolsFrom(request);
  if (!symbols) return json(request, env, { error: 'invalid_symbols' }, 400);

  const settled = await Promise.allSettled(symbols.map(async (symbol) => ({
    symbol,
    ...(await cached({
      request,
      namespace: 'metric',
      key: symbol,
      freshMs: METRIC_FRESH_MS,
      staleMs: METRIC_STALE_MS,
      load: async () => {
        const metric = (await finnhub(`/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, env))?.metric;
        const week52High = metric?.['52WeekHigh'];
        const week52Low = metric?.['52WeekLow'];
        if (typeof week52High !== 'number' && typeof week52Low !== 'number') throw new Error('invalid Finnhub metric');
        return { week52High, week52Low };
      },
    })),
  })));

  const metrics = {};
  const failed = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') metrics[result.value.symbol] = result.value;
    else failed.push(symbols[index]);
  });
  if (!Object.keys(metrics).length) return json(request, env, { error: 'metric_unavailable', failed }, 502);
  return json(request, env, { metrics, failed });
};
