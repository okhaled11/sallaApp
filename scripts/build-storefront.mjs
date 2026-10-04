// Generates public/storefront/incentive.js: the stable storefront script that
// loads its config/rules from /api/incentive-config at runtime.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { generateStorefrontTrackingScript, DEFAULT_INCENTIVE_CONFIG } = await import(
  pathToFileURL(resolve(root, "src/utils/visitorIncentives.js")).href
);

// Disabled by default: nothing shows until the merchant publishes settings.
const script = generateStorefrontTrackingScript(
  { ...DEFAULT_INCENTIVE_CONFIG, enabled: false },
  "",
  false,
  [],
  { remote: true },
);

const out = resolve(root, "public/storefront/incentive.js");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, script);
console.log(`Wrote ${out} (${script.length} bytes)`);
