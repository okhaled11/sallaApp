import { useState, useMemo, useCallback } from "react";
import Icon from "./Icon.jsx";
import { calculateGeoSales } from "../utils/geoSalesData.js";

/**
 * StoreSalesMap Component
 * Interactive geographic presence & sales map for Salla merchants.
 * Left: Vector SVG map of countries and operational cities with interactive beacons.
 * Right: Dynamic store sales metrics, top products, and delivery SLAs per city on hover/click.
 */
export default function StoreSalesMap({ products = [], currency = "ر.س" }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [hoveredCityId, setHoveredCityId] = useState(null);
  const [selectedCityId, setSelectedCityId] = useState(null);

  const { regions, summary } = useMemo(() => {
    return calculateGeoSales(products);
  }, [products]);

  const filteredRegions = useMemo(() => {
    if (activeFilter === "SA") {
      return regions.filter((r) => r.countryCode === "SA");
    }
    if (activeFilter === "GCC") {
      return regions.filter((r) => r.countryCode !== "SA");
    }
    return regions;
  }, [regions, activeFilter]);

  // Priority: Hovered city > Selected city > Default first city (Riyadh)
  const activeCity = useMemo(() => {
    if (hoveredCityId) {
      const found = regions.find((r) => r.id === hoveredCityId);
      if (found) return found;
    }
    if (selectedCityId) {
      const found = regions.find((r) => r.id === selectedCityId);
      if (found) return found;
    }
    return filteredRegions[0] || regions[0];
  }, [hoveredCityId, selectedCityId, regions, filteredRegions]);

  const handleCityClick = useCallback((cityId) => {
    setSelectedCityId((prev) => (prev === cityId ? null : cityId));
  }, []);

  const handleResetSelection = useCallback(() => {
    setSelectedCityId(null);
    setHoveredCityId(null);
  }, []);

  return (
    <section
      className="panel geo-sales-panel"
      aria-label="خريطة المبيعات والانتشار الجغرافي"
    >
      <header className="panel-header geo-panel-header">
        <div className="geo-header-title-group">
          <span className="geo-header-icon-badge">
            <Icon name="globe" size={20} />
          </span>
          <div>
            <h2 className="panel-title">خريطة المبيعات والانتشار الجغرافي</h2>
            <span className="panel-subtitle">
              حجم الطلبات وسرعة الشحن في مدن ودول انتشار المتجر
            </span>
          </div>
        </div>

        <div className="geo-header-actions">
          {/* Quick Region Filters */}
          <div className="geo-filter-pills" role="radiogroup" aria-label="تصفية المناطق">
            <button
              type="button"
              className={`geo-filter-btn ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              كل المناطق ({regions.length})
            </button>
            <button
              type="button"
              className={`geo-filter-btn ${activeFilter === "SA" ? "active" : ""}`}
              onClick={() => setActiveFilter("SA")}
            >
              🇸🇦 السعودية
            </button>
            <button
              type="button"
              className={`geo-filter-btn ${activeFilter === "GCC" ? "active" : ""}`}
              onClick={() => setActiveFilter("GCC")}
            >
              🌐 دول الخليج
            </button>
          </div>

          {/* Quick Summary Pill */}
          <div className="geo-quick-summary-pill">
            <span className="geo-summary-label">إجمالي مبيعات المناطق:</span>
            <span className="geo-summary-value">
              {summary.totalRevenue.toLocaleString()} {currency}
            </span>
          </div>
        </div>
      </header>

      <div className="geo-map-layout">
        {/* Left Side: Interactive SVG Map */}
        <div className="geo-map-visual-container">
          <div className="geo-map-card">
            <div className="geo-map-status-overlay">
              <span className="geo-radar-indicator">
                <span className="geo-radar-ping" />
                <span className="geo-radar-core" />
              </span>
              <span className="geo-status-text">
                خريطة حية • {filteredRegions.length} مدن نشطة
              </span>
              {selectedCityId && (
                <button
                  type="button"
                  className="geo-clear-selection-btn"
                  onClick={handleResetSelection}
                  title="إلغاء التثبيت"
                >
                  إلغاء التثبيت ✕
                </button>
              )}
            </div>

            <svg
              className="geo-interactive-svg"
              viewBox="0 0 600 480"
              role="img"
              aria-label="خريطة مدن الشرق الأوسط والخليج"
            >
              <defs>
                {/* Ambient Grid Pattern */}
                <pattern
                  id="geoGrid"
                  width="30"
                  height="30"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 30 0 L 0 0 0 30"
                    fill="none"
                    stroke="var(--border-color)"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                    opacity="0.4"
                  />
                </pattern>

                {/* Land Gradient */}
                <linearGradient id="landGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--bg-secondary)" />
                  <stop offset="100%" stopColor="var(--bg-tertiary)" />
                </linearGradient>

                {/* Ocean Ambient Gradient */}
                <radialGradient id="oceanGlow" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(0, 77, 91, 0.05)" />
                  <stop offset="100%" stopColor="rgba(115, 252, 215, 0.02)" />
                </radialGradient>
              </defs>

              {/* Water Backdrop & Grid */}
              <rect width="600" height="480" fill="url(#oceanGlow)" rx="12" />
              <rect width="600" height="480" fill="url(#geoGrid)" rx="12" />

              {/* Stylized Arabian Peninsula Landmass Outline */}
              <path
                className="geo-landmass"
                d="M 120 130 
                   Q 180 80, 310 90 
                   Q 340 100, 355 125 
                   Q 370 170, 385 200 
                   Q 395 210, 420 220 
                   Q 440 230, 475 240 
                   Q 510 270, 520 310 
                   Q 515 360, 470 395 
                   Q 410 440, 340 445 
                   Q 260 440, 230 380 
                   Q 200 340, 185 290 
                   Q 150 220, 120 130 Z"
                fill="url(#landGradient)"
                stroke="var(--border-color-strong)"
                strokeWidth="1.5"
              />

              {/* Interior Territory Division Accents */}
              <path
                className="geo-internal-border"
                d="M 330 115 Q 315 160, 305 210 Q 285 290, 230 380"
                fill="none"
                stroke="var(--border-color)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <path
                className="geo-internal-border"
                d="M 385 200 Q 425 240, 460 270 Q 480 330, 510 350"
                fill="none"
                stroke="var(--border-color)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />

              {/* Body of Water labels */}
              <text x="140" y="270" className="geo-water-label" transform="rotate(-65 140 270)">
                البحر الأحمر
              </text>
              <text x="430" y="185" className="geo-water-label">
                الخليج العربي
              </text>

              {/* Interactive City Beacons */}
              {filteredRegions.map((city) => {
                const isActive = activeCity?.id === city.id;
                const isSelected = selectedCityId === city.id;

                return (
                  <g
                    key={city.id}
                    className={`geo-city-group ${isActive ? "active" : ""} ${
                      isSelected ? "selected" : ""
                    }`}
                    transform={`translate(${city.x}, ${city.y})`}
                    onMouseEnter={() => setHoveredCityId(city.id)}
                    onMouseLeave={() => setHoveredCityId(null)}
                    onClick={() => handleCityClick(city.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${city.name} - ${city.revenue} ${currency}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCityClick(city.id);
                      }
                    }}
                  >
                    {/* Animated Pulsing Radar Rings */}
                    <circle
                      className="geo-beacon-pulse"
                      r={isActive ? 18 : 10}
                      fill="none"
                      stroke={isActive ? "var(--salla-secondary)" : "var(--salla-primary)"}
                      strokeWidth={isActive ? 2 : 1.2}
                      opacity={isActive ? 0.8 : 0.4}
                    />

                    {/* Secondary Accent Glow */}
                    <circle
                      r={isActive ? 9 : 6}
                      fill={isActive ? "var(--salla-secondary)" : "var(--salla-primary)"}
                      opacity={0.3}
                    />

                    {/* Core Anchor Dot */}
                    <circle
                      className="geo-beacon-core"
                      r={isActive ? 5.5 : 4}
                      fill={isActive ? "var(--salla-primary)" : "var(--salla-primary)"}
                      stroke={isActive ? "var(--salla-secondary)" : "#ffffff"}
                      strokeWidth={isActive ? 2 : 1.5}
                    />

                    {/* Permanent City Name Tag */}
                    <text
                      y={isActive ? -14 : -10}
                      className={`geo-city-pin-name ${isActive ? "highlight" : ""}`}
                      textAnchor="middle"
                    >
                      {city.name}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Map Interaction Hint */}
            <div className="geo-map-footer-hint">
              <Icon name="location" size={14} />
              <span>مرر المؤشر أو انقر على أي مدينة لعرض إحصائياتها</span>
            </div>
          </div>
        </div>

        {/* Right Side: City Analytics & Details Sidebar */}
        <div className="geo-details-container">
          {activeCity ? (
            <div className="geo-city-card" key={activeCity.id}>
              {/* City Card Header */}
              <div className="geo-city-card-header">
                <div className="geo-city-title-row">
                  <span className="geo-city-flag" aria-hidden="true">
                    {activeCity.flag}
                  </span>
                  <div>
                    <h3 className="geo-city-name">{activeCity.name}</h3>
                    <span className="geo-country-label">
                      {activeCity.country} • {activeCity.deliveryPartner}
                    </span>
                  </div>
                </div>

                <div className="geo-city-badges-col">
                  {activeCity.isHeadquarters ? (
                    <span className="geo-hq-badge">مركز رئيسي</span>
                  ) : (
                    <span className="geo-active-badge">نشط</span>
                  )}
                  <span className="geo-growth-pill">
                    +{activeCity.growth}% نمو
                  </span>
                </div>
              </div>

              {/* Core Financial & Logistics Metrics */}
              <div className="geo-metrics-grid">
                <div className="geo-metric-box revenue">
                  <div className="geo-metric-icon">
                    <Icon name="money" size={16} />
                  </div>
                  <div className="geo-metric-text">
                    <span className="geo-metric-label">إجمالي المبيعات</span>
                    <strong className="geo-metric-val">
                      {activeCity.revenue.toLocaleString()} {currency}
                    </strong>
                    <div className="geo-share-track">
                      <div
                        className="geo-share-fill"
                        style={{ width: `${activeCity.salesSharePercent}%` }}
                        title={`${activeCity.salesSharePercent}% من مبيعات المتجر`}
                      />
                    </div>
                    <span className="geo-share-text">
                      {activeCity.salesSharePercent}% من مبيعات المتجر
                    </span>
                  </div>
                </div>

                <div className="geo-metric-box orders">
                  <div className="geo-metric-icon">
                    <Icon name="package" size={16} />
                  </div>
                  <div className="geo-metric-text">
                    <span className="geo-metric-label">الطلبات المكتملة</span>
                    <strong className="geo-metric-val">
                      {activeCity.ordersCount.toLocaleString()} طلب
                    </strong>
                    <span className="geo-sub-text">
                      متوسط السلة: {activeCity.averageOrderValue} {currency}
                    </span>
                  </div>
                </div>

                <div className="geo-metric-box speed">
                  <div className="geo-metric-icon">
                    <Icon name="checklist" size={16} />
                  </div>
                  <div className="geo-metric-text">
                    <span className="geo-metric-label">مدة التوصيل</span>
                    <strong className="geo-metric-val">
                      {activeCity.deliverySpeed}
                    </strong>
                    <span className="geo-sub-text">
                      {activeCity.activeCouriers} مسارات شحن نشطة
                    </span>
                  </div>
                </div>

                <div className="geo-metric-box satisfaction">
                  <div className="geo-metric-icon">
                    <Icon name="checkCircle" size={16} />
                  </div>
                  <div className="geo-metric-text">
                    <span className="geo-metric-label">نسبة رضا العملاء</span>
                    <strong className="geo-metric-val">
                      {activeCity.satisfaction}%
                    </strong>
                    <span className="geo-sub-text">تقييم ممتاز للخدمة</span>
                  </div>
                </div>
              </div>

              {/* Best Selling Products in this City */}
              <div className="geo-top-products-section">
                <div className="geo-section-title-row">
                  <span className="geo-section-icon">
                    <Icon name="trophy" size={14} />
                  </span>
                  <h4 className="geo-section-title">
                    المنتجات الأكثر طلباً في {activeCity.name}
                  </h4>
                </div>

                {activeCity.topProducts.length > 0 ? (
                  <div className="geo-products-list">
                    {activeCity.topProducts.map((product) => (
                      <div key={product.id} className="geo-product-item">
                        <div className="geo-product-info">
                          <span className="geo-product-name">{product.name}</span>
                          <span className="geo-product-category">
                            {product.category?.name || "عام"}
                          </span>
                        </div>
                        <div className="geo-product-meta">
                          <span className="geo-product-price">
                            {product.regularPrice || product.salePrice || 0} {currency}
                          </span>
                          <span className="geo-product-sold">
                            {product.soldQuantity || 0} تم بيعها
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="geo-empty-products">
                    <span>لا توجد منتجات محددة مسجلة بعد لهذه المدينة.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="geo-placeholder-card">
              <Icon name="globe" size={32} />
              <p>حدد أو مرر المؤشر على إحدى مدن الخريطة لعرض تفاصيلها</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
