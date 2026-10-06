import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import {
  buildTryOnInstallSnippet,
  fetchTryOnItems,
  publishTryOnItems,
} from "../../utils/tryOnApi.js";
import { fileToOverlayDataUrl } from "../../utils/tryOnImage.js";
import {
  DEFAULT_LIPSTICK,
  TRYON_TYPES,
  TRYON_TYPE_IDS,
  isItemComplete,
  typeOf,
} from "../../utils/tryOnTypes.js";
import FacePreview from "./FacePreview.jsx";

const MAX_ITEMS = 20;

const buildItem = (product, type, extra) => ({
  productId: String(product.id),
  name: product.name || "",
  type,
  image: "",
  fit: 1,
  offsetX: 0,
  offsetY: 0,
  mirror: true,
  enabled: true,
  ...(type === "lipstick" ? DEFAULT_LIPSTICK : {}),
  ...extra,
});

// Items saved before types existed have no type: they are glasses.
const normalizeItem = (item) => ({
  ...item,
  type: typeOf(item),
  offsetX: item.offsetX ?? 0,
  offsetY: item.offsetY ?? 0,
  mirror: item.mirror !== false,
});

const lipstickOf = (item) => ({
  color: item.color ?? DEFAULT_LIPSTICK.color,
  opacity: item.opacity ?? DEFAULT_LIPSTICK.opacity,
  finish: item.finish ?? DEFAULT_LIPSTICK.finish,
});

/**
 * Try-on studio: the merchant picks a product type (glasses, earrings, hat, necklace, lipstick),
 * attaches a transparent image (or a lipstick colour), tunes how it sits on a face, and publishes.
 * The storefront script then offers visitors a camera try-on for that product.
 */
export default function TryOnStudio({ products = [], token, storeId, onShowToast }) {
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [selectedId, setSelectedId] = useState(null);
  const [draftTypes, setDraftTypes] = useState({});
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
      setItems(res.items.map(normalizeItem));
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
  const type = selectedItem ? typeOf(selectedItem) : draftTypes[selectedId] || "glasses";
  const typeInfo = TRYON_TYPES[type];
  const incompleteCount = items.filter((i) => !isItemComplete(i)).length;

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
      return [...without, { ...(existing || buildItem(selectedProduct, type)), image: result.image }];
    });
    setDirty(true);
  };

  const handleActivateLipstick = () => {
    if (items.length >= MAX_ITEMS) {
      onShowToast?.(`الحد الأقصى ${MAX_ITEMS} منتجات`, "error");
      return;
    }
    setItems((prev) => [...prev, buildItem(selectedProduct, "lipstick")]);
    setDirty(true);
  };

  const handleTypeChange = (next) => {
    if (!selectedItem) {
      setDraftTypes((prev) => ({ ...prev, [selectedId]: next }));
      return;
    }
    // Lipstick has no image; every other type needs one (upload it if the item has none yet).
    patchItem(selectedId, next === "lipstick" ? { type: next, image: "", ...lipstickOf(selectedItem) } : { type: next });
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
            <span className="panel-title">التجربة الافتراضية (نظارات، أقراط، قبعات، سلاسل، أحمر شفاه)</span>
            <span className="panel-subtitle">
              يجرّب الزائر المنتج على وجهه بالكاميرا. المعالجة داخل متصفحه، بلا تكلفة وبلا رفع صور.
            </span>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-primary" disabled={!dirty || saving || !activeStoreId || incompleteCount > 0} onClick={handlePublish}>
              {saving ? "جارٍ النشر..." : "حفظ ونشر"}
            </button>
          </div>
        </div>

        {!activeStoreId && (
          <div className="tryon-notice">تعذر تحديد معرّف المتجر. افتح التطبيق من لوحة تحكم سلة.</div>
        )}
        {incompleteCount > 0 && (
          <div className="tryon-notice">
            {incompleteCount} منتج بحاجة لرفع صورة قبل النشر (أو أوقف التجربة له).
          </div>
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
                <label className="tryon-field">
                  نوع المنتج
                  <select className="risk-field" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
                    {TRYON_TYPE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {TRYON_TYPES[id].label}
                      </option>
                    ))}
                  </select>
                </label>
                <input ref={fileRef} type="file" accept="image/png,image/webp" hidden onChange={handleFile} />
                <div className="tryon-editor-actions">
                  {typeInfo.needsImage ? (
                    <button type="button" className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      <Icon name="image" size={14} />
                      {uploading
                        ? "جارٍ المعالجة..."
                        : selectedItem?.image
                          ? "استبدال الصورة"
                          : "رفع صورة المنتج (PNG شفاف)"}
                    </button>
                  ) : (
                    !selectedItem && (
                      <button type="button" className="btn" onClick={handleActivateLipstick}>
                        تفعيل أحمر الشفاه لهذا المنتج
                      </button>
                    )
                  )}
                  {selectedItem && (
                    <button type="button" className="btn btn-danger" onClick={handleRemove}>
                      إيقاف التجربة لهذا المنتج
                    </button>
                  )}
                </div>
                <p className="tryon-hint">{typeInfo.hint}</p>
                {selectedItem && typeInfo.needsImage && !selectedItem.image && (
                  <p className="tryon-hint">ارفع صورة لهذا النوع لتظهر المعاينة ويمكن النشر.</p>
                )}

                {selectedItem && isItemComplete(selectedItem) && (
                  <div className="tryon-tuner">
                    <FacePreview item={selectedItem} />
                    <div className="tryon-sliders">
                      {type === "lipstick" ? (
                        <>
                          <label>
                            لون الأحمر
                            <input
                              type="color"
                              value={selectedItem.color}
                              onChange={(e) => patchItem(selectedId, { color: e.target.value })}
                            />
                          </label>
                          <label>
                            الكثافة ({Math.round(selectedItem.opacity * 100)}%)
                            <input
                              type="range"
                              min="0.2"
                              max="1"
                              step="0.01"
                              value={selectedItem.opacity}
                              onChange={(e) => patchItem(selectedId, { opacity: Number(e.target.value) })}
                            />
                          </label>
                          <label>
                            اللمعة
                            <select
                              className="risk-field"
                              value={selectedItem.finish}
                              onChange={(e) => patchItem(selectedId, { finish: e.target.value })}
                            >
                              <option value="matte">مطفي</option>
                              <option value="gloss">لامع</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <>
                          <p className="tryon-hint">
                            الحجم والموضع يُضبطان تلقائياً على وجه كل زائر. استخدم السلايدرز للتعديل البسيط فقط.
                          </p>
                          <label>
                            تكبير/تصغير ({Math.round((selectedItem.fit ?? 1) * 100)}%)
                            <input
                              type="range"
                              min="0.5"
                              max="1.6"
                              step="0.01"
                              value={selectedItem.fit ?? 1}
                              onChange={(e) => patchItem(selectedId, { fit: Number(e.target.value) })}
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
                          {type === "earrings" && (
                            <>
                              <label>
                                البعد عن الأذن ({selectedItem.offsetX.toFixed(2)})
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  value={selectedItem.offsetX}
                                  onChange={(e) => patchItem(selectedId, { offsetX: Number(e.target.value) })}
                                />
                              </label>
                              <label className="tryon-check">
                                <input
                                  type="checkbox"
                                  checked={selectedItem.mirror}
                                  onChange={(e) => patchItem(selectedId, { mirror: e.target.checked })}
                                />
                                عكس الصورة للأذن الأخرى
                              </label>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => patchItem(selectedId, { fit: 1, offsetX: 0, offsetY: 0 })}
                          >
                            إعادة الضبط التلقائي
                          </button>
                        </>
                      )}
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
