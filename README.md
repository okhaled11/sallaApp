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

This is a **single-merchant development setup**: the store's Salla API access token is set as an environment variable.

## How It Works

```
1. embedded.init()            - Initialize SDK and get layout info (theme, locale…)
2. embedded.auth.getToken()   - Get the embedded token from URL (?token=XXX)
3. POST /api/verify-token     - Verify the embedded token with Salla
4. embedded.ready()           - Remove the dashboard loading overlay
5. POST /api/products         - Server verifies the embedded token again, then
                                GET /admin/v2/products with SALLA_ACCESS_TOKEN
6. POST /api/update-product   - Same verification, validates price / quantity,
                                then PUT /admin/v2/products/{id} with SALLA_ACCESS_TOKEN
```

## Merchant Authentication

There are **two different tokens** in this app:

| Token                  | Where it comes from                                 | Used for                                           |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------- |
| **Embedded token**     | `?token=...` / `embedded.auth.getToken()`           | Proving the request comes from a dashboard session |
| **SALLA_ACCESS_TOKEN** | `app.store.authorize` webhook → `data.access_token` | Calling the Salla Merchant API (products)          |

`SALLA_ACCESS_TOKEN` is read only on the server (`process.env.SALLA_ACCESS_TOKEN`) and sent to Salla as `Authorization: Bearer <SALLA_ACCESS_TOKEN>`. It is never returned to the browser or logged.

### Getting / replacing the access token

1. In Salla Partners, set the app's Webhook URL to a temporary inspector (e.g. [webhook.site](https://webhook.site)).
2. Install (or reinstall) the app on your demo store.
3. Copy `data.access_token` from the `app.store.authorize` request.
4. Set it as `SALLA_ACCESS_TOKEN` in Vercel and **redeploy**.

Access tokens expire after 14 days, and reinstalling the app issues a new one. When the app shows _"Salla API returned 401: SALLA_ACCESS_TOKEN is invalid or expired"_, repeat the steps above.

## Configuration

Environment variables (Vercel → Project → Settings → Environment Variables). Do not use the `VITE_` prefix: these must stay server-side.

| Variable              | Required | Description                                                                    |
| --------------------- | -------- | ------------------------------------------------------------------------------ |
| `SALLA_ACCESS_TOKEN`  | Yes      | Merchant OAuth access token for your store (needs `products.read_write` scope) |
| `SALLA_CLIENT_ID`     | No       | App Client ID. Not read by the code yet (kept for future OAuth work)           |
| `SALLA_CLIENT_SECRET` | No       | App Client Secret. Not read by the code yet (kept for future OAuth work)       |
| `ENV`                 | No       | `prod` (default) or `dev`, selects the Salla embedded token service            |

No database is needed. The app URL must contain `?app_id=YOUR_APP_ID` (used to verify the embedded token). See `.env.example`.

## Usage

1. Add the deployment link for this app to your app in Salla Partners
2. Enable **Products → Read & Write** in App Scopes, install the app on your demo store
3. Set `SALLA_ACCESS_TOKEN` (see above) and redeploy
4. Open the app from the merchant dashboard; use **Refresh** to reload products

## Development

```bash
pnpm install          # install dependencies
pnpm dev              # frontend only
pnpm dev:netlify      # frontend + serverless functions (reads .env)
pnpm test             # run tests
pnpm build            # production build
```

## License

MIT
