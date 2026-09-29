/**
 * Promo campaign: a storefront popup that pushes unsold products with a real
 * discount and a countdown.
 *
 * Where things live (no database needed):
 *   - The discount   -> a Salla Special Offer (percentage on the products),
 *                       so the price is really discounted at checkout.
 *   - The campaign   -> the app's App Settings, key `promo_campaign`
 *                       (define that field in Salla Partners -> App Settings).
 *   - The popup      -> public/storefront/campaign.js, injected into the store
 *                       by the App Snippet. It reads GET /api/storefront-campaign.
 *
 * Endpoints:
 *   POST /api/campaign            { token, appId, action: get | save | stop, campaign? }
 *   GET  /api/storefront-campaign ?store=<id>   (public, cached)
 */
import { respond } from "./verify-token-core.js";
import {
  authorizeRequest,
  errorResponse,
  fetchAllProducts,
  mapProduct,
  sallaError,
} from "./products-core.js";
import { ERROR_CODES, SallaAuthError, logError, requireEnv } from "./errors.js";
import { toCampaignProducts, validateCampaign } from "../../shared/campaign.js";

export {
  DEFAULT_DESIGN,
  DEFAULT_TRIGGER,
  MAX_PRODUCTS,
  validateCampaign,
} from "../../shared/campaign.js";

const SALLA_API = "https://api.salla.dev/admin/v2";
export const CAMPAIGN_SETTING_KEY = "promo_campaign";

// ---------------------------------------------------------------------------
// Salla API helpers
// ---------------------------------------------------------------------------

async function sallaFetch(accessToken, path, { method = "GET", body } = {}) {
  const response = await fetch(`${SALLA_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw sallaError(result, response, `Salla request failed: ${path}`);
  }
  return result.data;
}

/**
 * Salla expects local store time without a timezone. Salla stores run on
 * Saudi time (UTC+3, no daylight saving).
 */
export function toSallaDate(date) {
  const riyadh = new Date(new Date(date).getTime() + 3 * 60 * 60 * 1000);
  return riyadh.toISOString().slice(0, 19);
}

export async function getStoreId(accessToken) {
  const data = await sallaFetch(accessToken, "/store/info");
  return data?.id != null ? String(data.id) : null;
}

async function readSettings(accessToken, appId) {
  const data = await sallaFetch(accessToken, `/apps/${appId}/settings`);
  return data?.settings && typeof data.settings === "object"
    ? data.settings
    : {};
}

export function parseCampaign(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function readCampaign(accessToken, appId) {
  const settings = await readSettings(accessToken, appId);
  return parseCampaign(settings[CAMPAIGN_SETTING_KEY]);
}

async function writeCampaign(accessToken, appId, snapshot) {
  // Salla replaces ALL settings on update: keep the other fields as they are
  const settings = await readSettings(accessToken, appId);
  await sallaFetch(accessToken, `/apps/${appId}/settings`, {
    method: "POST",
    body: { ...settings, [CAMPAIGN_SETTING_KEY]: JSON.stringify(snapshot) },
  });
}

function offerBody({ productIds, discountPercent, endsAt, name }) {
  return {
    name,
    message: name,
    applied_channel: "browser_and_application",
    offer_type: "percentage",
    applied_to: "product",
    start_date: toSallaDate(Date.now()),
    expiry_date: toSallaDate(endsAt),
    min_purchase_amount: 0,
    min_items_count: 0,
    buy: { type: "product", products: productIds, min_amount: 0 },
    get: { discount_amount: discountPercent },
    customer_groups: [],
  };
}

/**
 * Create the Special Offer, or update the campaign's existing one.
 * @returns {Promise<number|string>} offer id
 */
export async function upsertSpecialOffer(accessToken, offerId, campaign) {
  const body = offerBody({
    ...campaign,
    name: `Promo popup ${campaign.discountPercent}%`,
  });

  if (offerId) {
    try {
      await sallaFetch(accessToken, `/specialoffers/${offerId}`, {
        method: "PUT",
        body,
      });
      await sallaFetch(accessToken, `/specialoffers/${offerId}/status`, {
        method: "PUT",
        body: { status: "active" },
      });
      return offerId;
    } catch (error) {
      // The merchant deleted the offer in Salla: create a new one
      if (error?.status !== 404) throw error;
    }
  }

  const created = await sallaFetch(accessToken, "/specialoffers", {
    method: "POST",
    body,
  });
  return created?.id;
}

export async function deactivateSpecialOffer(accessToken, offerId) {
  if (!offerId) return;
  try {
    await sallaFetch(accessToken, `/specialoffers/${offerId}/status`, {
      method: "PUT",
      body: { status: "inactive" },
    });
  } catch (error) {
    // Already gone is fine when stopping
    if (error?.status !== 404) throw error;
  }
}

// ---------------------------------------------------------------------------
// Snapshot: what the storefront needs, frozen at publish time
// ---------------------------------------------------------------------------

export function buildSnapshot({ campaign, products, storeId, offerId }) {
  return {
    version: 1,
    enabled: true,
    storeId,
    offerId,
    discountPercent: campaign.discountPercent,
    endsAt: campaign.endsAt,
    design: campaign.design,
    trigger: campaign.trigger,
    products: toCampaignProducts(
      campaign.productIds,
      products,
      campaign.discountPercent,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Public view for shoppers: no internal ids */
export function toPublicCampaign(snapshot) {
  const { discountPercent, endsAt, design, trigger, products, updatedAt } =
    snapshot;
  return { discountPercent, endsAt, design, trigger, products, updatedAt };
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

function settingsAppId(data) {
  const appId = process.env.SALLA_APP_ID || data.appId;
  if (!appId) {
    throw new SallaAuthError(
      ERROR_CODES.CONFIG_MISSING,
      "Server is missing configuration: SALLA_APP_ID",
      500,
    );
  }
  return appId;
}

/**
 * POST /api/campaign  { token, appId, action, campaign? }
 */
export async function campaignRequest(request) {
  try {
    const { response, data, accessToken } = await authorizeRequest(request);
    if (response) return response;

    const appId = settingsAppId(data);
    const action = data.action || "get";

    if (action === "get") {
      const campaign = await readCampaign(accessToken, appId);
      return respond(200, { success: true, data: { campaign } });
    }

    if (action === "stop") {
      const current = await readCampaign(accessToken, appId);
      if (!current) {
        return respond(200, { success: true, data: { campaign: null } });
      }
      await deactivateSpecialOffer(accessToken, current.offerId);
      const stopped = {
        ...current,
        enabled: false,
        updatedAt: new Date().toISOString(),
      };
      await writeCampaign(accessToken, appId, stopped);
      return respond(200, { success: true, data: { campaign: stopped } });
    }

    if (action === "save") {
      const { campaign, error } = validateCampaign(data.campaign);
      if (error) return respond(400, { success: false, error });

      const mapped = (await fetchAllProducts(accessToken)).map(mapProduct);
      const known = new Set(mapped.map((p) => p.id));
      const missing = campaign.productIds.filter((id) => !known.has(id));
      if (missing.length) {
        return respond(400, {
          success: false,
          error: `Products not found in the store: ${missing.join(", ")}`,
        });
      }

      const current = await readCampaign(accessToken, appId);
      const offerId = await upsertSpecialOffer(
        accessToken,
        current?.offerId,
        campaign,
      );
      const storeId = await getStoreId(accessToken);
      const snapshot = buildSnapshot({
        campaign,
        products: mapped,
        storeId,
        offerId,
      });
      await writeCampaign(accessToken, appId, snapshot);

      return respond(200, { success: true, data: { campaign: snapshot } });
    }

    return respond(400, { success: false, error: "Unknown action" });
  } catch (error) {
    return errorResponse(error, "Campaign error:");
  }
}

const PUBLIC_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function publicRespond(statusCode, payload, cacheSeconds) {
  return {
    statusCode,
    headers: {
      ...PUBLIC_HEADERS,
      // Edge cache: storefront traffic must not hit the Salla API each time
      "Cache-Control": `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
    },
    body: payload === undefined ? "" : JSON.stringify(payload),
  };
}

/**
 * GET /api/storefront-campaign?store=<id>
 * Public: returns only what the popup shows, or { campaign: null }.
 * Never fails loudly — shoppers must not see errors.
 */
export async function storefrontCampaignRequest({ method, query }) {
  if (method === "OPTIONS") return publicRespond(204, undefined, 3600);
  if (method !== "GET") {
    return publicRespond(405, { campaign: null }, 0);
  }

  const storeId = String(query?.store ?? "");
  if (!/^\d+$/.test(storeId)) {
    return publicRespond(400, { campaign: null }, 60);
  }

  try {
    requireEnv("SALLA_ACCESS_TOKEN", "SALLA_APP_ID");
    const snapshot = await readCampaign(
      process.env.SALLA_ACCESS_TOKEN,
      process.env.SALLA_APP_ID,
    );

    const active =
      snapshot?.enabled &&
      String(snapshot.storeId) === storeId &&
      new Date(snapshot.endsAt).getTime() > Date.now() &&
      snapshot.products?.length > 0;

    return publicRespond(
      200,
      { campaign: active ? toPublicCampaign(snapshot) : null },
      60,
    );
  } catch (error) {
    logError("Storefront campaign error:", error);
    return publicRespond(200, { campaign: null }, 30);
  }
}
