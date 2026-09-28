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

It supports any number of stores: each store's Salla API tokens are stored in PostgreSQL and refreshed automatically.

## How It Works

```
1. embedded.init()            - Initialize SDK and get layout info (theme, locale…)
2. embedded.auth.getToken()   - Get the embedded token from URL (?token=XXX)
3. POST /api/verify-token     - Verify the token with Salla
4. embedded.ready()           - Remove the dashboard loading overlay
5. POST /api/products         - Server introspects the embedded token -> merchant_id,
                                loads that store's access token from the database,
                                then GET /admin/v2/products
6. POST /api/update-product   - Same identification, validates price / quantity,
                                then PUT /admin/v2/products/{id}
```

## Merchant Authentication & Token Management

There are **two different tokens** in this app:

| Token                     | Where it comes from                                 | Used for                                           | Lives in               |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------- | ---------------------- |
| **Embedded token**        | `?token=...` / `embedded.auth.getToken()`           | Proving the request comes from a dashboard session | Browser (short-lived)  |
| **Merchant access token** | `app.store.authorize` webhook → `data.access_token` | Calling the Salla Merchant API (products, …)       | Database (server only) |

Flow:

```
Salla installation (merchant installs / reinstalls the app)
      ↓
app.store.authorize  (Salla sends access_token, refresh_token, expires, scope)
      ↓
Webhook  POST /api/webhooks/salla   (signature / token verified)
      ↓
Database  salla_merchant_tokens     (UPSERT by merchant_id)
      ↓
Access token  getValidAccessToken(merchantId)
      ↓
Automatic refresh  (5 min before expiry, or after a 401 from Salla)
      ↓
Salla API  Authorization: Bearer <access_token>
```

**You no longer copy merchant access tokens into Vercel.** When a store installs or reinstalls the app, Salla sends `app.store.authorize` to the webhook and the tokens are saved automatically. `SALLA_ACCESS_TOKEN` is not used anymore and can be deleted.

### Which store is calling?

The browser only sends the embedded token and `app_id`. The server calls Salla's `exchange-authority/v1/introspect` (the same endpoint `embedded.auth.introspect()` uses) and takes `merchant_id` from Salla's answer. A merchant ID sent by the browser is never trusted.

### Automatic refresh

- Access tokens last 14 days, refresh tokens 1 month (Salla docs).
- `server/lib/salla-token-manager.js` returns the stored token while it is valid for more than 5 minutes.
- Otherwise it refreshes with `POST https://accounts.salla.sa/oauth2/token` (`grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`) and saves the **new** access token, the **new** refresh token and the new expiry.
- If Salla rejects a token with 401 anyway, it refreshes once and retries.
- **Concurrency:** Salla revokes all of a store's tokens if the same refresh token is used twice. The refresh therefore runs inside a Postgres transaction holding `SELECT ... FOR UPDATE` on the store's row. A second request (on any serverless instance) waits for the lock, then sees the freshly saved token and reuses it instead of refreshing again.
- If the refresh token is expired or revoked, the API answers with a clear `TOKEN_REFRESH_FAILED` error asking to reinstall the app.

### Errors returned to the app

`{ success: false, error: "<safe message>", code: "<CODE>" }` where `code` is one of:
`EMBEDDED_TOKEN_INVALID`, `MERCHANT_UNKNOWN`, `MERCHANT_NOT_AUTHORIZED`, `MERCHANT_TOKEN_MISSING`, `TOKEN_REFRESH_FAILED`, `SALLA_UNAUTHORIZED` (Salla 401), `SALLA_FORBIDDEN` (Salla 403 / insufficient scope), `SALLA_API_ERROR`, `DATABASE_ERROR`, `CONFIG_MISSING`.
Tokens, secrets and the database URL are never returned or logged.

## Configuration

Environment variables (Vercel → Project → Settings → Environment Variables). None of them use the `VITE_` prefix, so they are never bundled into the frontend.

| Variable               | Required | Description                                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `SALLA_CLIENT_ID`      | Yes      | App Client ID (Salla Partners → your app → App Keys)                                        |
| `SALLA_CLIENT_SECRET`  | Yes      | App Client Secret (same page). Used only for token refresh                                  |
| `SALLA_WEBHOOK_SECRET` | Yes      | Webhook secret (Salla Partners → your app → Webhooks). Used to verify `/api/webhooks/salla` |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string: `postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |
| `ENV`                  | No       | `prod` (default) or `dev`, selects the Salla embedded token service                         |

The app URL must contain `?app_id=YOUR_APP_ID` (used to verify the embedded token). See `.env.example`.

## Setup

### 1. Database

Any PostgreSQL works. On Vercel: **Storage → Create Database → Neon (Postgres)** and connect it to the project; it adds `DATABASE_URL` for you.

Create the table (safe to run again):

```bash
# with the URL inline
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require" pnpm db:migrate

# or from a local .env file
node --env-file=.env scripts/db-migrate.js
```

The schema is in `db/schema.sql` (table `salla_merchant_tokens`, `merchant_id` is the primary key).

### 2. Salla Partners

1. **App Scopes:** enable **Products → Read & Write** (and keep offline access, needed for refresh tokens).
2. **Webhooks:** set the Webhook URL to `https://YOUR-DOMAIN/api/webhooks/salla`, choose the security strategy (**Signature** recommended) and copy the secret into `SALLA_WEBHOOK_SECRET`.
3. **App URL:** your deployment URL (the embedded page).

### 3. Deploy, then install

Deploy to Vercel, then install (or reinstall) the app on the store. Salla sends `app.store.authorize`, the tokens are stored, and the products page works. Existing installs need **one reinstall** after this change so their tokens reach the database.

## Development

```bash
pnpm install          # install dependencies
pnpm dev              # frontend only
pnpm dev:netlify      # frontend + serverless functions (reads .env)
pnpm test             # run tests
pnpm build            # production build
pnpm db:migrate       # create the database table (needs DATABASE_URL)
```

## License

MIT
