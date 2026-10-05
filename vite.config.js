import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

// Serves /api/create-coupon during `vite` dev (no Vercel/Netlify runtime there).
function devCouponApi() {
  return {
    name: "dev-create-coupon-api",
    apply: "serve",
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, "");
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    },
    configureServer(server) {
      const routes = [
        ["/api/create-coupon", "/server/lib/coupons-core.js", "createCouponRequest"],
        ["/api/create-offer", "/server/lib/special-offers-core.js", "createOfferRequest"],
        ["/api/risky-orders", "/server/lib/risky-orders-core.js", "riskyOrdersRequest"],
        ["/api/coupon-stats", "/server/lib/coupon-stats-core.js", "couponStatsRequest"],
        ["/api/incentive-config", "/server/lib/incentive-config-core.js", "incentiveConfigRequest"],
        ["/api/incentive-offers", "/server/lib/incentive-offers-core.js", "incentiveOffersRequest"],
        ["/api/tryon-config", "/server/lib/tryon-config-core.js", "tryonConfigRequest"],
        ["/api/webhooks/salla", "/server/lib/webhook-core.js", "sallaWebhookRequest"],
      ];
      for (const [route, modulePath, exportName] of routes) {
        server.middlewares.use(route, async (req, res) => {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const mod = await server.ssrLoadModule(modulePath);
          const { statusCode, headers, body } = await mod[exportName]({
            method: req.method,
            body: Buffer.concat(chunks).toString("utf8"),
            query: Object.fromEntries(new URL(req.url, "http://localhost").searchParams),
            headers: req.headers,
          });
          res.statusCode = statusCode;
          for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
          res.end(body);
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), devCouponApi()],
  root: ".",
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.js"],
    include: [
      "src/**/*.{test,spec}.{js,jsx,ts,tsx}",
      "server/**/*.{test,spec}.js",
      "shared/**/*.{test,spec}.js",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      outputDir: "coverage",
      exclude: [
        "node_modules/",
        "dist/",
        ".eslintrc.cjs",
        "**/*.config.js",
        "**/test/**",
        "**/__tests__/**",
        "public/**",
        "scripts/**",
        "server/**",
        "**/main.jsx",
      ],
    },
  },
});
