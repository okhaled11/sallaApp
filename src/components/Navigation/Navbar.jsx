import Icon from "../Icon.jsx";

/**
 * Salla Merchant Dashboard Navigation Bar
 * Follows Salla's exact dark dashboard hierarchy:
 * Breadcrumbs > Date Range & Controls > Clean pill tabs
 */
export default function Navbar({
  activeTab,
  onTabChange,
  contentIssuesCount = 0,
}) {
  const tabs = [
    {
      id: "sales",
      label: "المبيعات والأرباح",
      subtitle: "المؤشرات المالية والمخزون",
      icon: "barChart",
    },
    {
      id: "content",
      label: "ستوديو المحتوى والسيو",
      subtitle: "جودة المنتجات والظهور",
      icon: "aiSparkles",
      badge: contentIssuesCount > 0 ? contentIssuesCount : null,
    },
    {
      id: "risk",
      label: "الطلبات الخطرة",
      subtitle: "كشف مخاطر الدفع عند الاستلام",
      icon: "alert",
    },
    {
      id: "incentives",
      label: "تحفيز الزوار والخصومات",
      subtitle: "خصم الـ 3 زيارات بدون شراء",
      icon: "tag",
      badgeLabel: "تجريبي",
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <nav className="app-navbar salla-dashboard-navbar" aria-label="Main Navigation">
      {/* Salla Official Header: Breadcrumbs & Date Range Controls */}
      <div className="salla-breadcrumb-bar">
        <div className="salla-breadcrumbs">
          <span className="salla-breadcrumb-root">التقارير</span>
          <span className="salla-breadcrumb-sep">‹</span>
          <span className="salla-breadcrumb-current">أداء المتجر</span>
        </div>

        <div className="salla-header-controls">
          <button type="button" className="salla-date-range-pill" title="الفترة الزمنية للتقرير">
            <Icon name="calendar" size={13} />
            <span>سبتمبر 23, 2026 - سبتمبر 30, 2026</span>
            <Icon name="chevronDown" size={12} />
          </button>
          <button type="button" className="salla-icon-btn-pill" title="خيارات إضافية">
            <span>•••</span>
          </button>
        </div>
      </div>

      {/* Salla Nav Tabs Bar */}
      <div className="navbar-container salla-tabs-wrapper">
        <div className="navbar-tabs salla-pill-tabs" role="tablist">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                className={`navbar-tab-btn salla-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="navbar-tab-icon-wrapper salla-tab-icon">
                  <Icon name={tab.icon} size={15} />
                </span>
                <span className="navbar-tab-title salla-tab-label">{tab.label}</span>
                {tab.badge && (
                  <span
                    className="navbar-tab-badge salla-badge-count"
                    title={`${tab.badge} منتجات بحاجة لتحسين المحتوى`}
                  >
                    {tab.badge}
                  </span>
                )}
                {tab.badgeLabel && !tab.badge && (
                  <span className="salla-badge-tag">
                    {tab.badgeLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="navbar-chrome-hint salla-sync-pill" title="متزامن مع متجر سلة">
          <span className="navbar-hint-dot salla-status-dot" />
          <span className="navbar-hint-text">
            متصل بمتجر سلة
          </span>
        </div>
      </div>
    </nav>
  );
}

