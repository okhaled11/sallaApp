/**
 * Cart incentives: default settings and the demo cart used by the preview.
 * Customer-facing texts are Arabic (the storefront language).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function createDefaultSettings(now = Date.now()) {
  return {
    freeShipping: { enabled: true, threshold: 200 },
    countdown: { enabled: true, endsAt: new Date(now + DAY_MS).toISOString() },
    coupon: {
      enabled: true,
      code: "ZAWWID10",
      text: "خصم 10% على أول طلب",
      // inline: card inside the cart · popup: floating card
      display: "inline",
    },
    lowStock: { enabled: true, threshold: 5 },
  };
}

export const DEMO_CART = {
  currency: "ر.س",
  baseTotal: 155,
  addOns: [
    { id: "incense", name: "بخور معطر", price: 25 },
    { id: "gift-box", name: "علبة هدية", price: 40 },
  ],
  // Item used to demo the "remaining stock" message
  lowStockItem: { name: "بخور معطر", stock: 3 },
};
