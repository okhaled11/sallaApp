import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeScanSession,
  joinScanSession,
  uploadScanImage,
} from "../../utils/scanApi.js";
import { fileToScanDataUrl } from "../../utils/scanImage.js";
import "./scan.css";

const MAX_IMAGES = 6;

/**
 * Phone-side page opened from the dashboard QR (?m=capture&s=<sid>&k=<key>).
 * The merchant takes 1-6 photos, they upload, and the AI drafts the product
 * on the dashboard. No Salla login is needed: the QR carries a short-lived key.
 */
export default function PhoneCapture() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("s") || "";
  const key = params.get("k") || "";

  const [phase, setPhase] = useState("joining"); // joining | capture | analyzing | done | error
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
    if (res.success) setPhase("done");
    else {
      setMessage(res.error || "تعذّر التحليل");
      setPhase("capture");
    }
  };

  const reset = () => {
    setThumbs([]);
    setPhase("capture");
  };

  if (!sid || !key) {
    return (
      <main className="scan-phone" dir="rtl">
        <div className="scan-phone-card">
          <h1>رابط غير صالح</h1>
          <p>امسح رمز QR من لوحة التاجر مرة أخرى.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="scan-phone" dir="rtl">
      <div className="scan-phone-card">
        <div className="scan-phone-badge">📸 تصوير منتج جديد</div>

        {phase === "joining" && <p className="scan-phone-muted">جارٍ الاتصال بمتجرك…</p>}

        {phase === "error" && (
          <>
            <h1>تعذّر المتابعة</h1>
            <p className="scan-phone-error">{message}</p>
            <p className="scan-phone-muted">ارجع للوحة التاجر وأنشئ رمز QR جديدًا.</p>
          </>
        )}

        {(phase === "capture" || phase === "analyzing") && (
          <>
            <h1>صوّر المنتج من عدة زوايا</h1>
            <p className="scan-phone-muted">
              صورة واضحة بإضاءة جيدة تكفي. يمكنك إضافة حتى {MAX_IMAGES} صور.
            </p>

            {thumbs.length > 0 && (
              <ul className="scan-phone-thumbs">
                {thumbs.map((src, i) => (
                  <li key={src.slice(-40) + i}>
                    <img src={src} alt={`صورة ${i + 1}`} />
                    {i === 0 && <span>الرئيسية</span>}
                  </li>
                ))}
              </ul>
            )}

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

            <div className="scan-phone-actions">
              <button
                type="button"
                id="scan-phone-camera"
                className="scan-btn scan-btn-primary"
                disabled={busy || phase === "analyzing" || thumbs.length >= MAX_IMAGES}
                onClick={() => cameraRef.current?.click()}
              >
                {busy ? "جارٍ الرفع…" : thumbs.length ? "＋ صورة أخرى" : "📷 افتح الكاميرا"}
              </button>
              <button
                type="button"
                id="scan-phone-gallery"
                className="scan-btn scan-btn-ghost"
                disabled={busy || phase === "analyzing" || thumbs.length >= MAX_IMAGES}
                onClick={() => galleryRef.current?.click()}
              >
                🖼️ من المعرض
              </button>
            </div>

            {message && <p className="scan-phone-error">{message}</p>}

            <button
              type="button"
              id="scan-phone-analyze"
              className="scan-btn scan-btn-accent"
              disabled={thumbs.length === 0 || busy || phase === "analyzing"}
              onClick={handleAnalyze}
            >
              {phase === "analyzing" ? "✨ الذكاء الاصطناعي يحلل الصور…" : "✨ تحليل وإرسال للوحة"}
            </button>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="scan-phone-check">✓</div>
            <h1>تم الإرسال!</h1>
            <p className="scan-phone-muted">
              افتح لوحة التاجر على الكمبيوتر: بيانات المنتج جاهزة، أضف السعر والألوان وانشر.
            </p>
            <button type="button" className="scan-btn scan-btn-ghost" onClick={reset}>
              إضافة صور أخرى وإعادة التحليل
            </button>
          </>
        )}
      </div>
    </main>
  );
}
