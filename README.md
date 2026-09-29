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

| Variable              | Required  | Description                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------------ |
| `SALLA_ACCESS_TOKEN`  | Yes       | Merchant OAuth access token for your store (needs `products.read_write` scope) |
| `SALLA_APP_ID`        | For popup | App ID. The public storefront endpoint reads the campaign from App Settings    |
| `SALLA_CLIENT_ID`     | No        | App Client ID. Not read by the code yet (kept for future OAuth work)           |
| `SALLA_CLIENT_SECRET` | No        | App Client Secret. Not read by the code yet (kept for future OAuth work)       |
| `ENV`                 | No        | `prod` (default) or `dev`, selects the Salla embedded token service            |

No database is needed. The app URL must contain `?app_id=YOUR_APP_ID` (used to verify the embedded token). See `.env.example`.

## Usage

1. Add the deployment link for this app to your app in Salla Partners
2. Enable **Products → Read & Write** in App Scopes, install the app on your demo store
3. Set `SALLA_ACCESS_TOKEN` (see above) and redeploy
4. Open the app from the merchant dashboard; use **Refresh** to reload products

## Promo Popup (boost unsold products)

The **Boost unsold products** card builds a popup that shows in the store with a **real discount** and a **countdown**, to move products that never sold.

```
Dashboard builder (live preview = the real storefront script)
   │  Publish (confirmed with embedded.ui.confirm)
   ▼
POST /api/campaign
   ├─ Special Offer in Salla (percentage on the chosen products, ends with the countdown)
   └─ Snapshot saved in App Settings, key `promo_campaign` (no database)
   ▼
Store: App Snippet loads /storefront/campaign.js
   │  store id: salla.config.get('store.id')
   ▼
GET /api/storefront-campaign?store=<id>   (public, edge-cached 60s)
   ▼
Popup: Shadow DOM, RTL, accessible dialog, text rendered as text only
```

- **Merchant controls:** up to 6 products (never-sold products suggested first), discount 1–90%, countdown end (up to 90 days), title, message, button text, accent color, light/dark, center or bottom sheet, delay, and frequency (every page / once per visit / once a day).
- **Validation** lives in `shared/campaign.js` and runs in both the dashboard and the server.
- **Stop** turns off the Special Offer and hides the popup.

### One-time setup in Salla Partners

1. **App Scopes:** Special Offers → Read & Write (plus Products → Read & Write), then reinstall the app and update `SALLA_ACCESS_TOKEN`.
2. **App Settings:** add a text field with the key `promo_campaign`.
3. **App Snippet:** paste the code shown under "Store setup" in the dashboard card (the exact copy button also includes your domain). The Snippet field only accepts JavaScript, not an HTML `<script>` tag, so it creates the tag from code instead:
   ```js
   (function () {
     var s = document.createElement("script");
     s.src = "https://YOUR-DOMAIN/storefront/campaign.js";
     s.defer = true;
     document.head.appendChild(s);
   })();
   ```
4. Set `SALLA_APP_ID` in Vercel and redeploy.

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
