# Product Sales

A Salla embedded app that lists the store's products and shows how many times each product has been sold.

## Overview

The app runs inside the Salla merchant dashboard (iframe) using `@salla.sa/embedded-sdk`. Once connected it:

- Lists every product in the store, sorted by best sellers first
- Shows the number of units sold for each product (`sold_quantity` from the Salla Merchant API)
- Shows a summary: product count, total units sold, and best seller
- Lets the merchant search by product name or SKU
- Shows stock for each product (in stock / out of stock / unlimited)
- Lets the merchant edit a product's **price** and **quantity** inline (pencil button), saved via `PUT /admin/v2/products/{id}`

No access token is copied by hand: each store's tokens arrive by webhook, are kept in Upstash Redis and refreshed automatically.

## How It Works

```
1. embedded.init()            - Initialize SDK and get layout info (theme, locale…)
2. embedded.auth.getToken()   - Get the embedded token from URL (?token=XXX)
3. POST /api/verify-token     - Verify the embedded token with Salla
4. embedded.ready()           - Remove the dashboard loading overlay
5. POST /api/products         - Server introspects the embedded token -> merchant_id,
                                gets that store's access token from Redis,
                                then GET /admin/v2/products
6. POST /api/update-product   - Same, then PUT /admin/v2/products/{id}
```

## Merchant Authentication & Token Management

There are **two different tokens**:

| Token                     | Where it comes from                                 | Used for                                           | Lives in           |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------- | ------------------ |
| **Embedded token**        | `?token=...` / `embedded.auth.getToken()`           | Proving the request comes from a dashboard session | Browser            |
| **Merchant access token** | `app.store.authorize` webhook → `data.access_token` | Calling the Salla Merchant API                     | Redis, server only |

```
Salla installation (install / reinstall the app on a store)
      ↓
app.store.authorize  (access_token, refresh_token, expires, scope)
      ↓
POST /api/webhooks/salla   (signature / token verified with SALLA_WEBHOOK_SECRET)
      ↓
Upstash Redis  salla:merchant:<id>:tokens
      ↓
getValidAccessToken(merchantId)
      ↓
Automatic refresh  (5 min before expiry, or after a 401 from Salla)
      ↓
Salla API  Authorization: Bearer <access_token>
```

- **Which store is calling?** The server introspects the embedded token with Salla (`exchange-authority/v1/introspect`) and uses the `merchant_id` from Salla's answer. The browser never chooses the store.
- **Refresh:** `POST https://accounts.salla.sa/oauth2/token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`. The **new** access token and the **new** refresh token are both saved (Salla refresh tokens are single-use).
- **Concurrency:** Salla revokes a store's tokens if the same refresh token is used twice. Refreshes therefore run under a per-store Redis lock (`SET NX PX` + owner-checked release). Other requests wait, then reuse the freshly saved token.
- **Uninstall:** `app.uninstalled` deletes the store's tokens.
- **Errors** come back as `{ success: false, error, code }` with codes such as `MERCHANT_NOT_AUTHORIZED`, `TOKEN_REFRESH_FAILED`, `SALLA_UNAUTHORIZED`, `SALLA_FORBIDDEN`, `STORAGE_ERROR`, `CONFIG_MISSING`. Tokens and secrets are never returned or logged.

## Configuration

Set these in Vercel → Project → Settings → Environment Variables (then redeploy), and in `.env` for `npx vercel dev`. See `.env.example`. None use the `VITE_` prefix, so they never reach the browser.

| Variable               | Where to get it                                                     |
| ---------------------- | ------------------------------------------------------------------- |
| `SALLA_APP_ID`         | Salla Partners → your app → App Keys (sent to Salla as S-Source)    |
| `SALLA_CLIENT_ID`      | Salla Partners → your app → App Keys                                |
| `SALLA_CLIENT_SECRET`  | Salla Partners → your app → App Keys                                |
| `SALLA_WEBHOOK_SECRET` | Salla Partners → your app → Webhooks → Webhook Secret               |
| `KV_REST_API_URL`      | Added automatically by the Upstash integration (Vercel Marketplace) |
| `KV_REST_API_TOKEN`    | Added automatically by the Upstash integration (Vercel Marketplace) |
| `ENV`                  | `prod` (default) or `dev`, the embedded token service               |

## Setup

1. **Redis:** Vercel → your project → **Storage** → **Upstash for Redis** (Marketplace) → create and connect. This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
2. **Salla Partners:**
   - App Scopes: enable **Products → Read & Write** (keep offline access for refresh tokens).
   - Webhooks: URL `https://YOUR-DOMAIN/api/webhooks/salla`, security strategy **Signature**, copy the secret into `SALLA_WEBHOOK_SECRET`.
   - App URL: your deployment URL.
3. Add the remaining env vars and **redeploy**.
4. **Install (or reinstall) the app** on your demo store. Salla sends `app.store.authorize` and the tokens are stored.
5. Open the app from the merchant dashboard.

## Development

```bash
pnpm install          # install dependencies
npx vercel dev        # frontend + /api functions locally (reads .env)
pnpm dev              # frontend only
pnpm test             # run tests
pnpm build            # production build
```

## License

MIT
