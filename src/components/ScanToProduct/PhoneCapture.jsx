import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeScanSession,
  joinScanSession,
  publishScannedProductFromPhone,
  resetScanSession,
  uploadScanImage,
} from "../../utils/scanApi.js";
import { fileToScanDataUrl } from "../../utils/scanImage.js";
import "./scan.css";
import Icon from "../Icon.jsx";

const MAX_IMAGES = 6;

const EMPTY_FORM = {
  name: "",
  category: "",
  description: "",
  price: "",
  quantity: "1",
  status: "sale",
  colors: [],
  sizes: "",
  metaTitle: "",
  metaDescription: "",
};

const formFromDraft = (draft) => ({
  ...EMPTY_FORM,
  name: draft?.name || "",
  category: draft?.category || "",
  description: draft?.description || "",
  colors: Array.isArray(draft?.colors) ? draft.colors : [],
  sizes: Array.isArray(draft?.sizes) ? draft.sizes.join("، ") : "",
  metaTitle: draft?.metaTitle || "",
  metaDescription: draft?.metaDescription || "",
});

/**
 * Phone-side page opened from the dashboard QR (?m=capture&s=<sid>&k=<key>).
 * The merchant takes 1-6 photos, they upload, and the AI drafts the product
 * on the dashboard. No Salla login is needed: the QR carries a short-lived key.
 */
export default function PhoneCapture() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("s") || "";
  const key = params.get("k") || "";

  const [phase, setPhase] = useState("joining"); // joining | capture | analyzing | review | done | error
  const [form, setForm] = useState(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [showDescription, setShowDescription] = useState(false);
  const [thumbs, setThumbs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    joinScanSession(sid, key).then((res) => {
      if (cancelled) return;
      if (res.success) setPhase("capture");
      else {
        setMessage(res.error || "تعذّر الاتصال بالجلسة");
        setPhase("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sid, key]);

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setBusy(true);
      setMessage("");
      let count = thumbs.length;
      for (const file of files) {
        if (count >= MAX_IMAGES) {
          setMessage(`الحد الأقصى ${MAX_IMAGES} صور`);
          break;
        }
        try {
          const dataUrl = await fileToScanDataUrl(file);
          const res = await uploadScanImage(sid, key, dataUrl);
          if (!res.success) {
            setMessage(res.error || "فشل رفع الصورة");
            if (res.expired) setPhase("error");
            break;
          }
          count = res.data.count;
          setThumbs((prev) => [...prev, dataUrl]);
          navigator.vibrate?.(15);
        } catch {
          setMessage("تعذّر قراءة الصورة");
          break;
        }
      }
      setBusy(false);
    },
    [sid, key, thumbs.length],
  );

  const handleAnalyze = async () => {
    setPhase("analyzing");
    setMessage("");
    const res = await analyzeScanSession(sid, key);
    if (res.success) {
      setForm(formFromDraft(res.data?.draft));
      setShowDescription(false);
      setPhase("review");
      navigator.vibrate?.([20, 40, 20]);
    } else {
      setMessage(res.error || "تعذّر التحليل");
      setPhase("capture");
    }
  };

  const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const removeColor = (index) =>
    setForm((prev) => ({ ...prev, colors: prev.colors.filter((_, i) => i !== index) }));

  const handlePublish = async (event) => {
    event.preventDefault();
    setPublishing(true);
    setMessage("");
    const product = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      quantity: form.quantity === "" ? 0 : Number(form.quantity),
      status: form.status,
      colors: form.colors.filter((c) => c.name.trim()),
      sizes: form.sizes
        .split(/[,،\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
      metaTitle: form.metaTitle,
      metaDescription: form.metaDescription,
    };
    const res = await publishScannedProductFromPhone(sid, key, product);
    setPublishing(false);
    if (!res.success) {
      setMessage(res.error || "فشل نشر المنتج");
      if (res.expired) setPhase("error");
      return;
    }
    setResult(res.data);
    setPhase("done");
    navigator.vibrate?.([20, 40, 20]);
  };

  // Start another product in the same session (the dashboard resets too).
  const addAnother = async () => {
    setBusy(true);
    setMessage("");
    const res = await resetScanSession(sid, key);
    setBusy(false);
    if (!res.success) {
      setMessage(res.error || "تعذّر بدء منتج جديد");
      if (res.expired) setPhase("error");
      return;
    }
    setThumbs([]);
    setForm(EMPTY_FORM);
    setResult(null);
    setPhase("capture");
  };

  if (!sid || !key) {
    return (
      <main className="scan-phone" dir="rtl">
        <div className="scan-phone-card">
          <div className="scan-phone-center">
            <div className="scan-phone-check scan-phone-check-warn">
              <Icon name="alert" size={36} />
            </div>
            <h1>رابط غير صالح</h1>
            <p className="scan-phone-muted">امسح رمز QR من لوحة التاجر مرة أخرى.</p>
          </div>
        </div>
      </main>
    );
  }

  const isCapturing = phase === "capture" || phase === "analyzing";
  const analyzing = phase === "analyzing";
  const limitReached = thumbs.length >= MAX_IMAGES;
  const locked = busy || analyzing;

  return (
    <main className="scan-phone" dir="rtl">
      <div className="scan-phone-card">
        <header className="scan-phone-top">
          <div className="scan-phone-badge">
            <Icon name="camera" size={16} /> منتج جديد
          </div>
          {phase !== "error" && <span className="scan-phone-live">متصل بلوحة التاجر</span>}
        </header>

        {phase === "joining" && (
          <div className="scan-phone-center">
            <div className="scan-phone-spinner" />
            <p className="scan-phone-muted">جارٍ الاتصال بمتجرك…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="scan-phone-center">
            <div className="scan-phone-check scan-phone-check-warn">
              <Icon name="alert" size={36} />
            </div>
            <h1>تعذّر المتابعة</h1>
            <p className="scan-phone-error">{message}</p>
            <p className="scan-phone-muted">ارجع للوحة التاجر وأنشئ رمز QR جديدًا.</p>
          </div>
        )}

        {isCapturing && (
          <>
            <div className="scan-phone-main">
              <div className="scan-phone-hero">
                <h1>صوّر المنتج من عدة زوايا</h1>
                <p className="scan-phone-muted">
                  الصورة الأولى هي الصورة الرئيسية للمنتج في متجرك.
                </p>
              </div>

              <div>
                <div className="scan-phone-counter">
                  <span>الصور المرفوعة</span>
                  <span>
                    <b>{thumbs.length}</b> / {MAX_IMAGES}
                  </span>
                </div>
                <div className="scan-phone-progress">
                  <i style={{ width: `${(thumbs.length / MAX_IMAGES) * 100}%` }} />
                </div>
              </div>

              <ul className={`scan-phone-grid${analyzing ? " is-analyzing" : ""}`}>
                {Array.from({ length: MAX_IMAGES }, (_, i) => (
                  <li key={i} className={`scan-phone-slot${thumbs[i] ? " filled" : ""}`}>
                    {thumbs[i] ? (
                      <>
                        <img src={thumbs[i]} alt={`صورة ${i + 1}`} />
                        {i === 0 && <span>الرئيسية</span>}
                      </>
                    ) : (
                      <Icon name="image" size={26} />
                    )}
                  </li>
                ))}
              </ul>

              {thumbs.length === 0 && (
                <ul className="scan-phone-tips">
                  <li>
                    <Icon name="sparkles" size={16} /> استخدم إضاءة جيدة وخلفية بسيطة
                  </li>
                  <li>
                    <Icon name="camera" size={16} /> صوّر المنتج من الأمام والجانب والتفاصيل
                  </li>
                </ul>
              )}

              {message && <p className="scan-phone-error">{message}</p>}
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="scan-phone-dock">
              <div className="scan-phone-actions">
                <button
                  type="button"
                  id="scan-phone-camera"
                  className={`scan-btn ${thumbs.length ? "scan-btn-ghost" : "scan-btn-primary"}`}
                  disabled={locked || limitReached}
                  onClick={() => cameraRef.current?.click()}
                >
                  {busy ? (
                    "جارٍ الرفع…"
                  ) : thumbs.length ? (
                    <>
                      <Icon name="add" size={18} /> صورة أخرى
                    </>
                  ) : (
                    <>
                      <Icon name="camera" size={18} /> افتح الكاميرا
                    </>
                  )}
                </button>
                <button
                  type="button"
                  id="scan-phone-gallery"
                  className="scan-btn scan-btn-ghost"
                  aria-label="من المعرض"
                  disabled={locked || limitReached}
                  onClick={() => galleryRef.current?.click()}
                >
                  <Icon name="image" size={20} />
                </button>
              </div>

              <button
                type="button"
                id="scan-phone-analyze"
                className="scan-btn scan-btn-accent"
                disabled={thumbs.length === 0 || locked}
                onClick={handleAnalyze}
              >
                <Icon name="aiSparkles" size={18} />
                {analyzing ? "الذكاء الاصطناعي يحلل الصور…" : "تحليل وإرسال للوحة"}
              </button>
            </div>
          </>
        )}

        {phase === "review" && (
          <form className="scan-phone-form" onSubmit={handlePublish}>
            <div className="scan-phone-main">
              <div className="scan-phone-hero">
                <h1>راجع بيانات المنتج</h1>
                <p className="scan-phone-muted">
                  استخرج الذكاء الاصطناعي البيانات من صورك. أضف السعر وانشر مباشرة.
                </p>
              </div>

              <div className="scan-phone-strip">
                {thumbs.map((src, i) => (
                  <img key={i} src={src} alt={`صورة ${i + 1}`} />
                ))}
              </div>

              <label className="scan-phone-field scan-phone-price">
                <span>السعر (ر.س) *</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={setField("price")}
                  placeholder="0.00"
                />
              </label>

              <label className="scan-phone-field">
                <span>اسم المنتج *</span>
                <input required value={form.name} onChange={setField("name")} />
                {form.category && <small>التصنيف المقترح: {form.category}</small>}
              </label>

              <div className="scan-phone-row">
                <label className="scan-phone-field">
                  <span>الكمية</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.quantity}
                    onChange={setField("quantity")}
                  />
                </label>
                <label className="scan-phone-field">
                  <span>المقاسات</span>
                  <input value={form.sizes} onChange={setField("sizes")} placeholder="S، M، L" />
                </label>
              </div>

              <div className="scan-phone-field">
                <span>حالة النشر</span>
                <div className="scan-phone-seg" role="radiogroup">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.status === "sale"}
                    className={form.status === "sale" ? "active" : ""}
                    onClick={() => setForm((p) => ({ ...p, status: "sale" }))}
                  >
                    معروض للبيع
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.status === "hidden"}
                    className={form.status === "hidden" ? "active" : ""}
                    onClick={() => setForm((p) => ({ ...p, status: "hidden" }))}
                  >
                    مسودة
                  </button>
                </div>
              </div>

              {form.colors.length > 0 && (
                <div className="scan-phone-field">
                  <span>الألوان المكتشفة</span>
                  <div className="scan-phone-chips">
                    {form.colors.map((c, i) => (
                      <span className="scan-phone-chip" key={i}>
                        <i style={{ background: c.hex }} />
                        {c.name}
                        <button type="button" aria-label="حذف اللون" onClick={() => removeColor(i)}>
                          <Icon name="close" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="scan-phone-field">
                <button
                  type="button"
                  className="scan-phone-toggle"
                  onClick={() => setShowDescription((v) => !v)}
                  aria-expanded={showDescription}
                >
                  <span>الوصف والسيو</span>
                  <Icon name="chevronDown" size={16} />
                </button>
                {showDescription && (
                  <>
                    <textarea rows={6} value={form.description} onChange={setField("description")} />
                    <input
                      value={form.metaTitle}
                      onChange={setField("metaTitle")}
                      maxLength={70}
                      placeholder="عنوان السيو"
                    />
                  </>
                )}
              </div>

              {message && <p className="scan-phone-error">{message}</p>}
            </div>

            <div className="scan-phone-dock">
              <button type="submit" className="scan-btn scan-btn-primary" disabled={publishing}>
                <Icon name={publishing ? "package" : "rocket"} size={18} />
                {publishing ? "جارٍ النشر على سلة…" : "نشر على سلة الآن"}
              </button>
              <button
                type="button"
                className="scan-btn scan-btn-ghost"
                disabled={publishing}
                onClick={() => setPhase("capture")}
              >
                رجوع للصور
              </button>
            </div>
          </form>
        )}

        {phase === "done" && (
          <>
            <div className="scan-phone-center">
              <div className="scan-phone-check">
                <Icon name="check" size={40} />
              </div>
              <h1>تم نشر المنتج!</h1>
              <p className="scan-phone-muted">أصبح المنتج في متجرك على سلة بصوره وبياناته.</p>
              {result?.warnings?.map((w) => (
                <p key={w} className="scan-phone-error">
                  {w}
                </p>
              ))}
            </div>
            <div className="scan-phone-dock">
              <button type="button" className="scan-btn scan-btn-primary" disabled={busy} onClick={addAnother}>
                <Icon name="add" size={18} /> إضافة منتج آخر
              </button>
              {result?.url && (
                <a className="scan-btn scan-btn-ghost" href={result.url} target="_blank" rel="noopener noreferrer">
                  عرض المنتج
                </a>
              )}
              {message && <p className="scan-phone-error">{message}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
