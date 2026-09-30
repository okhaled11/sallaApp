import { useState, useMemo } from "react";
import Icon from "../Icon.jsx";
import { calculateCatalogContentStats } from "../../utils/contentEngine.js";
import ContentEnhancerModal from "./ContentEnhancerModal.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

export default function ContentStudio({ products = [] }) {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score_asc");
  const [selectedProductAnalysis, setSelectedProductAnalysis] = useState(null);

  // Compute stats across catalog
  const catalogStats = useMemo(() => {
    return calculateCatalogContentStats(products);
  }, [products]);

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    let list = catalogStats.analyzedProducts;

    // Filter by search
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term)),
      );
    }

    // Filter by criteria
    if (activeFilter === "needs_improvement") {
      list = list.filter((p) => p.score < 80);
    } else if (activeFilter === "missing_image") {
      list = list.filter((p) => !p.checklist.hasImage);
    } else if (activeFilter === "missing_sku") {
      list = list.filter((p) => !p.checklist.hasSku);
    } else if (activeFilter === "excellent") {
      list = list.filter((p) => p.score >= 85);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "score_asc") return a.score - b.score;
      if (sortBy === "score_desc") return b.score - a.score;
      if (sortBy === "name") return a.name.localeCompare(b.name, "ar");
      return 0;
    });
  }, [catalogStats.analyzedProducts, searchTerm, activeFilter, sortBy]);

  const {
    totalProducts,
    averageScore,
    healthRating,
    needsAttentionCount,
    missingImagesCount,
    missingSkuCount,
    uncategorizedCount,
  } = catalogStats;

  return (
    <div className="content-studio-view">
      {/* Studio Header & KPIs */}
      <div className="content-hero-card">
        <div className="content-hero-info">
          <div className="hero-icon-badge">
            <Icon name="aiSparkles" size={28} />
          </div>
          <div>
            <h1 className="content-hero-title">ستوديو جودة المحتوى والسيو</h1>
            <p className="content-hero-desc">
              فحص وتحسين جودة كتالوج المتجر: العناوين، الصور، الرموز التعريفية،
              ومحاكاة الظهور في محركات البحث ووسائل التواصل الاجتماعي.
            </p>
          </div>
        </div>

        {/* Global Content Score Circle / Meter */}
        <div className="content-global-score-box">
          <div className="score-number-display">
            <span className="score-val">{averageScore}</span>
            <span className="score-total">/100</span>
          </div>
          <div className="score-meta">
            <span className="score-label">مؤشر جودة المحتوى</span>
            <span
              className={`score-badge-pill ${healthRating === "ممتاز" ? "excellent" : "good"}`}
            >
              {healthRating}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="content-kpi-grid">
        <div className="content-kpi-card">
          <div className="kpi-icon-wrap">
            <Icon name="package" size={20} />
          </div>
          <div className="kpi-text-wrap">
            <span className="kpi-val">{totalProducts}</span>
            <span className="kpi-title">إجمالي المنتجات المفحوصة</span>
          </div>
        </div>

        <div className="content-kpi-card">
          <div className="kpi-icon-wrap warning">
            <Icon name="alert" size={20} />
          </div>
          <div className="kpi-text-wrap">
            <span className="kpi-val">{needsAttentionCount}</span>
            <span className="kpi-title">منتجات بحاجة لتحسين</span>
          </div>
        </div>

        <div className="content-kpi-card">
          <div className="kpi-icon-wrap danger">
            <Icon name="image" size={20} />
          </div>
          <div className="kpi-text-wrap">
            <span className="kpi-val">{missingImagesCount}</span>
            <span className="kpi-title">منتجات بدون صورة</span>
          </div>
        </div>

        <div className="content-kpi-card">
          <div className="kpi-icon-wrap info">
            <Icon name="tag" size={20} />
          </div>
          <div className="kpi-text-wrap">
            <span className="kpi-val">{missingSkuCount}</span>
            <span className="kpi-title">منتجات بدون SKU</span>
          </div>
        </div>

        <div className="content-kpi-card">
          <div className="kpi-icon-wrap secondary">
            <Icon name="checklist" size={20} />
          </div>
          <div className="kpi-text-wrap">
            <span className="kpi-val">{uncategorizedCount}</span>
            <span className="kpi-title">منتجات بدون تصنيف</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="content-toolbar">
        <div className="content-search-wrapper">
          <Icon name="search" size={16} className="search-icon" />
          <input
            type="search"
            className="content-search-input"
            placeholder="ابحث بالاسم أو SKU للتحقق من المحتوى..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchTerm("")}
              aria-label="مسح البحث"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="content-filter-chips">
          <button
            type="button"
            className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            الكل ({totalProducts})
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === "needs_improvement" ? "active" : ""}`}
            onClick={() => setActiveFilter("needs_improvement")}
          >
            بحاجة لتحسين ({needsAttentionCount})
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === "missing_image" ? "active" : ""}`}
            onClick={() => setActiveFilter("missing_image")}
          >
            صور مفقودة ({missingImagesCount})
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === "missing_sku" ? "active" : ""}`}
            onClick={() => setActiveFilter("missing_sku")}
          >
            بدون SKU ({missingSkuCount})
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === "excellent" ? "active" : ""}`}
            onClick={() => setActiveFilter("excellent")}
          >
            مكتمل ({totalProducts - needsAttentionCount})
          </button>
        </div>

        {/* Sort Select */}
        <div className="content-sort-wrap">
          <label htmlFor="content-sort-select" className="sort-label">
            ترتيب:
          </label>
          <select
            id="content-sort-select"
            className="content-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="score_asc">الأقل تقييماً (أولوية الإصلاح)</option>
            <option value="score_desc">الأعلى تقييماً</option>
            <option value="name">الاسم أبجدياً</option>
          </select>
        </div>
      </div>

      {/* Product Content Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="empty-content-state">
          <Icon name="checkCircle" size={40} className="empty-icon" />
          <h3>لا توجد منتجات مطابقة لهذا الفلتر</h3>
          <p>جرّب اختيار فلتر آخر أو تفريغ شريط البحث.</p>
        </div>
      ) : (
        <div className="content-cards-grid">
          {filteredProducts.map((analysis) => {
            const {
              id,
              name,
              sku,
              image,
              score,
              status,
              statusLabel,
              issues,
              categories,
              checklist,
            } = analysis;

            return (
              <div key={id} className={`product-content-card ${status}`}>
                <div className="card-top-row">
                  <div className="product-media-wrap">
                    {image ? (
                      <img src={image} alt={name} className="product-thumb" />
                    ) : (
                      <div className="product-thumb-placeholder">
                        <Icon name="image" size={24} />
                      </div>
                    )}
                  </div>
                  <div className="card-header-info">
                    <div className="card-badge-row">
                      <span className={`content-badge ${status}`}>
                        {statusLabel}
                      </span>
                      <span className="card-score-pill">{score}/100</span>
                    </div>
                    <h3 className="product-card-title" title={name}>
                      {name}
                    </h3>
                    <div className="card-meta-tags">
                      {sku ? (
                        <span className="sku-tag">SKU: {sku}</span>
                      ) : (
                        <span className="sku-missing-tag">بدون SKU</span>
                      )}
                      {categories.length > 0 && (
                        <span className="cat-tag">{categories[0].name}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Checklist Mini Row */}
                <div className="card-checklist-mini">
                  <span
                    className={`mini-check ${checklist.hasImage ? "ok" : "fail"}`}
                    title={checklist.hasImage ? "الصورة متوفرة" : "صورة مفقودة"}
                  >
                    <Icon
                      name={checklist.hasImage ? "checkCircle" : "alert"}
                      size={12}
                    />
                    صورة
                  </span>
                  <span
                    className={`mini-check ${checklist.optimalTitle ? "ok" : "fail"}`}
                    title={
                      checklist.optimalTitle ? "العنوان مثالي" : "العنوان قصير"
                    }
                  >
                    <Icon
                      name={checklist.optimalTitle ? "checkCircle" : "alert"}
                      size={12}
                    />
                    سيو
                  </span>
                  <span
                    className={`mini-check ${checklist.hasSku ? "ok" : "fail"}`}
                    title={checklist.hasSku ? "الرمز متوفر" : "بدون SKU"}
                  >
                    <Icon
                      name={checklist.hasSku ? "checkCircle" : "alert"}
                      size={12}
                    />
                    SKU
                  </span>
                  <span
                    className={`mini-check ${checklist.isCategorized ? "ok" : "fail"}`}
                    title={
                      checklist.isCategorized ? "التصنيف مربوط" : "بدون تصنيف"
                    }
                  >
                    <Icon
                      name={checklist.isCategorized ? "checkCircle" : "alert"}
                      size={12}
                    />
                    تصنيف
                  </span>
                </div>

                {/* Score Progress Bar */}
                <div className="card-progress-track">
                  <div
                    className={`card-progress-fill ${status}`}
                    style={{ width: `${score}%` }}
                  />
                </div>

                {/* Issues summary if any */}
                {issues.length > 0 ? (
                  <div className="card-issues-preview">
                    <Icon name="alert" size={13} />
                    <span>{issues[0].label}</span>
                  </div>
                ) : (
                  <div className="card-issues-clean">
                    <Icon name="checkCircle" size={13} />
                    <span>محتوى مكتمل وجاهز للظهور</span>
                  </div>
                )}

                {/* Action Button */}
                <button
                  type="button"
                  className="btn btn-outline card-action-btn"
                  onClick={() => setSelectedProductAnalysis(analysis)}
                >
                  <Icon name="sparkles" size={16} />
                  <span>فحص وسيو المحتوى</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {selectedProductAnalysis && (
        <ContentEnhancerModal
          analysis={selectedProductAnalysis}
          onClose={() => setSelectedProductAnalysis(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
