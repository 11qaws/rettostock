import { cached, finnhub, json, options, originIsAllowed } from '../_lib/market.js';

const STATUS_FRESH_MS = 60000;
const STATUS_STALE_MS = 15 * 60 * 1000;

export const onRequestOptions = ({ request, env }) => options(request, env);

export const onRequestGet = async ({ request, env }) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  try {
    const result = await cached({
      request,
      namespace: 'market-status',
      key: 'US',
      freshMs: STATUS_FRESH_MS,
      staleMs: STATUS_STALE_MS,
      load: async () => {
        const status = await finnhub('/api/v1/stock/market-status?exchange=US', env);
        if (!status || typeof status.isOpen !== 'boolean') throw new Error('invalid Finnhub market status');
        return { isOpen: status.isOpen };
      },
    });
    return json(request, env, result);
  } catch {
    return json(request, env, { error: 'market_status_unavailable' }, 502);
  }
};
