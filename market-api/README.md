# Rettostock Market API

This is a Cloudflare Pages Function that sits between the public OBS widget and Finnhub. It keeps the UI and widget URL unchanged while sharing short-lived market-data cache entries between viewers in the same Cloudflare location.

## What it caches

| Route | Fresh response | Fallback on an upstream failure |
| --- | ---: | ---: |
| `/v1/quotes` | 5 seconds | up to 60 seconds old |
| `/v1/metrics` | 6 hours | up to 24 hours old |
| `/v1/market-status` | 60 seconds | up to 15 minutes old |

Only Finnhub HTTP 429 responses and 5-second upstream timeouts move to the standby key. A 401 or 403 is returned as an ordinary failure so a misconfigured key is not hidden.

## What this means for on-screen delay

During regular trading, direct Finnhub WebSocket trade ticks still update the visible price without passing through this cache. The cache only serves the 5-second REST correction loop. A normal cached REST result is 0–5 seconds old, but its 5-second freshness boundary can line up with the browser's 5-second poll, so the conservative upper bound before the next REST refresh is almost 10 seconds. This is measured from Finnhub's REST value, not from the exchange; Finnhub's own feed latency is outside the widget's control.

When Finnhub is unavailable, the Function may return the last REST value for up to 60 seconds and marks it stale. A newer WebSocket trade is never overwritten by that older cached REST result. After the 60-second fallback expires, the widget keeps its existing value and its existing retry/backoff behavior applies.

## One-time deployment

You do **not** need to find a special Cloudflare menu before starting. The dashboard's drag-and-drop Pages flow cannot compile this project's `functions` folder, so use the three short PowerShell steps below once. The first command opens the normal Cloudflare sign-in/sign-up page in your browser.

1. On Windows, press the Windows key, search for **PowerShell**, and open it. Paste these two lines (the second one opens the Cloudflare login page):

   ```powershell
   cd C:\Users\Qumin\rettostock\market-api
   npx wrangler login
   ```

   Create a free Cloudflare account if prompted, sign in in the browser, and then return to PowerShell. The terminal will say that the login succeeded.

2. Still in the same PowerShell window, create the free project. This is just a name for the small cache service, not a new website visitors will use:

   ```powershell
   npx wrangler pages project create rettostock-market --production-branch main
   ```

   If the project name is already taken, use the name suggested by Cloudflare and remember the final `.pages.dev` address it shows.

3. Store the two Finnhub keys as encrypted Cloudflare secrets. Run each command below; PowerShell will show `Enter secret value:`. Paste only the requested key, press Enter, and repeat for the second command. The pasted value is not printed back to the screen.

   ```powershell
   npx wrangler pages secret put FINNHUB_API_KEY_1 --project-name rettostock-market
   npx wrangler pages secret put FINNHUB_API_KEY_2 --project-name rettostock-market
   ```

   Do not paste keys into a chat, a source file, or `wrangler.toml`. The default allowed browser origin is `https://11qaws.github.io`; changing the website address later only requires adding an `ALLOWED_ORIGINS` Pages variable in Cloudflare.

4. Deploy the cache service:

   ```powershell
   npx wrangler pages deploy public --project-name rettostock-market
   ```

   At the end, PowerShell shows an address such as `https://rettostock-market.pages.dev`. Copy that whole address. You can also find it later at [Cloudflare Dashboard > Workers & Pages](https://dash.cloudflare.com/) > `rettostock-market` > **Deployments**.

5. In GitHub, open the `11qaws/rettostock` repository > **Settings** > **Secrets and variables** > **Actions** > **Variables** > **New repository variable**. Enter:

   | Field | Value |
   | --- | --- |
   | Name | `MARKET_API_BASE` |
   | Value | the `.pages.dev` address copied in step 4 |

   Save it. The next GitHub Pages deployment uses the cache automatically; there is no new setting in the OBS widget or no new URL to copy.

The app deliberately keeps its current direct REST route while the variable is empty, so deploying this branch alone cannot interrupt an existing OBS source. Once the variable is set, quote, metric, and market-status REST traffic uses this service and does not fall back to direct REST on failure; that prevents an outage from causing a browser-side request stampede.

## Free-plan boundary

Cloudflare Pages Functions use the Workers Free dynamic-request allowance (100,000 requests/day, account-wide). A constantly running overlay calls the quote route about 17,280 times/day, so this design is appropriate for a small beta (roughly five always-on overlays before allowing headroom), not an unrestricted public relay. Cache API is location-local, so users in separate Cloudflare locations do not share a single global cache entry.

The direct Finnhub WebSocket is intentionally left in place to retain sub-second on-screen trade ticks. Relaying it without changing the experience requires stateful, long-lived connections, whose free quotas are less suitable than this HTTP cache layer.
