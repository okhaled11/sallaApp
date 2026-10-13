import { useMemo, useState } from "react";
import Icon from "../Icon.jsx";
import { AD_FORMATS, AD_STYLES, generateAdImage } from "../../utils/adImageApi.js";
import "./ad-studio.css";

const MAX_HISTORY = 6;

/**
 * Turns a product photo into a marketing image (white studio, lifestyle,
 * luxury, ...) with Gemini's image model. The product is kept as photographed.
 */
export default function AdStudio({ products = [], token, onShowToast }) {
  const withImage = useMemo(() => products.filter((p) => p.image), [products]);
  const [productId, setProductId] = useState("");
  const [style, setStyle] = useState("studio");
  const [format, setFormat] = useState("square");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [current, setCurrent] = useState(null); // { image, productName, style, format }
  const [history, setHistory] = useState([]);

  const selected = withImage.find((p) => String(p.id) === String(productId)) || null;

  const handleGenerate = async () => {
    if (!selected) {
      setError("اختر منتجًا أولًا");
      return;
    }
    setBusy(true);
    setError("");
    setErrorDetail("");
    const res = await generateAdImage({ token, productId: selected.id, style, format, note });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "تعذّر توليد الصورة");
      setErrorDetail(res.detail || "");
      return;
    }
    const entry = { image: res.data.image, productName: selected.name, style, format };
    setCurrent(entry);
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
    onShowToast?.("تم توليد الصورة الإعلانية", "success");
  };

  const handleDownload = () => {
    if (!current) return;
    const link = document.createElement("a");
    link.href = current.image;
    link.download = `ad-${current.style}-${current.format}.png`;
    link.click();
  };

  const ratio = AD_FORMATS.find((f) => f.id === (current?.format || format))?.ratio || "1:1";

  return (
    <section className="adstudio" aria-labelledby="adstudio-title">
      <header className="adstudio-head">
        <div className="adstudio-badge">
          <Icon name="aiPaintbrush" size={14} />
          <span>مدعوم بنموذج Gemini لتوليد الصور</span>
        </div>
        <h2 id="adstudio-title">الصور الإعلانية بالذكاء الاصطناعي</h2>
        <p>
          اختر منتجًا ونمط الإعلان، ويعيد الذكاء الاصطناعي تصوير المنتج في خلفية احترافية جاهزة للنشر على
          إنستغرام وسناب وسلة، مع الحفاظ على شكل المنتج كما هو.
        </p>
      </header>

      <div className="adstudio-grid">
        <div className="panel adstudio-controls">
          <div className="adstudio-field">
            <span className="adstudio-label">١. المنتج</span>
            <div className="adstudio-products" role="listbox" aria-label="المنتجات">
              {withImage.length === 0 && <p className="adstudio-note">لا توجد منتجات بصور بعد.</p>}
              {withImage.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={String(p.id) === String(productId)}
                  className={`adstudio-product${String(p.id) === String(productId) ? " active" : ""}`}
                  onClick={() => setProductId(String(p.id))}
                  title={p.name}
                >
                  <img src={p.image} alt={p.name} loading="lazy" />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="adstudio-field">
            <span className="adstudio-label">٢. نمط الإعلان</span>
            <div className="adstudio-chips">
              {AD_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`adstudio-chip${style === s.id ? " active" : ""}`}
                  onClick={() => setStyle(s.id)}
                  title={s.hint}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adstudio-field">
            <span className="adstudio-label">٣. المقاس</span>
            <div className="adstudio-chips">
              {AD_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`adstudio-chip${format === f.id ? " active" : ""}`}
                  onClick={() => setFormat(f.id)}
                >
                  {f.label} <small dir="ltr">{f.ratio}</small>
                </button>
              ))}
            </div>
          </div>

          <label className="adstudio-field">
            <span className="adstudio-label">٤. توجيه إضافي (اختياري)</span>
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: على طاولة خشبية بجانب كوب قهوة"
            />
          </label>

          {error && (
            <p className="adstudio-error" role="alert">
              {error}
              {errorDetail && <small dir="ltr">{errorDetail}</small>}
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary adstudio-generate"
            disabled={busy || !selected}
            onClick={handleGenerate}
          >
            <Icon name="aiSparkles" size={16} />
            {busy ? "جارٍ توليد الصورة… (حتى 30 ثانية)" : "ولّد الصورة الإعلانية"}
          </button>
        </div>

        <div className="panel adstudio-result">
          <div className="adstudio-stage" style={{ aspectRatio: ratio.replace(":", " / ") }}>
            {busy && (
              <div className="adstudio-loading">
                <div className="adstudio-spinner" />
                <span>الذكاء الاصطناعي يصمّم إعلانك…</span>
              </div>
            )}
            {!busy && current && <img src={current.image} alt={`صورة إعلانية لـ ${current.productName}`} />}
            {!busy && !current && selected && <img className="adstudio-source" src={selected.image} alt={selected.name} />}
            {!busy && !current && !selected && (
              <div className="adstudio-empty">
                <Icon name="image" size={40} />
                <span>اختر منتجًا لتبدأ</span>
              </div>
            )}
          </div>

          {current && !busy && (
            <div className="adstudio-actions">
              <button type="button" className="btn btn-secondary" onClick={handleDownload}>
                <Icon name="download" size={14} />
                تنزيل الصورة
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleGenerate}>
                <Icon name="refresh" size={14} />
                إعادة التوليد
              </button>
            </div>
          )}

          {history.length > 1 && (
            <div>
              <span className="adstudio-label">الصور السابقة</span>
              <ul className="adstudio-history">
                {history.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setCurrent(h)} aria-label={`عرض صورة ${h.productName}`}>
                      <img src={h.image} alt={h.productName} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="adstudio-note">
            الصور تُولَّد بالذكاء الاصطناعي وقد تختلف تفاصيل صغيرة عن المنتج الأصلي. راجعها قبل النشر، ولا تعتمد
            عليها وحدها كصورة وحيدة للمنتج.
          </p>
        </div>
      </div>
    </section>
  );
}
