import Icon from "../Icon.jsx";

/**
 * Top navigation bar to switch between the main sales dashboard
 * and the Content & SEO Quality Studio.
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
  ];

  return (
    <nav className="app-navbar" aria-label="Main Navigation">
      <div className="navbar-container">
        <div className="navbar-tabs" role="tablist">
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
                className={`navbar-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="navbar-tab-icon-wrapper">
                  <Icon name={tab.icon} size={18} />
                </span>
                <span className="navbar-tab-text-group">
                  <span className="navbar-tab-title">{tab.label}</span>
                  <span className="navbar-tab-subtitle">{tab.subtitle}</span>
                </span>
                {tab.badge && (
                  <span
                    className="navbar-tab-badge"
                    title={`${tab.badge} منتجات بحاجة لتحسين المحتوى`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="navbar-chrome-hint" title="مربوط مع شريط سلة العلوي">
          <span className="navbar-hint-dot" />
          <span className="navbar-hint-text">
            متزامن مع إجراءات شريط سلة العلوي
          </span>
        </div>
      </div>
    </nav>
  );
}
