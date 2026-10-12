// vite.config.js
import { defineConfig } from "file:///C:/Users/TAR/Desktop/embedded-sdk-playground/node_modules/.pnpm/vite@5.4.17_@types+node@25.6.0/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/TAR/Desktop/embedded-sdk-playground/node_modules/.pnpm/@vitejs+plugin-react@5.2.0_vite@5.4.17_@types+node@25.6.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import { loadEnv } from "file:///C:/Users/TAR/Desktop/embedded-sdk-playground/node_modules/.pnpm/vite@5.4.17_@types+node@25.6.0/node_modules/vite/dist/node/index.js";
function devCouponApi() {
  return {
    name: "dev-create-coupon-api",
    apply: "serve",
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, "");
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === void 0) process.env[k] = v;
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
        ["/api/scan-session", "/server/lib/scan-session-core.js", "scanSessionRequest"],
        ["/api/visual-search", "/server/lib/visual-search-core.js", "visualSearchRequest"],
        ["/api/webhooks/salla", "/server/lib/webhook-core.js", "sallaWebhookRequest"]
      ];
      for (const [route, modulePath, exportName] of routes) {
        server.middlewares.use(route, async (req, res) => {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const mod = await server.ssrLoadModule(modulePath);
          const { statusCode, headers, body, isBase64Encoded } = await mod[exportName]({
            method: req.method,
            body: Buffer.concat(chunks).toString("utf8"),
            query: Object.fromEntries(new URL(req.url, "http://localhost").searchParams),
            headers: req.headers
          });
          res.statusCode = statusCode;
          for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
          res.end(isBase64Encoded ? Buffer.from(body, "base64") : body);
        });
      }
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), devCouponApi()],
  root: ".",
  build: {
    outDir: "dist"
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.js"],
    include: [
      "src/**/*.{test,spec}.{js,jsx,ts,tsx}",
      "server/**/*.{test,spec}.js",
      "shared/**/*.{test,spec}.js"
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
        "**/main.jsx"
      ]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxUQVJcXFxcRGVza3RvcFxcXFxlbWJlZGRlZC1zZGstcGxheWdyb3VuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcVEFSXFxcXERlc2t0b3BcXFxcZW1iZWRkZWQtc2RrLXBsYXlncm91bmRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL1RBUi9EZXNrdG9wL2VtYmVkZGVkLXNkay1wbGF5Z3JvdW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgeyBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcclxuXHJcbi8vIFNlcnZlcyAvYXBpL2NyZWF0ZS1jb3Vwb24gZHVyaW5nIGB2aXRlYCBkZXYgKG5vIFZlcmNlbC9OZXRsaWZ5IHJ1bnRpbWUgdGhlcmUpLlxyXG5mdW5jdGlvbiBkZXZDb3Vwb25BcGkoKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6IFwiZGV2LWNyZWF0ZS1jb3Vwb24tYXBpXCIsXHJcbiAgICBhcHBseTogXCJzZXJ2ZVwiLFxyXG4gICAgY29uZmlnUmVzb2x2ZWQoY29uZmlnKSB7XHJcbiAgICAgIGNvbnN0IGVudiA9IGxvYWRFbnYoY29uZmlnLm1vZGUsIGNvbmZpZy5yb290LCBcIlwiKTtcclxuICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoZW52KSkge1xyXG4gICAgICAgIGlmIChwcm9jZXNzLmVudltrXSA9PT0gdW5kZWZpbmVkKSBwcm9jZXNzLmVudltrXSA9IHY7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XHJcbiAgICAgIGNvbnN0IHJvdXRlcyA9IFtcclxuICAgICAgICBbXCIvYXBpL2NyZWF0ZS1jb3Vwb25cIiwgXCIvc2VydmVyL2xpYi9jb3Vwb25zLWNvcmUuanNcIiwgXCJjcmVhdGVDb3Vwb25SZXF1ZXN0XCJdLFxyXG4gICAgICAgIFtcIi9hcGkvY3JlYXRlLW9mZmVyXCIsIFwiL3NlcnZlci9saWIvc3BlY2lhbC1vZmZlcnMtY29yZS5qc1wiLCBcImNyZWF0ZU9mZmVyUmVxdWVzdFwiXSxcclxuICAgICAgICBbXCIvYXBpL3Jpc2t5LW9yZGVyc1wiLCBcIi9zZXJ2ZXIvbGliL3Jpc2t5LW9yZGVycy1jb3JlLmpzXCIsIFwicmlza3lPcmRlcnNSZXF1ZXN0XCJdLFxyXG4gICAgICAgIFtcIi9hcGkvY291cG9uLXN0YXRzXCIsIFwiL3NlcnZlci9saWIvY291cG9uLXN0YXRzLWNvcmUuanNcIiwgXCJjb3Vwb25TdGF0c1JlcXVlc3RcIl0sXHJcbiAgICAgICAgW1wiL2FwaS9pbmNlbnRpdmUtY29uZmlnXCIsIFwiL3NlcnZlci9saWIvaW5jZW50aXZlLWNvbmZpZy1jb3JlLmpzXCIsIFwiaW5jZW50aXZlQ29uZmlnUmVxdWVzdFwiXSxcclxuICAgICAgICBbXCIvYXBpL2luY2VudGl2ZS1vZmZlcnNcIiwgXCIvc2VydmVyL2xpYi9pbmNlbnRpdmUtb2ZmZXJzLWNvcmUuanNcIiwgXCJpbmNlbnRpdmVPZmZlcnNSZXF1ZXN0XCJdLFxyXG4gICAgICAgIFtcIi9hcGkvdHJ5b24tY29uZmlnXCIsIFwiL3NlcnZlci9saWIvdHJ5b24tY29uZmlnLWNvcmUuanNcIiwgXCJ0cnlvbkNvbmZpZ1JlcXVlc3RcIl0sXHJcbiAgICAgICAgW1wiL2FwaS9zY2FuLXNlc3Npb25cIiwgXCIvc2VydmVyL2xpYi9zY2FuLXNlc3Npb24tY29yZS5qc1wiLCBcInNjYW5TZXNzaW9uUmVxdWVzdFwiXSxcclxuICAgICAgICBbXCIvYXBpL3Zpc3VhbC1zZWFyY2hcIiwgXCIvc2VydmVyL2xpYi92aXN1YWwtc2VhcmNoLWNvcmUuanNcIiwgXCJ2aXN1YWxTZWFyY2hSZXF1ZXN0XCJdLFxyXG4gICAgICAgIFtcIi9hcGkvd2ViaG9va3Mvc2FsbGFcIiwgXCIvc2VydmVyL2xpYi93ZWJob29rLWNvcmUuanNcIiwgXCJzYWxsYVdlYmhvb2tSZXF1ZXN0XCJdLFxyXG4gICAgICBdO1xyXG4gICAgICBmb3IgKGNvbnN0IFtyb3V0ZSwgbW9kdWxlUGF0aCwgZXhwb3J0TmFtZV0gb2Ygcm91dGVzKSB7XHJcbiAgICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZShyb3V0ZSwgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBjaHVua3MgPSBbXTtcclxuICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgYyBvZiByZXEpIGNodW5rcy5wdXNoKGMpO1xyXG4gICAgICAgICAgY29uc3QgbW9kID0gYXdhaXQgc2VydmVyLnNzckxvYWRNb2R1bGUobW9kdWxlUGF0aCk7XHJcbiAgICAgICAgICBjb25zdCB7IHN0YXR1c0NvZGUsIGhlYWRlcnMsIGJvZHksIGlzQmFzZTY0RW5jb2RlZCB9ID0gYXdhaXQgbW9kW2V4cG9ydE5hbWVdKHtcclxuICAgICAgICAgICAgbWV0aG9kOiByZXEubWV0aG9kLFxyXG4gICAgICAgICAgICBib2R5OiBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoXCJ1dGY4XCIpLFxyXG4gICAgICAgICAgICBxdWVyeTogT2JqZWN0LmZyb21FbnRyaWVzKG5ldyBVUkwocmVxLnVybCwgXCJodHRwOi8vbG9jYWxob3N0XCIpLnNlYXJjaFBhcmFtcyksXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHJlcS5oZWFkZXJzLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICByZXMuc3RhdHVzQ29kZSA9IHN0YXR1c0NvZGU7XHJcbiAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhoZWFkZXJzIHx8IHt9KSkgcmVzLnNldEhlYWRlcihrLCB2KTtcclxuICAgICAgICAgIHJlcy5lbmQoaXNCYXNlNjRFbmNvZGVkID8gQnVmZmVyLmZyb20oYm9keSwgXCJiYXNlNjRcIikgOiBib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtyZWFjdCgpLCBkZXZDb3Vwb25BcGkoKV0sXHJcbiAgcm9vdDogXCIuXCIsXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogXCJkaXN0XCIsXHJcbiAgfSxcclxuICB0ZXN0OiB7XHJcbiAgICBlbnZpcm9ubWVudDogXCJqc2RvbVwiLFxyXG4gICAgZ2xvYmFsczogdHJ1ZSxcclxuICAgIHNldHVwRmlsZXM6IFtcInNyYy90ZXN0L3NldHVwLmpzXCJdLFxyXG4gICAgaW5jbHVkZTogW1xyXG4gICAgICBcInNyYy8qKi8qLnt0ZXN0LHNwZWN9Lntqcyxqc3gsdHMsdHN4fVwiLFxyXG4gICAgICBcInNlcnZlci8qKi8qLnt0ZXN0LHNwZWN9LmpzXCIsXHJcbiAgICAgIFwic2hhcmVkLyoqLyoue3Rlc3Qsc3BlY30uanNcIixcclxuICAgIF0sXHJcbiAgICBjb3ZlcmFnZToge1xyXG4gICAgICBwcm92aWRlcjogXCJ2OFwiLFxyXG4gICAgICByZXBvcnRlcjogW1widGV4dFwiLCBcImxjb3ZcIl0sXHJcbiAgICAgIG91dHB1dERpcjogXCJjb3ZlcmFnZVwiLFxyXG4gICAgICBleGNsdWRlOiBbXHJcbiAgICAgICAgXCJub2RlX21vZHVsZXMvXCIsXHJcbiAgICAgICAgXCJkaXN0L1wiLFxyXG4gICAgICAgIFwiLmVzbGludHJjLmNqc1wiLFxyXG4gICAgICAgIFwiKiovKi5jb25maWcuanNcIixcclxuICAgICAgICBcIioqL3Rlc3QvKipcIixcclxuICAgICAgICBcIioqL19fdGVzdHNfXy8qKlwiLFxyXG4gICAgICAgIFwicHVibGljLyoqXCIsXHJcbiAgICAgICAgXCJzY3JpcHRzLyoqXCIsXHJcbiAgICAgICAgXCJzZXJ2ZXIvKipcIixcclxuICAgICAgICBcIioqL21haW4uanN4XCIsXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWdVLFNBQVMsb0JBQW9CO0FBQzdWLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFHeEIsU0FBUyxlQUFlO0FBQ3RCLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLGVBQWUsUUFBUTtBQUNyQixZQUFNLE1BQU0sUUFBUSxPQUFPLE1BQU0sT0FBTyxNQUFNLEVBQUU7QUFDaEQsaUJBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxPQUFPLFFBQVEsR0FBRyxHQUFHO0FBQ3hDLFlBQUksUUFBUSxJQUFJLENBQUMsTUFBTSxPQUFXLFNBQVEsSUFBSSxDQUFDLElBQUk7QUFBQSxNQUNyRDtBQUFBLElBQ0Y7QUFBQSxJQUNBLGdCQUFnQixRQUFRO0FBQ3RCLFlBQU0sU0FBUztBQUFBLFFBQ2IsQ0FBQyxzQkFBc0IsK0JBQStCLHFCQUFxQjtBQUFBLFFBQzNFLENBQUMscUJBQXFCLHNDQUFzQyxvQkFBb0I7QUFBQSxRQUNoRixDQUFDLHFCQUFxQixvQ0FBb0Msb0JBQW9CO0FBQUEsUUFDOUUsQ0FBQyxxQkFBcUIsb0NBQW9DLG9CQUFvQjtBQUFBLFFBQzlFLENBQUMseUJBQXlCLHdDQUF3Qyx3QkFBd0I7QUFBQSxRQUMxRixDQUFDLHlCQUF5Qix3Q0FBd0Msd0JBQXdCO0FBQUEsUUFDMUYsQ0FBQyxxQkFBcUIsb0NBQW9DLG9CQUFvQjtBQUFBLFFBQzlFLENBQUMscUJBQXFCLG9DQUFvQyxvQkFBb0I7QUFBQSxRQUM5RSxDQUFDLHNCQUFzQixxQ0FBcUMscUJBQXFCO0FBQUEsUUFDakYsQ0FBQyx1QkFBdUIsK0JBQStCLHFCQUFxQjtBQUFBLE1BQzlFO0FBQ0EsaUJBQVcsQ0FBQyxPQUFPLFlBQVksVUFBVSxLQUFLLFFBQVE7QUFDcEQsZUFBTyxZQUFZLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUTtBQUNoRCxnQkFBTSxTQUFTLENBQUM7QUFDaEIsMkJBQWlCLEtBQUssSUFBSyxRQUFPLEtBQUssQ0FBQztBQUN4QyxnQkFBTSxNQUFNLE1BQU0sT0FBTyxjQUFjLFVBQVU7QUFDakQsZ0JBQU0sRUFBRSxZQUFZLFNBQVMsTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLElBQUksVUFBVSxFQUFFO0FBQUEsWUFDM0UsUUFBUSxJQUFJO0FBQUEsWUFDWixNQUFNLE9BQU8sT0FBTyxNQUFNLEVBQUUsU0FBUyxNQUFNO0FBQUEsWUFDM0MsT0FBTyxPQUFPLFlBQVksSUFBSSxJQUFJLElBQUksS0FBSyxrQkFBa0IsRUFBRSxZQUFZO0FBQUEsWUFDM0UsU0FBUyxJQUFJO0FBQUEsVUFDZixDQUFDO0FBQ0QsY0FBSSxhQUFhO0FBQ2pCLHFCQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxRQUFRLFdBQVcsQ0FBQyxDQUFDLEVBQUcsS0FBSSxVQUFVLEdBQUcsQ0FBQztBQUN0RSxjQUFJLElBQUksa0JBQWtCLE9BQU8sS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQUEsUUFDOUQsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxhQUFhLENBQUM7QUFBQSxFQUNqQyxNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osYUFBYTtBQUFBLElBQ2IsU0FBUztBQUFBLElBQ1QsWUFBWSxDQUFDLG1CQUFtQjtBQUFBLElBQ2hDLFNBQVM7QUFBQSxNQUNQO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixVQUFVLENBQUMsUUFBUSxNQUFNO0FBQUEsTUFDekIsV0FBVztBQUFBLE1BQ1gsU0FBUztBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
