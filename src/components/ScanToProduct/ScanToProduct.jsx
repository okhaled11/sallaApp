import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  buildPhoneUrl,
  createScanSession,
  pollScanSession,
  publishScannedProduct,
  scanImageUrl,
} from "../../utils/scanApi.js";
import "./scan.css";

const POLL_MS = 2000;
const isLocalHost = (host) => /^(localhost|127\.0\.0\.1)$/.test(host);

const EMPTY_FORM = {
  name: "",
  description: "",
  category: "",
  categoryId: "",
  price: "",
  costPrice: "",
  quantity: "1",
  status: "sale",
  colors: [],
  sizes: "",
  metaTitle: "",
  metaDescription: "",
};

/**
 * Dashboard side of Scan-to-Product: shows a QR for the phone, receives the
 * photos + AI draft, lets the merchant add price / colours, then publishes to Salla.
 */
export default function ScanToProduct({ products = [], token, currency = "SAR", onShowToast, onPublished }) {
  const [session, setSession] = useState(null); // { sid, deskKey, phoneKey }
  const [remote, setRemote] = useState({ status: "waiting", images: [], draft: null, warning: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const draftAppliedRef = useRef(false);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => p.categories?.forEach((c) => map.set(c.id, c.name)));
    return [...map].map(([id, name]) => ({ id, name }));
  }, [products]);

  const startSession = useCallback(async () => {
    setCreating(true);
    setError("");
    setResult(null);
    setForm(EMPTY_FORM);
    draftAppliedRef.current = false;
    setRemote({ status: "waiting", images: [], draft: null, warning: "" });
    const res = await createScanSession(token);
    setCreating(false);
    if (!res.success) {
      setError(res.error || "تعذّر إنشاء الجلسة");
      return;
    }
    setSession(res.data);
  }, [token]);

  // Poll the session until published / expired
  useEffect(() => {
    if (!session || result) return undefined;
    let stopped = false;
    const tick = async () => {
      const res = await pollScanSession(session.sid, session.deskKey);
      if (stopped) return;
      if (res.success) {
        setRemote(res.data);
      } else if (res.expired) {
        setSession(null);
        setError("انتهت صلاحية الجلسة. أنشئ رمزًا جديدًا");
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [session, result]);

  // Fill the form once when the AI draft arrives (don't clobber later edits)
  useEffect(() => {
    const draft = remote.draft;
    if (!draft || draftAppliedRef.current) return;
    draftAppliedRef.current = true;
    const match = categories.find((c) => c.name && draft.category?.includes(c.name));
    setForm((prev) => ({
      ...prev,
      name: draft.name || prev.name,
      description: draft.description || prev.description,
      category: draft.category || "",
      categoryId: match ? String(match.id) : "",
      colors: draft.colors?.length ? draft.colors : prev.colors,
      sizes: (draft.sizes || []).join("، "),
      metaTitle: draft.metaTitle || "",
      metaDescription: draft.metaDescription || "",
    }));
  }, [remote.draft, categories]);

  const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const updateColor = (index, patch) =>
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const handlePublish = async (event) => {
    event.preventDefault();
    setPublishing(true);
    setError("");
    const product = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      costPrice: form.costPrice,
      quantity: form.quantity === "" ? 0 : Number(form.quantity),
      status: form.status,
      colors: form.colors.filter((c) => c.name.trim()),
      sizes: form.sizes
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      metaTitle: form.metaTitle,
      metaDescription: form.metaDescription,
      categoryIds: form.categoryId ? [Number(form.categoryId)] : [],
    };
    const res = await publishScannedProduct(token, session.sid, session.deskKey, product);
    setPublishing(false);
    if (!res.success) {
      setError(res.error || "فشل نشر المنتج");
      return;
    }
    setResult(res.data);
    onShowToast?.("تم إنشاء المنتج في سلة", "success");
    onPublished?.();
  };

  const phoneUrl = session ? buildPhoneUrl(baseUrl, session.sid, session.phoneKey) : "";
  const needsLan = isLocalHost(window.location.hostname);
  const hasPhotos = remote.images.length > 0;
  const showForm = remote.status === "ready" && !result;

  return (
    <section className="scan-studio" aria-labelledby="scan-title">
      <header className="scan-studio-head">
        <div>
          <h2 id="scan-title">أضف منتجًا بالتصوير</h2>
          <p>امسح الرمز بهاتفك، صوّر المنتج، ونملأ البيانات بالذكاء الاصطناعي. أنت تضيف السعر فقط.</p>
        </div>
        {session && !result && (
          <button type="button" className="scan-btn scan-btn-ghost" onClick={startSession} disabled={creating}>
            جلسة جديدة
          </button>
        )}
      </header>

      {error && <div className="scan-alert scan-alert-error">{error}</div>}

      {!session && !result && (
        <div className="scan-empty">
          <div className="scan-empty-art" aria-hidden="true">📱⇄🛍️</div>
          <p>اربط هاتفك بالمتجر في ثوانٍ بدون تسجيل دخول.</p>
          <button
            type="button"
            id="scan-start"
            className="scan-btn scan-btn-primary"
            disabled={creating || !token}
            onClick={startSession}
          >
            {creating ? "جارٍ الإنشاء…" : "إنشاء رمز QR"}
          </button>
        </div>
      )}

      {session && !result && !showForm && (
        <div className="scan-pair">
          <div className="scan-qr" aria-label="رمز الاتصال بالهاتف">
            <QRCodeSVG value={phoneUrl} size={220} level="M" includeMargin />
          </div>
          <div className="scan-pair-info">
            <ol className="scan-steps">
              <li className={remote.status !== "waiting" ? "done" : "active"}>
                <b>١</b> امسح الرمز بكاميرا هاتفك
              </li>
              <li
                className={
                  hasPhotos ? "done" : remote.status === "connected" ? "active" : ""
                }
              >
                <b>٢</b> صوّر المنتج (حتى 6 صور)
              </li>
              <li className={remote.status === "analyzing" ? "active" : ""}>
                <b>٣</b> {remote.status === "analyzing" ? "✨ الذكاء الاصطناعي يحلل الصور…" : "اضغط «تحليل» في الهاتف"}
              </li>
            </ol>

            <div className={`scan-status scan-status-${remote.status}`}>
              <span className="scan-dot" />
              {remote.status === "waiting" && "بانتظار مسح الرمز…"}
              {remote.status === "connected" &&
                (hasPhotos ? `تم استلام ${remote.images.length} صور` : "الهاتف متصل ✓ بانتظار الصور")}
              {remote.status === "analyzing" && "جارٍ تحليل الصور…"}
            </div>

            {hasPhotos && (
              <ul className="scan-thumbs">
                {remote.images.map((t) => (
                  <li key={t}>
                    <img src={scanImageUrl(t)} alt="" />
                  </li>
                ))}
              </ul>
            )}

            {needsLan && (
              <label className="scan-lan">
                <span>أنت على localhost: هاتفك لا يصل إليه. اكتب عنوان جهازك على الشبكة</span>
                <input
                  type="url"
                  dir="ltr"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://192.168.1.10:5173"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <form className="scan-form" onSubmit={handlePublish}>
          <div className="scan-form-gallery">
            {remote.images.map((t, i) => (
              <figure key={t}>
                <img src={scanImageUrl(t)} alt={`صورة المنتج ${i + 1}`} />
                {i === 0 && <figcaption>الرئيسية</figcaption>}
              </figure>
            ))}
          </div>

          {remote.warning && <div className="scan-alert scan-alert-warn">{remote.warning}</div>}

          <div className="scan-grid">
            <label className="scan-field scan-span-2">
              <span>اسم المنتج</span>
              <input id="scan-name" required value={form.name} onChange={setField("name")} />
            </label>

            <label className="scan-field scan-highlight">
              <span>السعر ({currency}) *</span>
              <input
                id="scan-price"
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.price}
                onChange={setField("price")}
                autoFocus
              />
            </label>
            <label className="scan-field">
              <span>سعر التكلفة (اختياري)</span>
              <input type="number" min="0" step="0.01" value={form.costPrice} onChange={setField("costPrice")} />
            </label>
            <label className="scan-field">
              <span>الكمية</span>
              <input type="number" min="0" step="1" value={form.quantity} onChange={setField("quantity")} />
            </label>
            <label className="scan-field">
              <span>حالة النشر</span>
              <select value={form.status} onChange={setField("status")}>
                <option value="sale">معروض للبيع</option>
                <option value="hidden">مسودة (مخفي)</option>
              </select>
            </label>

            <label className="scan-field">
              <span>التصنيف {form.category && <em>(مقترح: {form.category})</em>}</span>
              <select value={form.categoryId} onChange={setField("categoryId")}>
                <option value="">بدون تصنيف</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="scan-field">
              <span>المقاسات (مفصولة بفاصلة)</span>
              <input value={form.sizes} onChange={setField("sizes")} placeholder="S، M، L" />
            </label>

            <div className="scan-field scan-span-2">
              <span>الألوان</span>
              <div className="scan-colors">
                {form.colors.map((c, i) => (
                  <div className="scan-color" key={i}>
                    <input
                      type="color"
                      aria-label="اللون"
                      value={c.hex}
                      onChange={(e) => updateColor(i, { hex: e.target.value })}
                    />
                    <input
                      aria-label="اسم اللون"
                      value={c.name}
                      onChange={(e) => updateColor(i, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-label="حذف اللون"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, colors: prev.colors.filter((_, j) => j !== i) }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="scan-btn scan-btn-ghost scan-btn-sm"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, colors: [...prev.colors, { name: "", hex: "#111827" }] }))
                  }
                >
                  + لون
                </button>
              </div>
            </div>

            <label className="scan-field scan-span-2">
              <span>الوصف (HTML)</span>
              <textarea rows={6} value={form.description} onChange={setField("description")} />
            </label>
            <label className="scan-field">
              <span>عنوان السيو</span>
              <input value={form.metaTitle} onChange={setField("metaTitle")} maxLength={70} />
            </label>
            <label className="scan-field">
              <span>وصف السيو</span>
              <input value={form.metaDescription} onChange={setField("metaDescription")} maxLength={170} />
            </label>
          </div>

          <div className="scan-form-actions">
            <button type="submit" id="scan-publish" className="scan-btn scan-btn-primary" disabled={publishing}>
              {publishing ? "جارٍ النشر على سلة…" : "🚀 انشر المنتج على سلة"}
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className="scan-success">
          <div className="scan-phone-check">✓</div>
          <h3>تم إنشاء المنتج في متجرك</h3>
          {result.warnings?.map((w) => (
            <div key={w} className="scan-alert scan-alert-warn">
              {w}
            </div>
          ))}
          <div className="scan-form-actions">
            <button type="button" className="scan-btn scan-btn-primary" onClick={startSession}>
              أضف منتجًا آخر
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
