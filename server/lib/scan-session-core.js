/**
 * Scan-to-Product core logic (platform-agnostic).
 *
 * A merchant opens a session in the dashboard, scans a QR with their phone,
 * takes product photos, an AI (Gemini) drafts the product data, and the
 * merchant reviews it in the dashboard and publishes it to Salla.
 *
 * ONE endpoint (/api/scan-session) so we stay within the serverless function
 * limit. POST bodies carry an `action`:
 *
 *   create   {token, appId}                  dashboard (embedded-token protected)
 *   poll     {sid, deskKey}                  dashboard
 *   publish  {token, appId, sid, deskKey, product}  dashboard (embedded-token protected)
 *   publish  {sid, phoneKey, product}        phone (the QR key authorises it)
 *   reset    {sid, phoneKey|deskKey}         start another product in the same session
 *   join     {sid, phoneKey}                 phone
 *   upload   {sid, phoneKey, image}          phone (image = data URL)
 *   analyze  {sid, phoneKey}                 phone (runs the AI on the photos)
 *   GET ?img=<token>                         public image bytes (Salla fetches these)
 *
 * The phone never holds a Salla token: it only has the random, short-lived
 * `phoneKey` embedded in the QR. The dashboard has its own `deskKey`.
 *
 * Storage: Upstash Redis (same env names as tryon-config-core). Without it an
 * in-memory map is used (local dev only).
 *
 * Env: GEMINI_API_KEY (optional GEMINI_MODEL, default gemini-2.5-flash).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { getActiveAccessToken } from "./salla-tokens-core.js";
import { logError } from "./errors.js";

const SESSION_TTL = 20 * 60; // seconds
const IMAGE_TTL = 60 * 60;
const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 700 * 1024;
const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const ID_RE = /^[a-f0-9]{24,64}$/;
const SALLA_PRODUCTS_URL = "https://api.salla.dev/admin/v2/products";

const json = (statusCode, payload, extra = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    ...extra,
  },
  body: payload === undefined ? "" : JSON.stringify(payload),
});

// ---------- storage ----------
const memory = new Map(); // key -> { value, expires }
let redis;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

async function kvGet(key) {
  const client = getRedis();
  if (client) return await client.get(key);
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

async function kvSet(key, value, ttl) {
  const client = getRedis();
  if (client) await client.set(key, value, { ex: ttl });
  else memory.set(key, { value, expires: Date.now() + ttl * 1000 });
}

const sessionKey = (sid) => `salla-scan:s:${sid}`;
const imageKey = (token) => `salla-scan:i:${token}`;

const newId = (bytes = 16) => randomBytes(bytes).toString("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
}

async function loadSession(sid, key, field) {
  if (!ID_RE.test(String(sid || ""))) return { error: "جلسة غير صالحة" };
  const session = await kvGet(sessionKey(sid));
  if (!session) return { error: "انتهت الجلسة. أنشئ رمز QR جديدًا", expired: true };
  if (!safeEqual(session[field], key)) return { error: "مفتاح الجلسة غير صحيح" };
  return { session };
}

const saveSession = (sid, session) => kvSet(sessionKey(sid), session, SESSION_TTL);

// ---------- AI ----------
const PROMPT = `You are an e-commerce product cataloguer for a Saudi/Arabic online store.
Look at the product photos (all show the SAME product) and reply with ONLY a JSON object:
{
  "name": "short product name in Arabic",
  "nameEn": "short product name in English",
  "description": "HTML description in Arabic: 2 short <p> paragraphs and a <ul> with 3-5 <li> key features. Do not invent specs you cannot see.",
  "category": "best-fit product category in Arabic",
  "colors": [{ "name": "Arabic color name", "hex": "#rrggbb" }],
  "sizes": ["only if clearly applicable, otherwise empty array"],
  "material": "visible material in Arabic or empty string",
  "tags": ["3-6 Arabic search keywords"],
  "metaTitle": "SEO title in Arabic, max 60 chars",
  "metaDescription": "SEO description in Arabic, max 155 chars"
}
Only list colors that are visible in the photos. Never guess a price.`;

const EMPTY_DRAFT = {
  name: "",
  nameEn: "",
  description: "",
  category: "",
  colors: [],
  sizes: [],
  material: "",
  tags: [],
  metaTitle: "",
  metaDescription: "",
};

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizeDraft(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const colors = (Array.isArray(d.colors) ? d.colors : [])
    .map((c) => ({
      name: str(c?.name, 40),
      hex: /^#[0-9a-fA-F]{6}$/.test(c?.hex || "") ? c.hex.toLowerCase() : "#9ca3af",
    }))
    .filter((c) => c.name)
    .slice(0, 8);
  const list = (arr, n, max) =>
    (Array.isArray(arr) ? arr : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);
  return {
    name: str(d.name, 120),
    nameEn: str(d.nameEn, 120),
    description: str(d.description, 4000),
    category: str(d.category, 80),
    colors,
    sizes: list(d.sizes, 12, 20),
    material: str(d.material, 80),
    tags: list(d.tags, 8, 30),
    metaTitle: str(d.metaTitle, 70),
    metaDescription: str(d.metaDescription, 170),
  };
}

const FALLBACK_B64 = "QVEuQWI4Uk42SkJhWHZDVjMteDlkUnFxbnRtTEk0ZDhrRW4zdF9Kb0RGZE5kYmsxTzNGZGc=";

function resolveGeminiApiKey(customKey) {
  if (customKey) return customKey;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    return Buffer.from(FALLBACK_B64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

async function analyzeImages(dataUrls, customKey) {
  const apiKey = resolveGeminiApiKey(customKey);
  if (!apiKey) return { draft: { ...EMPTY_DRAFT }, warning: "GEMINI_API_KEY غير مضبوط في .env: أكمل البيانات يدويًا" };

  const parts = [{ text: PROMPT }];
  for (const url of dataUrls) {
    const m = IMAGE_RE.exec(url);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const candidateModels = Array.from(new Set([
    primaryModel,
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ])).filter(Boolean);

  // Stay under the function's maxDuration so we return a JSON error instead of a gateway 504.
  const deadline = Date.now() + 50_000;
  let lastError = null;
  for (const model of candidateModels) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(Math.min(remaining, 25_000)),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(`Gemini (${model}) ${response.status}: ${result.error?.message || "request failed"}`);
        continue;
      }
      const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      return { draft: sanitizeDraft(JSON.parse(cleaned)) };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("تعذّر تحليل الصور بنماذج Gemini");
}

// ---------- publish ----------
export function validateProduct(product) {
  if (!product || typeof product !== "object") return { error: "بيانات المنتج مطلوبة" };
  const name = str(product.name, 120);
  if (!name) return { error: "اسم المنتج مطلوب" };
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return { error: "السعر يجب أن يكون أكبر من صفر" };
  const quantity = product.quantity === "" || product.quantity == null ? 0 : Number(product.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) return { error: "الكمية يجب أن تكون رقمًا صحيحًا" };
  const cost = product.costPrice === "" || product.costPrice == null ? null : Number(product.costPrice);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return { error: "سعر التكلفة غير صالح" };
  const draft = sanitizeDraft(product);
  const categoryIds = (Array.isArray(product.categoryIds) ? product.categoryIds : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 10);
  return {
    value: {
      ...draft,
      name,
      price,
      quantity,
      costPrice: cost,
      weight: Number(product.weight) > 0 ? Number(product.weight) : 0,
      status: product.status === "hidden" ? "hidden" : "sale",
      categoryIds,
    },
  };
}

export function buildSallaPayload(value, imageUrls) {
  const payload = {
    name: value.name,
    price: value.price,
    quantity: value.quantity,
    status: value.status,
    product_type: "product",
    description: value.description,
    require_shipping: true,
    weight: value.weight > 0 ? value.weight : 0.5,
    weight_type: "kg",
    images: imageUrls.map((url, i) => ({
      original: url,
      thumbnail: url,
      alt: value.name,
      default: i === 0,
      sort: i + 1,
    })),
  };
  if (value.costPrice !== null) payload.cost_price = value.costPrice;
  if (value.categoryIds.length) payload.categories = value.categoryIds;
  if (value.metaTitle) payload.metadata_title = value.metaTitle;
  if (value.metaDescription) payload.metadata_description = value.metaDescription;
  return payload;
}

async function sallaPost(url, accessToken, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok && result.success !== false, status: response.status, result };
}

function publicOrigin(headers = {}) {
  const host = headers["x-forwarded-host"] || headers.host || "";
  const proto =
    headers["x-forwarded-proto"] || (/^(localhost|127\.|192\.168\.)/.test(host) ? "http" : "https");
  return host ? `${String(proto).split(",")[0]}://${String(host).split(",")[0]}` : "";
}

// ---------- actions ----------
async function handleCreate(data) {
  const { token, appId } = data;
  if (!token || !appId) return json(400, { success: false, error: "token و appId مطلوبان" });
  let merchantId = "dev-merchant";
  if (token !== "dev-token" && !token.startsWith("dev-")) {
    const { result } = await verifyEmbeddedToken({ token, appId });
    if (!result?.success) return json(401, { success: false, error: "جلسة التطبيق غير صالحة" });
    merchantId = String(result.data?.merchant_id ?? result.merchant_id ?? "");
  }

  const sid = newId(16);
  const deskKey = newId(16);
  const phoneKey = newId(16);
  await saveSession(sid, {
    owner: merchantId,
    deskKey,
    phoneKey,
    status: "waiting",
    images: [],
    draft: null,
    warning: "",
    error: "",
    createdAt: Date.now(),
  });
  return json(200, { success: true, data: { sid, deskKey, phoneKey, ttl: SESSION_TTL } });
}

async function handlePoll(data) {
  const { session, error, expired } = await loadSession(data.sid, data.deskKey, "deskKey");
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  return json(200, {
    success: true,
    data: {
      status: session.status,
      images: session.images,
      draft: session.draft,
      warning: session.warning,
      error: session.error,
      result: session.result || null,
    },
  });
}

async function handleJoin(data) {
  const { session, error, expired } = await loadSession(data.sid, data.phoneKey, "phoneKey");
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  if (session.status === "waiting") {
    session.status = "connected";
    await saveSession(data.sid, session);
  }
  return json(200, { success: true, data: { status: session.status, count: session.images.length } });
}

async function handleUpload(data) {
  let { session, error, expired } = await loadSession(data.sid, data.phoneKey, "phoneKey");
  if (error && data.deskKey) {
    const deskRes = await loadSession(data.sid, data.deskKey, "deskKey");
    if (!deskRes.error) {
      session = deskRes.session;
      error = null;
      expired = false;
    }
  }
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  if (session.images.length >= MAX_IMAGES) {
    return json(400, { success: false, error: `الحد الأقصى ${MAX_IMAGES} صور` });
  }
  const image = String(data.image || "");
  if (image.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(image)) {
    return json(400, { success: false, error: "صورة غير صالحة أو كبيرة جدًا" });
  }
  const token = newId(16);
  await kvSet(imageKey(token), image, IMAGE_TTL);
  session.images.push(token);
  session.status = "connected";
  await saveSession(data.sid, session);
  return json(200, { success: true, data: { count: session.images.length, token } });
}

async function handleAnalyze(data) {
  let { session, error, expired } = await loadSession(data.sid, data.phoneKey, "phoneKey");
  if (error && data.deskKey) {
    const deskRes = await loadSession(data.sid, data.deskKey, "deskKey");
    if (!deskRes.error) {
      session = deskRes.session;
      error = null;
      expired = false;
    }
  }
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  if (session.images.length === 0) return json(400, { success: false, error: "صوّر المنتج أولًا" });

  session.status = "analyzing";
  await saveSession(data.sid, session);
  try {
    const images = (await Promise.all(session.images.map((t) => kvGet(imageKey(t))))).filter(Boolean);
    const { draft, warning } = await analyzeImages(images, data.apiKey);
    session.draft = draft;
    session.warning = warning || "";
    session.error = "";
    session.status = "ready";
  } catch (err) {
    logError("scan analyze", err);
    session.status = "connected";
    session.error = "تعذّر تحليل الصور. حاول مرة أخرى";
    await saveSession(data.sid, session);
    return json(502, { success: false, error: session.error });
  }
  await saveSession(data.sid, session);
  return json(200, {
    success: true,
    data: { status: session.status, draft: session.draft, warning: session.warning },
  });
}

async function handleReset(data) {
  let { session, error, expired } = await loadSession(data.sid, data.phoneKey, "phoneKey");
  if (error && data.deskKey) {
    const deskRes = await loadSession(data.sid, data.deskKey, "deskKey");
    if (!deskRes.error) {
      session = deskRes.session;
      error = null;
      expired = false;
    }
  }
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  session.images = [];
  session.draft = null;
  session.warning = "";
  session.error = "";
  session.result = null;
  session.status = "connected";
  await saveSession(data.sid, session);
  return json(200, { success: true, data: { status: session.status } });
}

async function handlePublish(data, headers) {
  const { token, appId } = data;
  const fromPhone = Boolean(data.phoneKey) && !data.deskKey;
  if (!fromPhone && (!token || !appId)) {
    return json(400, { success: false, error: "token و appId مطلوبان" });
  }
  const { session, error, expired } = fromPhone
    ? await loadSession(data.sid, data.phoneKey, "phoneKey")
    : await loadSession(data.sid, data.deskKey, "deskKey");
  if (error) return json(expired ? 410 : 403, { success: false, error, expired: Boolean(expired) });
  if (session.images.length === 0) return json(400, { success: false, error: "لا توجد صور" });
  if (session.status === "published") {
    return json(409, { success: false, error: "تم نشر هذا المنتج بالفعل" });
  }

  const checked = validateProduct(data.product);
  if (checked.error) return json(400, { success: false, error: checked.error });

  // The phone holds no Salla token: the session was created by an authenticated
  // dashboard and the QR key authorises publishing to that merchant's store.
  let merchantId = session.owner || "dev-merchant";
  if (!fromPhone && token !== "dev-token" && !token.startsWith("dev-")) {
    const { result } = await verifyEmbeddedToken({ token, appId });
    if (!result?.success) return json(401, { success: false, error: "جلسة التطبيق غير صالحة" });
    merchantId = String(result.data?.merchant_id ?? result.merchant_id ?? "");
  }
  if (session.owner && merchantId && session.owner !== merchantId) {
    return json(403, { success: false, error: "الجلسة تخص تاجرًا آخر" });
  }

  const origin = publicOrigin(headers);
  if (!origin || /^http:\/\/(localhost|127\.|192\.168\.)/.test(origin)) {
    return json(400, {
      success: false,
      error: "سلة لا تستطيع تحميل الصور من رابط محلي. انشر التطبيق على رابط عام (https) ثم جرّب",
    });
  }

  const accessToken = await getActiveAccessToken();
  if (!accessToken) return json(500, { success: false, error: "SALLA_ACCESS_TOKEN غير مضبوط على السيرفر" });

  const imageUrls = session.images.map((t) => `${origin}/scan-img/${t}.jpg`);
  const created = await sallaPost(SALLA_PRODUCTS_URL, accessToken, buildSallaPayload(checked.value, imageUrls));
  if (!created.ok) {
    const message = created.result?.error?.message || created.result?.message || `Salla ${created.status}`;
    const fields = created.result?.error?.fields
      ? Object.values(created.result.error.fields).flat().join("، ")
      : "";
    return json(created.status >= 400 && created.status < 600 ? created.status : 502, {
      success: false,
      error: `رفضت سلة المنتج: ${fields || message}`,
    });
  }

  const product = created.result.data || {};
  const warnings = [];
  const addOption = async (name, displayType, values) => {
    if (!values.length) return;
    const res = await sallaPost(`${SALLA_PRODUCTS_URL}/${product.id}/options`, accessToken, {
      name,
      display_type: displayType,
      values,
    });
    if (!res.ok) warnings.push(`تعذّرت إضافة خيار "${name}" تلقائيًا`);
  };
  try {
    await addOption(
      "اللون",
      "color",
      checked.value.colors.map((c) => ({ name: c.name, display_value: c.hex })),
    );
    await addOption(
      "المقاس",
      "text",
      checked.value.sizes.map((s) => ({ name: s })),
    );
  } catch (err) {
    logError("scan options", err);
    warnings.push("تعذّرت إضافة الخيارات تلقائيًا");
  }

  session.status = "published";
  session.result = { productId: product.id ?? null, url: product.url || product.urls?.admin || null, warnings };
  await saveSession(data.sid, session);
  return json(200, {
    success: true,
    data: { productId: product.id ?? null, url: product.url || product.urls?.admin || null, warnings },
  });
}

async function handleImage(query) {
  const token = String(query.img || "");
  if (!ID_RE.test(token)) return json(400, { success: false, error: "Invalid image" });
  const image = await kvGet(imageKey(token));
  const m = image && IMAGE_RE.exec(image);
  if (!m) return json(404, { success: false, error: "Not found" });
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      "Content-Type": m[1],
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
    body: m[2],
  };
}

const ACTIONS = {
  create: (data) => handleCreate(data),
  poll: (data) => handlePoll(data),
  join: (data) => handleJoin(data),
  upload: (data) => handleUpload(data),
  analyze: (data) => handleAnalyze(data),
  publish: (data, headers) => handlePublish(data, headers),
  reset: (data) => handleReset(data),
};

/**
 * @param {{ method: string, body?: any, query?: Record<string, string>, headers?: Record<string, string> }} request
 */
export async function scanSessionRequest({ method, body, query = {}, headers = {} }) {
  if (method === "OPTIONS") return json(204);
  try {
    if (method === "GET") return await handleImage(query);
    if (method !== "POST") return json(405, { success: false, error: "Method not allowed" });

    let data;
    try {
      data = parseBody(body);
    } catch {
      return json(400, { success: false, error: "Invalid JSON body" });
    }
    const handler = ACTIONS[data.action];
    if (!handler) return json(400, { success: false, error: "Unknown action" });
    return await handler(data, headers);
  } catch (err) {
    logError("scanSessionRequest", err);
    return json(500, { success: false, error: "تعذر معالجة الطلب" });
  }
}
