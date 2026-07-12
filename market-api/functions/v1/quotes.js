import { cached, finnhub, json, options, originIsAllowed, symbolsFrom } from '../_lib/market.js';

const QUOTE_FRESH_MS = 5000;
const QUOTE_STALE_MS = 60000;

export const onRequestOptions = ({ request, env }) => options(request, env);

export const onRequestGet = async ({ request, env }) => {
  if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin_not_allowed' }, 403);
  const symbols = symbolsFrom(request);
  if (!symbols) return json(request, env, { error: 'invalid_symbols' }, 400);

  const settled = await Promise.allSettled(symbols.map(async (symbol) => ({
    symbol,
    ...(await cached({
      request,
      namespace: 'quote',
      key: symbol,
      freshMs: QUOTE_FRESH_MS,
      staleMs: QUOTE_STALE_MS,
      load: async () => {
        const quote = await finnhub(`/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, env);
        if (!quote || typeof quote.c !== 'number' || quote.c <= 0) throw new Error('invalid Finnhub quote');
        return quote;
      },
    })),
  })));

  const quotes = {};
  const failed = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') quotes[result.value.symbol] = result.value;
    else failed.push(symbols[index]);
  });
  if (!Object.keys(quotes).length) return json(request, env, { error: 'quote_unavailable', failed }, 502);
  return json(request, env, { quotes, failed });
};
