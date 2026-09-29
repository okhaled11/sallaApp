/**
 * Promo campaign schema, shared by the dashboard (live validation, preview)
 * and the server (authoritative validation) so both apply the same rules.
 * Pure JS: no browser or Node APIs.
 */

export const MAX_PRODUCTS = 6;
export const MAX_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export const THEMES = ["light", "dark"];
export const POSITIONS = ["center", "bottom"];
export const FREQUENCIES = ["always", "session", "day"];

export const DEFAULT_DESIGN = {
  title: "عرض لفترة محدودة",
  message: "خصم خاص على منتجات اخترناها لك",
  buttonText: "تسوق الآن",
  accentColor: "#004d5b",
  theme: "light",
  position: "center",
};

export const DEFAULT_TRIGGER = { delaySeconds: 3, frequency: "session" };

// Plain text only: the storefront renders with textContent, never as HTML
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, max)
  );
}

/**
 * @returns {{ campaign?: object, error?: string }}
 */
export function validateCampaign(input, now = Date.now()) {
  if (!input || typeof input !== "object") {
    return { error: "Campaign is required" };
  }

  const productIds = Array.isArray(input.productIds)
    ? [...new Set(input.productIds)]
    : [];
  if (
    productIds.length === 0 ||
    productIds.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    return { error: "Choose at least one product" };
  }
  if (productIds.length > MAX_PRODUCTS) {
    return { error: `Choose up to ${MAX_PRODUCTS} products` };
  }

  const discountPercent = input.discountPercent;
  if (
    !Number.isInteger(discountPercent) ||
    discountPercent < 1 ||
    discountPercent > 90
  ) {
    return { error: "Discount must be a whole number from 1 to 90%" };
  }

  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now) {
    return { error: "The countdown must end in the future" };
  }
  if (endsAt.getTime() > now + MAX_DAYS * DAY_MS) {
    return { error: `The countdown can run for up to ${MAX_DAYS} days` };
  }

  const design = { ...DEFAULT_DESIGN, ...(input.design || {}) };
  const title = cleanText(design.title, 60);
  const buttonText = cleanText(design.buttonText, 24);
  if (!title) return { error: "Title is required" };
  if (!buttonText) return { error: "Button text is required" };
  if (!/^#[0-9a-f]{6}$/i.test(design.accentColor)) {
    return { error: "Accent color must be a hex color like #004d5b" };
  }
  if (!THEMES.includes(design.theme)) return { error: "Invalid theme" };
  if (!POSITIONS.includes(design.position)) {
    return { error: "Invalid position" };
  }

  const trigger = { ...DEFAULT_TRIGGER, ...(input.trigger || {}) };
  if (
    !Number.isInteger(trigger.delaySeconds) ||
    trigger.delaySeconds < 0 ||
    trigger.delaySeconds > 60
  ) {
    return { error: "Delay must be 0 to 60 seconds" };
  }
  if (!FREQUENCIES.includes(trigger.frequency)) {
    return { error: "Invalid frequency" };
  }

  return {
    campaign: {
      productIds,
      discountPercent,
      endsAt: endsAt.toISOString(),
      design: {
        title,
        message: cleanText(design.message, 140),
        buttonText,
        accentColor: design.accentColor.toLowerCase(),
        theme: design.theme,
        position: design.position,
      },
      trigger: {
        delaySeconds: trigger.delaySeconds,
        frequency: trigger.frequency,
      },
    },
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * What the popup shows for each product (price after the campaign discount).
 * Products are the dashboard/server shape: { id, name, image, url, currency,
 * price, salePrice }.
 */
export function toCampaignProducts(productIds, products, discountPercent) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return productIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => {
      const price = p.salePrice ?? p.price;
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        url: p.url,
        currency: p.currency,
        price,
        finalPrice:
          price == null ? null : round2(price * (1 - discountPercent / 100)),
      };
    });
}
