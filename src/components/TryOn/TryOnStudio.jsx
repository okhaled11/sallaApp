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
import ARTryOnModal from "./AR/ARTryOnModal.jsx";

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
  const [arModalOpen, setArModalOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window !== "undefined" && !window.openSallaTryOn) {
      const script = document.createElement("script");
      script.src = "/storefront/tryon.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleLiveCameraTest = () => {
    if (typeof window !== "undefined" && window.openSallaTryOn && selectedItem && isItemComplete(selectedItem)) {
      window.openSallaTryOn(selectedItem);
    } else if (!selectedItem || !isItemComplete(selectedItem)) {
      onShowToast?.("يرجى رفع صورة للمنتج أولاً للمعاينة بالكاميرا", "info");
    } else {
      onShowToast?.("جارٍ تجهيز محرك الكاميرا...", "info");
    }
  };

  return (
    <div className="tryon-studio content-studio-view">
      {/* Hero Card matching ContentStudio & IncentivesStudio */}
      <div className="content-hero-card tryon-hero-card">
        <div className="content-hero-info">
          <div className="hero-icon-badge">
            <Icon name="aiSparkles" size={28} />
          </div>
          <div>
            <h1 className="content-hero-title">ستوديو التجربة الافتراضية الذكية (AR Try-On)</h1>
            <p className="content-hero-desc">
              تقنية واقع معزز تفاعلية بالكاميرا للزوار (MediaPipe). يتم ضبط مقاس وأبعاد وميلان المنتج
              تلقائياً على حجم رأس ووجه كل زائر بالمليمتر بدون أي حاجة لضبط يدوي.
            </p>
          </div>
        </div>

        <div className="tryon-hero-actions-box">
          <div className="tryon-hero-pill-badge">
            <Icon name="aiSparkles" size={14} />
            <span className="tryon-pill-text">مطابقة تلقائية 100%</span>
            <span className="tryon-pill-count">{itemById.size} مفعّل</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || saving || !activeStoreId || incompleteCount > 0}
            onClick={handlePublish}
          >
            <Icon name="check" size={15} />
            <span>{saving ? "جارٍ النشر..." : "حفظ ونشر"}</span>
          </button>
        </div>
      </div>

      {!activeStoreId && (
        <div className="tryon-notice">تعذر تحديد معرّف المتجر. افتح التطبيق من لوحة تحكم سلة.</div>
      )}
      {incompleteCount > 0 && (
        <div className="tryon-notice tryon-notice-warning">
          <Icon name="alert" size={16} />
          <span>{incompleteCount} منتج بحاجة لرفع صورة قبل النشر (أو أوقف التجربة له).</span>
        </div>
      )}
      {loadState === "error" && (
        <div className="tryon-notice tryon-notice-error">
          <Icon name="alert" size={16} />
          <span>تعذر تحميل الإعدادات المنشورة حالياً.</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="tryon-workspace-card panel">
        <div className="tryon-layout">
          {/* Sidebar Products List */}
          <div className="tryon-list">
            <div className="tryon-list-header">
              <span className="tryon-list-title">قائمة المنتجات ({products.length})</span>
            </div>
            <div className="tryon-search-wrap">
              <input
                type="search"
                className="risk-field tryon-search-field"
                placeholder="ابحث عن منتج..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="tryon-products">
              {visibleProducts.map((p) => {
                const id = String(p.id);
                const configured = itemById.has(id);
                const isSelected = selectedId === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`tryon-product ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedId(id)}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="product-thumb" />
                      ) : (
                        <span className="product-thumb product-thumb-empty"><Icon name="image" size={18} /></span>
                      )}
                      <span className="tryon-product-name">{p.name}</span>
                      {configured && <span className="salla-badge-tag active">مفعّل</span>}
                    </button>
                  </li>
                );
              })}
              {visibleProducts.length === 0 && <li className="tryon-empty">لا توجد منتجات مطابقة للبحث</li>}
            </ul>
          </div>

          {/* Main Editor & Live Preview Area */}
          <div className="tryon-editor">
            {!selectedProduct ? (
              <div className="tryon-empty-state">
                <div className="tryon-empty-icon">
                  <Icon name="image" size={36} />
                </div>
                <h3>اختر منتجاً من القائمة الجانبية</h3>
                <p>اختر أي منتج (نظارات، قبعة، أقراط، سلسلة، أو أحمر شفاه) لإعداد التجربة الافتراضية الذكية له.</p>
              </div>
            ) : (
              <div className="tryon-editor-content">
                {/* Editor Top Bar */}
                <div className="tryon-editor-top">
                  <div>
                    <h3 className="tryon-editor-title">{selectedProduct.name}</h3>
                    <span className="tryon-editor-type-label">
                      {typeInfo.label} • {selectedItem ? "مفعّل للتجربة الافتراضية" : "غير مفعّل بعد"}
                    </span>
                  </div>
                  <div className="tryon-editor-actions">
                    {typeInfo.needsImage ? (
                      <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                        <Icon name="image" size={14} />
                        {uploading
                          ? "جارٍ المعالجة..."
                          : selectedItem?.image
                            ? "استبدال الصورة"
                            : "رفع صورة المنتج (PNG شفاف)"}
                      </button>
                    ) : (
                      !selectedItem && (
                        <button type="button" className="btn btn-secondary" onClick={handleActivateLipstick}>
                          <Icon name="sparkles" size={14} />
                          <span>تفعيل أحمر الشفاه لهذا المنتج</span>
                        </button>
                      )
                    )}
                    {selectedItem && (
                      <button type="button" className="btn btn-danger" onClick={handleRemove}>
                        <Icon name="delete" size={14} />
                        <span>إيقاف التجربة لهذا المنتج</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="tryon-field-row">
                  <label className="tryon-field">
                    نوع المنتج
                    <select className="risk-field tryon-select" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
                      {TRYON_TYPE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {TRYON_TYPES[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="tryon-hint">{typeInfo.hint}</p>
                </div>

                <input ref={fileRef} type="file" accept="image/png,image/webp" hidden onChange={handleFile} />

                {selectedItem && typeInfo.needsImage && !selectedItem.image && (
                  <div className="tryon-upload-prompt">
                    <Icon name="image" size={24} />
                    <span>ارفع صورة مفرّغة بخلفية شفافة (PNG) لتطبيق المنتج على الوجه تلقائياً.</span>
                    <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                      <Icon name="image" size={14} />
                      <span>اختر صورة من جهازك</span>
                    </button>
                  </div>
                )}

                {selectedItem && isItemComplete(selectedItem) && (
                  <div className="tryon-workspace-body">
                    {/* Left: Preview Card with ample headroom */}
                    <div className="tryon-preview-pane">
                      <FacePreview item={selectedItem} />
                      <button
                        type="button"
                        className="btn btn-primary tryon-live-btn"
                        onClick={() => setArModalOpen(true)}
                        style={{
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          color: "#fff",
                          boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                        }}
                      >
                        <Icon name="aiSparkles" size={18} />
                        <span>تجربة سناب شات ثلاثية الأبعاد (Snapchat 3D AR)</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary tryon-live-btn"
                        onClick={handleLiveCameraTest}
                      >
                        <Icon name="camera" size={18} />
                        <span>معاينة المتجر بالكاميرا المباشرة</span>
                      </button>
                    </div>

                    {/* Right: AI Auto-Fit Showcase Card */}
                    <div className="tryon-controls-pane">
                      {type === "lipstick" ? (
                        <div className="tryon-auto-fit-card">
                          <h4 className="tryon-card-heading">تخصيص لون أحمر الشفاه</h4>
                          <div className="tryon-lipstick-controls">
                            <label className="tryon-field">
                              لون الأحمر
                              <input
                                type="color"
                                className="tryon-color-input"
                                value={selectedItem.color}
                                onChange={(e) => patchItem(selectedId, { color: e.target.value })}
                              />
                            </label>
                            <label className="tryon-field">
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
                            <label className="tryon-field">
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
                          </div>
                        </div>
                      ) : (
                        <div className="tryon-auto-fit-card">
                          <div className="tryon-auto-header">
                            <div className="tryon-auto-badge-icon">
                              <Icon name="aiSparkles" size={22} />
                            </div>
                            <div>
                              <h4 className="tryon-card-heading">المطابقة والتحجيم التلقائي بالذكاء الاصطناعي</h4>
                              <p className="tryon-card-desc">
                                تقنية سناب شات الذكية (MediaPipe 478-Point): المقاس والارتفاع والدوران يتعدلون تلقائياً على كل زائر.
                              </p>
                            </div>
                          </div>

                          <div className="tryon-smart-metrics-grid">
                            <div className="tryon-metric-item">
                              <Icon name="checkCircle" size={18} className="tryon-metric-check" />
                              <div>
                                <strong>التحجيم التلقائي بالمليمتر</strong>
                                <span>حساب عرض الصدغين وجمجمة الرأس لحظياً لمطابقة الحجم بنسبة 1:1</span>
                              </div>
                            </div>
                            <div className="tryon-metric-item">
                              <Icon name="checkCircle" size={18} className="tryon-metric-check" />
                              <div>
                                <strong>محاذاة الموضع والارتفاع</strong>
                                <span>يرتكز المنتج تلقائياً على المعالم التشريحية (الجبهة، العينين، أو الذقن)</span>
                              </div>
                            </div>
                            <div className="tryon-metric-item">
                              <Icon name="checkCircle" size={18} className="tryon-metric-check" />
                              <div>
                                <strong>التتبع ثلاثي الأبعاد 3D Pose</strong>
                                <span>يتبع ميلان الرأس (Roll / Pitch / Yaw) في كل إطار فيديو بدقة</span>
                              </div>
                            </div>
                            <div className="tryon-metric-item">
                              <Icon name="checkCircle" size={18} className="tryon-metric-check" />
                              <div>
                                <strong>العمق والإضاءة المجسمة 3D Depth</strong>
                                <span>إسقاط ظلال حركية تفاعلية ولمعان سطحي (Specular Sheen) لمحاكاة الواقعية ثلاثية الأبعاد مثل سناب شات</span>
                              </div>
                            </div>
                            <div className="tryon-metric-item">
                              <Icon name="checkCircle" size={18} className="tryon-metric-check" />
                              <div>
                                <strong>كشف متعدد الوجوه</strong>
                                <span>تطبيق المنتج تلقائياً على جميع الوجوه الظاهرة في الفيديو</span>
                              </div>
                            </div>
                          </div>

                          {/* 3D Image Guidelines Tip for Snapchat-quality results */}
                          <div className="tryon-3d-tip-box">
                            <div className="tryon-3d-tip-header">
                              <Icon name="sparkles" size={16} />
                              <strong>كيف تجعل الصورة تبدو 3D مثل سناب شات؟</strong>
                            </div>
                            <ul className="tryon-3d-tip-list">
                              <li><strong>صيغة شفافة (PNG / WebP):</strong> بدون أي خلفية بيضاء وبحواف نظيفة ومقصوصة بدقة.</li>
                              <li><strong>زاوية التصوير:</strong> زاوية أمامية مباشرة أو مائلة قليلاً (3/4 angle) لتوضيح عمق وأذرع الإطار.</li>
                              <li><strong>إضاءة المنتج:</strong> إضاءة استوديو ناعمة ومتوازنة بدون بقع ظل غامقة لتحقيق أقصى واقعية مع الإضاءة الحركية.</li>
                            </ul>
                          </div>

                          {/* Collapsible advanced manual tuning (clean and unobtrusive) */}
                          <details className="tryon-advanced-tuning">
                            <summary className="tryon-advanced-summary">
                              <span>خيارات الضبط اليدوي المتقدمة (اختياري)</span>
                              <span className="tryon-advanced-note">الحجم مضبوط تلقائياً 100%، يمكنك الإزاحة الطفيفة إذا رغبت</span>
                            </summary>
                            <div className="tryon-sliders">
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
                                <Icon name="refresh" size={14} />
                                <span>إعادة الضبط التلقائي</span>
                              </button>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Code Snippet Installation Panel */}
      <div className="panel tryon-install">
        <div className="panel-header">
          <div>
            <span className="panel-title">كود التضمين في المتجر (تركيب لمرة واحدة)</span>
            <span className="panel-subtitle">
              أضف الكود التالي كـ Snippet من نوع JavaScript (بدون وسوم HTML)، وبعدها أي تعديل تنشره هنا يظهر تلقائياً لزوار المتجر.
            </span>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary" disabled={!snippet} onClick={handleCopy}>
              <Icon name="copy" size={14} />
              {copied ? "تم النسخ" : "نسخ الكود"}
            </button>
          </div>
        </div>
        <pre className="tryon-code" dir="ltr">{snippet || "—"}</pre>
      </div>

      {/* Snapchat-Style 3D AR Try-On Studio Modal */}
      <ARTryOnModal
        isOpen={arModalOpen}
        onClose={() => setArModalOpen(false)}
        initialItem={selectedItem}
      />
    </div>
  );
}
