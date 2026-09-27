# Product Sales

A Salla embedded app that lists the store's products and shows how many times each product has been sold.

## Overview

The app runs inside the Salla merchant dashboard (iframe) using `@salla.sa/embedded-sdk`. Once connected it:

- Lists every product in the store, sorted by best sellers first
- Shows the number of units sold for each product (`sold_quantity` from the Salla Merchant API)
- Shows a summary: product count, total units sold, and best seller
- Lets the merchant search by product name or SKU

## How It Works

```
1. embedded.init()            - Initialize SDK and get layout info (theme, locale…)
2. embedded.auth.getToken()   - Get the embedded token from URL (?token=XXX)
3. POST /api/verify-token     - Verify the token with Salla
4. embedded.ready()           - Remove the dashboard loading overlay
5. POST /api/products         - Server verifies the token again, then fetches
                                all products from GET /admin/v2/products
```

The Salla Merchant API is only called from the serverless function, so the merchant access token never reaches the browser.

## Configuration

Set these environment variables on Vercel / Netlify:

| Variable             | Required | Description                                                                             |
| -------------------- | -------- | --------------------------------------------------------------------------------------- |
| `SALLA_ACCESS_TOKEN` | Yes      | Merchant OAuth access token for the store (needs `products.read` scope)                 |
| `ENV`                | No       | `prod` (default) or `dev`, selects the Salla token verification service                 |

The app also expects `?app_id=YOUR_APP_ID` in the app URL (used to verify the embedded token).

> **Note:** `SALLA_ACCESS_TOKEN` is a single store token, which is fine for testing on one store. For an app installed on many stores, store each merchant's access token (from the `app.store.authorize` webhook) and look it up by the verified `merchant_id`.

## Usage

1. Add the deployment link for this app to your app in Salla Partners
2. Install the app on your test store and set `SALLA_ACCESS_TOKEN`
3. Open the app from the merchant dashboard
4. The products and their sales appear automatically; use **Refresh** to reload

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (frontend only)
pnpm dev

# Start with serverless functions (Netlify)
pnpm dev:netlify

# Run tests
pnpm test

# Build for production
pnpm build
```

## License

MIT
