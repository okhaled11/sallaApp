import { useMemo, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import { buildVisualSearchSnippet, searchByImage } from "../../utils/visualSearchApi.js";
import { fileToScanDataUrl } from "../../utils/scanImage.js";
import "./visual-search.css";

/**
 * Dashboard side of visual search: install the storefront script once, and try
 * the search here with any photo before shoppers see it.
 */
export default function VisualSearchStudio({ onShowToast }) {
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [outcome, setOutcome] = useState(null); // { description, matches }
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const snippet = useMemo(
    () => (typeof window === "undefined" ? "" : buildVisualSearchSnippet({ origin: window.location.origin })),
    [],
  );

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setErrorDetail("");
    setOutcome(null);
    try {
      const dataUrl = await fileToScanDataUrl(file, 768, 0.8);
      setPreview(dataUrl);
      const res = await searchByImage(dataUrl);
      if (res.success) setOutcome(res.data);
      else {
        setError(res.error || "تعذّر البحث");
        setErrorDetail(res.detail || "");
      }
    } catch {
      setError("تعذّرت قراءة الصورة");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast?.("تعذر النسخ، انسخ الكود يدوياً", "error");
    }
  };

  return (
    <section className="vsearch" aria-labelledby="vsearch-title">
      <header className="vsearch-head">
        <div className="vsearch-badge">
          <Icon name="camera" size={14} />
          <span>للزوار: ابحث بالصورة</span>
        </div>
        <h2 id="vsearch-title">البحث بالصورة في متجرك</h2>
        <p>
          يضيف زرّ كاميرا في متجرك. الزائر يصوّر شيئًا أعجبه، فيعرض له الذكاء الاصطناعي أقرب منتجاتك المتوفرة.
        </p>
      </header>

      <div className="vsearch-grid">
        <div className="panel vsearch-try">
          <div className="panel-header">
            <div>
              <span className="panel-title">جرّبها الآن</span>
              <span className="panel-subtitle">ارفع أي صورة لترى ما سيظهر لزوار متجرك.</span>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="image" size={14} />
            {busy ? "جارٍ البحث…" : "اختر صورة للتجربة"}
          </button>

          {preview && <img className="vsearch-preview" src={preview} alt="الصورة المختارة" />}
          {error && (
            <p className="vsearch-error" role="alert">
              {error}
              {errorDetail && <small dir="ltr">{errorDetail}</small>}
            </p>
          )}
          {outcome && (
            <>
              <p className="vsearch-note">
                {outcome.matches.length
                  ? `${outcome.description || "النتائج"} — ${outcome.matches.length} منتجات مشابهة`
                  : "لم يجد منتجات مشابهة لهذه الصورة."}
              </p>
              <ul className="vsearch-results">
                {outcome.matches.map((m) => (
                  <li key={m.id}>
                    {m.image && <img src={m.image} alt={m.name} loading="lazy" />}
                    <div>
                      <strong>{m.name}</strong>
                      <span>
                        {m.price} {m.currency}
                      </span>
                      {m.reason && <small>{m.reason}</small>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel vsearch-install">
          <div className="panel-header">
            <div>
              <span className="panel-title">كود التضمين (تركيب لمرة واحدة)</span>
              <span className="panel-subtitle">
                أضفه كـ Snippet من نوع JavaScript في متجرك، فيظهر زر "ابحث بالصورة" للزوار.
              </span>
            </div>
            <div className="panel-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCopy}>
                <Icon name="copy" size={14} />
                {copied ? "تم النسخ" : "نسخ الكود"}
              </button>
            </div>
          </div>
          <pre className="tryon-code" dir="ltr">{snippet || "—"}</pre>
          <p className="vsearch-note">
            تُحدَّث قائمة المنتجات كل 5 دقائق، ولا تظهر المنتجات المخفية أو النافدة.
          </p>
        </div>
      </div>
    </section>
  );
}
