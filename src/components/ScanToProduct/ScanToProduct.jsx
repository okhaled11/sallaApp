import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../Icon.jsx";
import {
  buildPhoneUrl,
  createScanSession,
  pollScanSession,
  publishScannedProduct,
  scanImageUrl,
  uploadScanImageFromDashboard,
  analyzeScanSessionFromDashboard,
} from "../../utils/scanApi.js";
import { fileToScanDataUrl } from "../../utils/scanImage.js";
import "./scan.css";

const POLL_MS = 2000;
const MAX_IMAGES = 6;
const isLocalHost = (host) => /^(localhost|127\.0\.0\.1)$/.test(host);

const EMPTY_FORM = {
  name: "",
  nameEn: "",
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
 * Dashboard side of Scan-to-Product:
 * Provides two convenient paths:
 * 1. Direct photo upload / webcam capture directly from desktop/laptop.
 * 2. Mobile QR code scanning to use phone camera without login.
 * Both paths use Google Gemini AI to analyze product images and draft
 * complete, high-converting Arabic catalog information.
 */
export default function ScanToProduct({
  products = [],
  token,
  currency = "SAR",
  onShowToast,
  onPublished,
}) {
  const [session, setSession] = useState(null); // { sid, deskKey, phoneKey }
  const [remote, setRemote] = useState({ status: "waiting", images: [], draft: null, warning: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [analyzingDirect, setAnalyzingDirect] = useState(false);
  const [uploadingDirect, setUploadingDirect] = useState(false);
  const [captureMode, setCaptureMode] = useState("direct"); // "direct" | "qr"
  const [result, setResult] = useState(null);
  const [resultFromPhone, setResultFromPhone] = useState(false);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const draftAppliedRef = useRef(false);
  const callbacksRef = useRef({});
  callbacksRef.current = { onShowToast, onPublished };
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => p.categories?.forEach((c) => map.set(c.id, c.name)));
    return [...map].map(([id, name]) => ({ id, name }));
  }, [products]);

  const effectiveToken = token || "dev-token";

  const startSession = useCallback(async () => {
    setCreating(true);
    setError("");
    setResult(null);
    setResultFromPhone(false);
    setForm(EMPTY_FORM);
    draftAppliedRef.current = false;
    setRemote({ status: "waiting", images: [], draft: null, warning: "" });
    const res = await createScanSession(effectiveToken);
    setCreating(false);
    if (!res.success) {
      setError(res.error || "تعذّر إنشاء الجلسة");
      return;
    }
    setSession(res.data);
  }, [effectiveToken]);

  // Poll the session until published or form ready
  useEffect(() => {
    // Keep polling after a phone-side publish so a new product started on the phone shows up here too.
    if (!session || (result && !resultFromPhone)) return undefined;
    let stopped = false;
    const tick = async () => {
      const res = await pollScanSession(session.sid, session.deskKey);
      if (stopped) return;
      if (res.success) {
        setRemote(res.data);
        if (res.data.status === "published" && res.data.result && !result) {
          setResult(res.data.result);
          setResultFromPhone(true);
          callbacksRef.current.onShowToast?.("تم نشر المنتج في سلة من الهاتف", "success");
          callbacksRef.current.onPublished?.();
        } else if (res.data.status !== "published" && resultFromPhone) {
          setResult(null);
          setResultFromPhone(false);
          setForm(EMPTY_FORM);
          draftAppliedRef.current = false;
        }
      } else if (res.expired) {
        setSession(null);
        setError("انتهت صلاحية الجلسة. أنشئ جلسة جديدة");
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [session, result, resultFromPhone]);

  // Fill the form once when the AI draft arrives
  useEffect(() => {
    const draft = remote.draft;
    if (!draft || draftAppliedRef.current) return;
    draftAppliedRef.current = true;
    const match = categories.find((c) => c.name && draft.category?.includes(c.name));
    setForm((prev) => ({
      ...prev,
      name: draft.name || prev.name,
      nameEn: draft.nameEn || prev.nameEn || "",
      description: draft.description || prev.description,
      category: draft.category || "",
      categoryId: match ? String(match.id) : prev.categoryId,
      colors: draft.colors?.length ? draft.colors : prev.colors,
      sizes: Array.isArray(draft.sizes) ? draft.sizes.join("، ") : (draft.sizes || prev.sizes || ""),
      metaTitle: draft.metaTitle || prev.metaTitle || (draft.name ? `${draft.name} | متجرنا` : ""),
      metaDescription: draft.metaDescription || prev.metaDescription || "",
    }));
  }, [remote.draft, categories]);

  const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const updateColor = (index, patch) =>
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const addColor = () =>
    setForm((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: "لون جديد", hex: "#111827" }],
    }));

  const removeColor = (index) =>
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== index),
    }));

  // Handle direct file uploads (drag-drop or file picker)
  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    if (!session) {
      setError("ابدأ الجلسة أولاً بالضغط على بدء التصوير");
      return;
    }
    setUploadingDirect(true);
    setError("");

    try {
      const files = Array.from(fileList).slice(0, MAX_IMAGES);
      for (const file of files) {
        if (remote.images.length >= MAX_IMAGES) {
          setError(`الحد الأقصى ${MAX_IMAGES} صور`);
          break;
        }
        const dataUrl = await fileToScanDataUrl(file);
        const res = await uploadScanImageFromDashboard(session.sid, session.deskKey, dataUrl);
        if (!res.success) {
          setError(res.error || "فشل رفع الصورة");
          break;
        }
      }
      // Trigger an immediate poll update
      const pollRes = await pollScanSession(session.sid, session.deskKey);
      if (pollRes.success) setRemote(pollRes.data);
    } catch (err) {
      setError("تعذّر معالجة ورفع الصورة: " + (err.message || "خطأ غير معروف"));
    } finally {
      setUploadingDirect(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  // Direct trigger AI Analysis using Gemini
  const handleAnalyzeDirect = async () => {
    if (!session) return;
    if (remote.images.length === 0) {
      setError("الرجاء إضافة صورة واحدة على الأقل قبل بدء التحليل");
      return;
    }
    setAnalyzingDirect(true);
    setError("");
    const res = await analyzeScanSessionFromDashboard(session.sid, session.deskKey);
    setAnalyzingDirect(false);
    if (!res.success) {
      setError(res.error || "تعذّر تحليل الصور بواسطة الذكاء الاصطناعي");
      return;
    }
    // Poll immediately to fetch generated draft
    const pollRes = await pollScanSession(session.sid, session.deskKey);
    if (pollRes.success) setRemote(pollRes.data);
    onShowToast?.("تم استخراج بيانات المنتج بواسطة Gemini AI بنجاح", "success");
  };

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
    const res = await publishScannedProduct(effectiveToken, session.sid, session.deskKey, product);
    setPublishing(false);
    if (!res.success) {
      setError(res.error || "فشل نشر المنتج");
      return;
    }
    setResult(res.data);
    onShowToast?.("تم إنشاء ونشر المنتج في سلة بنجاح! 🚀", "success");
    onPublished?.();
  };

  const phoneUrl = session ? buildPhoneUrl(baseUrl, session.sid, session.phoneKey) : "";
  const needsLan = isLocalHost(window.location.hostname);
  const hasPhotos = remote.images.length > 0;
  const isAnalyzing = remote.status === "analyzing" || analyzingDirect;
  const showForm = remote.status === "ready" && !result;

  return (
    <section className="scan-studio" aria-labelledby="scan-title">
      <header className="scan-studio-head">
        <div>
          <div className="scan-badge">
            <Icon name="aiSparkles" size={14} />
            <span>مدعوم بنموذج Google Gemini للذكاء الاصطناعي</span>
          </div>
          <h2 id="scan-title">أضف منتجًا بالتصوير والذكاء الاصطناعي</h2>
          <p>
            التقط أو ارفع صور المنتج، ويقوم Gemini AI باستخراج الاسم العربي والإنجليزي، الوصف التسويقي، الألوان، والتصنيف بدقة فائقة.
          </p>
        </div>
        {session && !result && (
          <button
            type="button"
            className="scan-btn scan-btn-ghost"
            onClick={startSession}
            disabled={creating}
          >
            <Icon name="reload" size={16} />
            جلسة تصوير جديدة
          </button>
        )}
      </header>

      {error && (
        <div className="scan-alert scan-alert-error" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Mode / Empty State Before Starting Session */}
      {!session && !result && (
        <div className="scan-empty">
          <div className="scan-empty-icon" aria-hidden="true">
            <Icon name="camera" size={48} />
          </div>
          <h3>ابدأ إضافة منتج جديد بالتصوير</h3>
          <p>ارفع صور المنتج من جهازك أو امسح رمز الاستجابة السريعة بهاتفك لبدء التحليل الفوري.</p>
          <button
            type="button"
            id="scan-start"
            className="scan-btn scan-btn-primary"
            disabled={creating}
            onClick={startSession}
          >
            <Icon name="aiSparkles" size={18} />
            {creating ? "جارٍ بدء الجلسة…" : "بدء جلسة التصوير والتحليل"}
          </button>
        </div>
      )}

      {/* Session Active & Not Yet Ready/Published */}
      {session && !result && !showForm && (
        <div className="scan-session-container">
          {/* Tabs to choose capture method */}
          <div className="scan-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={captureMode === "direct"}
              className={`scan-mode-tab ${captureMode === "direct" ? "active" : ""}`}
              onClick={() => setCaptureMode("direct")}
            >
              <Icon name="image" size={18} />
              <span>رفع مباشر من الجهاز أو كاميرا الويب</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={captureMode === "qr"}
              className={`scan-mode-tab ${captureMode === "qr" ? "active" : ""}`}
              onClick={() => setCaptureMode("qr")}
            >
              <Icon name="camera" size={18} />
              <span>مسح برمز QR عبر الجوال</span>
            </button>
          </div>

          {/* Mode 1: Direct File Upload & Web Camera */}
          {captureMode === "direct" && (
            <div className="scan-direct-card">
              <div
                className="scan-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleUploadFiles(e.dataTransfer.files);
                }}
              >
                <div className="scan-dropzone-icon">
                  <Icon name="image" size={42} />
                </div>
                <h4>اسحب صور المنتج وأفلتها هنا</h4>
                <p>أو اختر الصور مباشرة من جهازك (حتى {MAX_IMAGES} صور، صيغ JPG, PNG, WEBP)</p>

                <div className="scan-direct-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleUploadFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    className="scan-btn scan-btn-accent"
                    disabled={uploadingDirect || hasPhotos && remote.images.length >= MAX_IMAGES}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="image" size={18} />
                    {uploadingDirect ? "جارٍ الرفع…" : "اختيار صور من الجهاز"}
                  </button>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => handleUploadFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    className="scan-btn scan-btn-ghost"
                    disabled={uploadingDirect || hasPhotos && remote.images.length >= MAX_IMAGES}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Icon name="camera" size={18} />
                    التقاط بكاميرا الجهاز
                  </button>
                </div>
              </div>

              {/* Uploaded Photos Preview List */}
              {hasPhotos && (
                <div className="scan-direct-preview">
                  <div className="scan-preview-head">
                    <h5>
                      الصور المرفوعة ({remote.images.length}/{MAX_IMAGES})
                    </h5>
                    <span className="scan-preview-note">أول صورة ستكون الصورة الرئيسية للمنتج</span>
                  </div>
                  <ul className="scan-thumbs">
                    {remote.images.map((t, idx) => (
                      <li key={t} className="scan-thumb-item">
                        <img src={scanImageUrl(t)} alt={`صورة ${idx + 1}`} />
                        {idx === 0 && <span className="scan-thumb-badge">الرئيسية</span>}
                      </li>
                    ))}
                  </ul>

                  <div className="scan-action-row">
                    <button
                      type="button"
                      className="scan-btn scan-btn-primary scan-btn-lg"
                      disabled={isAnalyzing}
                      onClick={handleAnalyzeDirect}
                    >
                      <Icon name="aiSparkles" size={20} />
                      {isAnalyzing ? "جارٍ تحليل الصور بالذكاء الاصطناعي (Gemini)…" : "تحليل الصور واستخراج بيانات المنتج (Gemini AI)"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: QR Code Mobile Scanning */}
          {captureMode === "qr" && (
            <div className="scan-pair">
              <div className="scan-qr" aria-label="رمز الاتصال بالهاتف">
                <QRCodeSVG value={phoneUrl} size={220} level="M" includeMargin />
              </div>
              <div className="scan-pair-info">
                <ol className="scan-steps">
                  <li className={remote.status !== "waiting" ? "done" : "active"}>
                    <b>١</b>
                    <span>امسح الرمز بكاميرا هاتفك الجوال</span>
                  </li>
                  <li className={hasPhotos ? "done" : remote.status === "connected" ? "active" : ""}>
                    <b>٢</b>
                    <span>صوّر المنتج من زوايا متعددة (حتى {MAX_IMAGES} صور)</span>
                  </li>
                  <li className={isAnalyzing ? "active" : ""}>
                    <b>٣</b>
                    <span>
                      {isAnalyzing ? "الذكاء الاصطناعي يحلل الصور…" : "اضغط «تحليل» في الهاتف أو هنا"}
                    </span>
                  </li>
                </ol>

                <div className={`scan-status scan-status-${remote.status}`}>
                  <span className="scan-dot" />
                  {remote.status === "waiting" && "بانتظار مسح الرمز من كاميرا الهاتف…"}
                  {remote.status === "connected" &&
                    (hasPhotos ? `تم استلام ${remote.images.length} صور من الهاتف` : "الهاتف متصل، بانتظار التقاط الصور")}
                  {remote.status === "analyzing" && "جارٍ تحليل الصور عبر Gemini AI…"}
                </div>

                {hasPhotos && (
                  <div className="scan-qr-thumbs-wrapper">
                    <ul className="scan-thumbs">
                      {remote.images.map((t, idx) => (
                        <li key={t}>
                          <img src={scanImageUrl(t)} alt={`صورة ${idx + 1}`} />
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="scan-btn scan-btn-primary"
                      disabled={isAnalyzing}
                      onClick={handleAnalyzeDirect}
                    >
                      <Icon name="aiSparkles" size={16} />
                      {isAnalyzing ? "جارٍ التحليل…" : "بدء التحليل فوراً"}
                    </button>
                  </div>
                )}

                {needsLan && (
                  <label className="scan-lan">
                    <span>تنبيه: أنت تعمل على localhost. اكتب عنوان IP لجهازك على الشبكة المحلية لكي يفتح الهاتف الرابط:</span>
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
        </div>
      )}

      {/* AI Draft is Ready - Show Product Review and Publish Form */}
      {showForm && (
        <form className="scan-form" onSubmit={handlePublish}>
          <div className="scan-ai-header-banner">
            <div className="scan-ai-badge">
              <Icon name="aiSparkles" size={18} />
              <span>تم استخراج وتجهيز بيانات المنتج بواسطة Gemini AI بنجاح! راجع البيانات وأضف السعر للنشر.</span>
            </div>
          </div>

          <div className="scan-form-gallery">
            {remote.images.map((t, i) => (
              <figure key={t}>
                <img src={scanImageUrl(t)} alt={`صورة المنتج ${i + 1}`} />
                {i === 0 && <figcaption>الرئيسية</figcaption>}
              </figure>
            ))}
          </div>

          {remote.warning && (
            <div className="scan-alert scan-alert-warn">
              <Icon name="alert" size={18} />
              <span>{remote.warning}</span>
            </div>
          )}

          <div className="scan-grid">
            <label className="scan-field scan-span-2">
              <span>اسم المنتج (بالعربية) *</span>
              <input id="scan-name" required value={form.name} onChange={setField("name")} placeholder="مثال: عباية كتان سوداء كلاسيكية" />
            </label>

            {form.nameEn && (
              <label className="scan-field scan-span-2">
                <span>اسم المنتج (بالإنجليزية)</span>
                <input id="scan-name-en" value={form.nameEn} onChange={setField("nameEn")} dir="ltr" />
              </label>
            )}

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
                placeholder="0.00"
              />
            </label>

            <label className="scan-field">
              <span>سعر التكلفة ({currency}) (اختياري)</span>
              <input type="number" min="0" step="0.01" value={form.costPrice} onChange={setField("costPrice")} placeholder="0.00" />
            </label>

            <label className="scan-field">
              <span>الكمية المتاحة</span>
              <input type="number" min="0" step="1" value={form.quantity} onChange={setField("quantity")} />
            </label>

            <label className="scan-field">
              <span>حالة النشر في المتجر</span>
              <select value={form.status} onChange={setField("status")}>
                <option value="sale">معروض للبيع مباشرة</option>
                <option value="hidden">مسودة (مخفي من المتجر)</option>
              </select>
            </label>

            <label className="scan-field">
              <span>التصنيف {form.category && <em className="scan-category-tag">(المقترح: {form.category})</em>}</span>
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
              <input value={form.sizes} onChange={setField("sizes")} placeholder="S، M، L، XL" />
            </label>

            <div className="scan-field scan-span-2">
              <span>الألوان المستخرجة</span>
              <div className="scan-colors">
                {form.colors.map((c, i) => (
                  <div className="scan-color" key={i}>
                    <input
                      type="color"
                      aria-label="اختر اللون"
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
                      className="scan-btn-delete-color"
                      onClick={() => removeColor(i)}
                    >
                      <Icon name="multiply" size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="scan-btn scan-btn-ghost scan-btn-sm"
                  onClick={addColor}
                >
                  + إضافة لون
                </button>
              </div>
            </div>

            <label className="scan-field scan-span-2">
              <span>الوصف التسويقي للمنتج (HTML)</span>
              <textarea rows={6} value={form.description} onChange={setField("description")} />
            </label>

            <label className="scan-field">
              <span>عنوان السيو (SEO Title)</span>
              <input value={form.metaTitle} onChange={setField("metaTitle")} maxLength={70} />
            </label>

            <label className="scan-field">
              <span>وصف السيو (Meta Description)</span>
              <input value={form.metaDescription} onChange={setField("metaDescription")} maxLength={170} />
            </label>
          </div>

          <div className="scan-form-actions">
            <button
              type="submit"
              id="scan-publish"
              className="scan-btn scan-btn-primary scan-btn-publish"
              disabled={publishing}
            >
              <Icon name={publishing ? "package" : "rocket"} size={20} />
              {publishing ? "جارٍ نشر المنتج على متجر سلة…" : "نشر المنتج فوراً على سلة"}
            </button>
          </div>
        </form>
      )}

      {/* Published Successfully */}
      {result && (
        <div className="scan-success">
          <div className="scan-success-icon" aria-hidden="true">
            <Icon name="checkCircle" size={64} />
          </div>
          <h3>تم إنشاء ونشر المنتج بنجاح في متجرك!</h3>
          <p>أصبح المنتج متاحاً الآن في متجر سلة بالصور والبيانات التي استخرجها الذكاء الاصطناعي.</p>

          {result.warnings?.length > 0 && (
            <div className="scan-warnings">
              {result.warnings.map((w) => (
                <div key={w} className="scan-alert scan-alert-warn">
                  <Icon name="alert" size={16} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="scan-form-actions">
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="scan-btn scan-btn-ghost"
              >
                معاينة المنتج في المتجر
              </a>
            )}
            <button
              type="button"
              className="scan-btn scan-btn-primary"
              onClick={startSession}
            >
              <Icon name="aiSparkles" size={18} />
              أضف منتجًا آخر بالتصوير
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
