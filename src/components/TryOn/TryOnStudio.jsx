import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import {
  buildTryOnInstallSnippet,
  fetchTryOnItems,
  publishTryOnItems,
} from "../../utils/tryOnApi.js";
import { fileToOverlayDataUrl } from "../../utils/tryOnImage.js";

const DEFAULT_SCALE = 2.1;
const MAX_ITEMS = 20;

// Reference face for the preview: eye corners 80 units apart, same maths as tryon.js.
const FACE = { eyeY: 105, eyeDist: 80, width: 200, height: 240 };

function FacePreview({ item }) {
  const pct = (value, total) => `${(value / total) * 100}%`;
  return (
    <div className="tryon-preview" role="img" aria-label="معاينة موضع الإكسسوار على الوجه">
      <svg viewBox={`0 0 ${FACE.width} ${FACE.height}`} aria-hidden="true">
        <ellipse cx="100" cy="120" rx="68" ry="92" fill="var(--bg-tertiary)" stroke="var(--border-color)" strokeWidth="2" />
        <circle cx="60" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
        <circle cx="140" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
        <path d="M100 118 L92 150 L108 150" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
        <path d="M78 178 Q100 192 122 178" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
      </svg>
      <img
        src={item.image}
        alt=""
        className="tryon-preview-overlay"
        style={{
          width: pct(FACE.eyeDist * item.scale, FACE.width),
          top: pct(FACE.eyeY + item.offsetY * FACE.eyeDist, FACE.height),
        }}
      />
    </div>
  );
}

/**
 * Try-on studio: the merchant attaches a transparent product image (glasses,
 * earrings...) to a product, tunes how it sits on a face, and publishes. The
 * storefront script then offers visitors a camera try-on for that product.
 */
export default function TryOnStudio({ products = [], token, storeId, onShowToast }) {
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const activeStoreId = storeId ? String(storeId) : "";

  useEffect(() => {
    if (!activeStoreId) {
      setLoadState("ready");
      return undefined;
    }
    let cancelled = false;
    fetchTryOnItems(activeStoreId).then((res) => {
      if (cancelled) return;
      setItems(res.items);
      setLoadState(res.success ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [activeStoreId]);

  const itemById = useMemo(() => new Map(items.map((i) => [String(i.productId), i])), [items]);

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => String(p.name || "").toLowerCase().includes(q)) : products;
  }, [products, query]);

  const selectedProduct = products.find((p) => String(p.id) === selectedId) || null;
  const selectedItem = selectedId ? itemById.get(selectedId) : null;

  const patchItem = useCallback((productId, patch) => {
    setItems((prev) => prev.map((i) => (String(i.productId) === productId ? { ...i, ...patch } : i)));
    setDirty(true);
  }, []);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedProduct) return;
    if (!itemById.has(selectedId) && items.length >= MAX_ITEMS) {
      onShowToast?.(`الحد الأقصى ${MAX_ITEMS} منتجات`, "error");
      return;
    }
    setUploading(true);
    const result = await fileToOverlayDataUrl(file);
    setUploading(false);
    if (!result.success) {
      onShowToast?.(result.error, "error");
      return;
    }
    setItems((prev) => {
      const without = prev.filter((i) => String(i.productId) !== selectedId);
      const existing = prev.find((i) => String(i.productId) === selectedId);
      return [
        ...without,
        {
          productId: selectedId,
          name: selectedProduct.name || "",
          image: result.image,
          scale: existing?.scale ?? DEFAULT_SCALE,
          offsetY: existing?.offsetY ?? 0,
          enabled: true,
        },
      ];
    });
    setDirty(true);
  };

  const handleRemove = () => {
    setItems((prev) => prev.filter((i) => String(i.productId) !== selectedId));
    setDirty(true);
  };

  const handlePublish = async () => {
    setSaving(true);
    const res = await publishTryOnItems({ token, storeId: activeStoreId, items });
    setSaving(false);
    if (res.success) {
      setDirty(false);
      onShowToast?.(
        res.persisted === false
          ? "تم الحفظ مؤقتاً فقط (لا يوجد تخزين دائم مُعدّ على السيرفر)"
          : "تم نشر التجربة الافتراضية في متجرك",
        res.persisted === false ? "warning" : "success",
      );
    } else {
      onShowToast?.(res.error || "تعذر نشر الإعدادات", "error");
    }
  };

  const snippet = useMemo(
    () =>
      activeStoreId && typeof window !== "undefined"
        ? buildTryOnInstallSnippet({ origin: window.location.origin, storeId: activeStoreId })
        : "",
    [activeStoreId],
  );

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
    <div className="tryon-studio">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-title">التجربة الافتراضية (نظارات وإكسسوارات)</span>
            <span className="panel-subtitle">
              يجرّب الزائر المنتج على وجهه بالكاميرا. المعالجة داخل متصفحه، بلا تكلفة وبلا رفع صور.
            </span>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-primary" disabled={!dirty || saving || !activeStoreId} onClick={handlePublish}>
              {saving ? "جارٍ النشر..." : "حفظ ونشر"}
            </button>
          </div>
        </div>

        {!activeStoreId && (
          <div className="tryon-notice">تعذر تحديد معرّف المتجر. افتح التطبيق من لوحة تحكم سلة.</div>
        )}
        {loadState === "error" && (
          <div className="tryon-notice">تعذر تحميل الإعدادات المنشورة حالياً.</div>
        )}

        <div className="tryon-layout">
          <div className="tryon-list">
            <input
              type="search"
              className="risk-field"
              placeholder="ابحث عن منتج..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="tryon-products">
              {visibleProducts.map((p) => {
                const id = String(p.id);
                const configured = itemById.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`tryon-product ${selectedId === id ? "active" : ""}`}
                      onClick={() => setSelectedId(id)}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="product-thumb" />
                      ) : (
                        <span className="product-thumb product-thumb-empty"><Icon name="image" size={18} /></span>
                      )}
                      <span className="tryon-product-name">{p.name}</span>
                      {configured && <span className="salla-badge-tag">مفعّل</span>}
                    </button>
                  </li>
                );
              })}
              {visibleProducts.length === 0 && <li className="tryon-empty">لا توجد منتجات مطابقة</li>}
            </ul>
          </div>

          <div className="tryon-editor">
            {!selectedProduct ? (
              <div className="tryon-empty">اختر منتجاً من القائمة لإعداد التجربة الافتراضية له.</div>
            ) : (
              <>
                <h3 className="tryon-editor-title">{selectedProduct.name}</h3>
                <input ref={fileRef} type="file" accept="image/png,image/webp" hidden onChange={handleFile} />
                <div className="tryon-editor-actions">
                  <button type="button" className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <Icon name="image" size={14} />
                    {uploading ? "جارٍ المعالجة..." : selectedItem ? "استبدال الصورة" : "رفع صورة المنتج (PNG شفاف)"}
                  </button>
                  {selectedItem && (
                    <button type="button" className="btn btn-danger" onClick={handleRemove}>
                      إيقاف التجربة لهذا المنتج
                    </button>
                  )}
                </div>
                <p className="tryon-hint">
                  استخدم صورة للمنتج من الأمام وبخلفية شفافة (النظارة وحدها بدون وجه). يتم قص الحواف الفارغة تلقائياً.
                </p>

                {selectedItem && (
                  <div className="tryon-tuner">
                    <FacePreview item={selectedItem} />
                    <div className="tryon-sliders">
                      <label>
                        الحجم ({selectedItem.scale.toFixed(2)}×)
                        <input
                          type="range"
                          min="1"
                          max="3.5"
                          step="0.05"
                          value={selectedItem.scale}
                          onChange={(e) => patchItem(selectedId, { scale: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        الموضع الرأسي ({selectedItem.offsetY.toFixed(2)})
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={selectedItem.offsetY}
                          onChange={(e) => patchItem(selectedId, { offsetY: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel tryon-install">
        <div className="panel-header">
          <div>
            <span className="panel-title">تركيب الكود في المتجر (مرة واحدة)</span>
            <span className="panel-subtitle">
              أضف الكود التالي كـ Snippet من نوع JavaScript (بدون وسوم HTML)، وبعدها أي تعديل تنشره هنا يظهر تلقائياً.
            </span>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn" disabled={!snippet} onClick={handleCopy}>
              <Icon name="copy" size={14} />
              {copied ? "تم النسخ" : "نسخ"}
            </button>
          </div>
        </div>
        <pre className="tryon-code" dir="ltr">{snippet || "—"}</pre>
      </div>
    </div>
  );
}
