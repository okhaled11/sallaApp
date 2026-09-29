/**
 * Dashboard-side helpers for the promo campaign builder.
 */
import {
  DEFAULT_DESIGN,
  DEFAULT_TRIGGER,
  MAX_PRODUCTS,
  toCampaignProducts,
} from "../../shared/campaign.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createDraft(now = Date.now()) {
  return {
    productIds: [],
    discountPercent: 20,
    endsAt: new Date(now + 3 * DAY_MS).toISOString(),
    design: { ...DEFAULT_DESIGN },
    trigger: { ...DEFAULT_TRIGGER },
  };
}

/** Editable draft from a published snapshot (App Settings) */
export function draftFromSnapshot(snapshot, now = Date.now()) {
  if (!snapshot) return createDraft(now);
  const defaults = createDraft(now);
  const endsAt =
    new Date(snapshot.endsAt).getTime() > now
      ? snapshot.endsAt
      : defaults.endsAt;
  return {
    productIds: (snapshot.products || []).map((p) => p.id),
    discountPercent: snapshot.discountPercent ?? defaults.discountPercent,
    endsAt,
    design: { ...defaults.design, ...(snapshot.design || {}) },
    trigger: { ...defaults.trigger, ...(snapshot.trigger || {}) },
  };
}

/** Same public shape the storefront receives, for the live preview */
export function toPreviewCampaign(draft, products) {
  return {
    discountPercent: draft.discountPercent,
    endsAt: draft.endsAt,
    design: draft.design,
    trigger: draft.trigger,
    products: toCampaignProducts(
      draft.productIds,
      products,
      draft.discountPercent,
    ),
    updatedAt: "preview",
  };
}

/**
 * Products worth promoting first: never sold with stock waiting (by the
 * money sitting on the shelf), then slow sellers.
 */
export function rankCandidates(products) {
  const stockValue = (p) =>
    (p.salePrice ?? p.price ?? 0) * (p.quantity > 0 ? p.quantity : 0);
  const isIdle = (p) => p.soldQuantity === 0 && p.quantity !== 0;

  return [...products].sort(
    (a, b) =>
      Number(isIdle(b)) - Number(isIdle(a)) ||
      a.soldQuantity - b.soldQuantity ||
      stockValue(b) - stockValue(a),
  );
}

/** Suggested first pick: the idle products holding the most stock value */
export function suggestProductIds(products, limit = 3) {
  return rankCandidates(products)
    .filter((p) => p.soldQuantity === 0 && p.quantity !== 0)
    .slice(0, Math.min(limit, MAX_PRODUCTS))
    .map((p) => p.id);
}

export { MAX_PRODUCTS };
