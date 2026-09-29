import { useState, useMemo, useEffect, useId } from "react";
import Icon from "../Icon.jsx";
import Button from "../forms/Button.jsx";
import CampaignCard from "./CampaignCard.jsx";
import CampaignDetailsModal from "./CampaignDetailsModal.jsx";
import CustomCampaignBuilder from "./CustomCampaignBuilder.jsx";
import {
  generateSmartCampaignRecommendations,
  generateMarketingCopy,
} from "../../utils/campaignEngine.js";
import { useToast } from "../../contexts/ToastContext.jsx";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const FILTERS = [
  { id: "all", label: "الكل" },
  { id: "clearance", label: "تصفية راكد" },
  { id: "bundle", label: "حزم ذكية" },
  { id: "volume", label: "عروض كميات" },
  { id: "flash", label: "خصم خاطف" },
];

const STORAGE_KEY = "salla_active_campaigns";

export default function SmartCampaignHub({
  products = [],
  currency = "ر.س",
  onUpdateProduct,
}) {
  const titleId = useId();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("suggestions"); // 'suggestions' | 'custom' | 'saved'
  const [filterType, setFilterType] = useState("all");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isApplyingMap, setIsApplyingMap] = useState({});

  // Active/saved campaigns from localStorage
  const [savedCampaigns, setSavedCampaigns] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCampaigns));
    } catch {
      // ignore
    }
  }, [savedCampaigns]);

  // Generate recommendations from products
  const recommendations = useMemo(() => {
    return generateSmartCampaignRecommendations(products);
  }, [products]);

  // High-level metrics
  const totalIdleUnlockable = useMemo(() => {
    return recommendations
      .filter((r) => r.type === "clearance" && r.unlockedCapital)
      .reduce((sum, r) => sum + r.unlockedCapital, 0);
  }, [recommendations]);

  const filteredRecommendations = useMemo(() => {
    if (filterType === "all") return recommendations;
    return recommendations.filter((r) => r.type === filterType);
  }, [recommendations, filterType]);

  const resolvedCurrency =
    currency || products.find((p) => p.currency)?.currency || "ر.س";

  // Actions
  const handleViewDetails = (campaign) => {
    setSelectedCampaign(campaign);
    setIsModalOpen(true);
  };

  const handleQuickCopy = (campaign) => {
    const copies = generateMarketingCopy(campaign, resolvedCurrency);
    navigator.clipboard.writeText(copies.whatsapp);
    showToast("تم نسخ النص الإعلاني (لواتساب) بنجاح!", "success");
  };

  const handleApplyToStore = async (campaign) => {
    const targetProduct = campaign.targetProduct || campaign.products?.[0];
    if (!targetProduct || !onUpdateProduct) return;

    setIsApplyingMap((prev) => ({ ...prev, [campaign.id]: true }));
    try {
      const result = await onUpdateProduct(targetProduct.id, {
        price: campaign.discountedPrice,
      });

      if (result && result.success) {
        showToast(
          `تم تحديث سعر "${targetProduct.name}" إلى ${campaign.discountedPrice} ${resolvedCurrency} في المتجر مباشرة!`,
          "success",
        );
      } else {
        showToast(
          result?.error || "تعذر تحديث السعر، تحقق من الصلاحيات",
          "danger",
        );
      }
    } catch (err) {
      showToast(err.message || "حدث خطأ أثناء التحديث", "danger");
    } finally {
      setIsApplyingMap((prev) => ({ ...prev, [campaign.id]: false }));
    }
  };

  const handleSaveToActive = (campaign) => {
    setSavedCampaigns((prev) => {
      const exists = prev.some((c) => c.id === campaign.id);
      if (exists) {
        showToast("تمت إزالة العرض من القائمة المحفوظة", "default");
        return prev.filter((c) => c.id !== campaign.id);
      } else {
        showToast("تم حفظ العرض في قائمة العروض النشطة بنجاح!", "success");
        return [...prev, campaign];
      }
    });
  };

  const handleSaveCustomCampaign = (newCampaign) => {
    setSavedCampaigns((prev) => [newCampaign, ...prev]);
    setActiveTab("saved");
    showToast("تم إنشاء وحفظ العرض المخصص بنجاح!", "success");
  };

  const isCurrentCampaignSaved = (campaignId) => {
    return savedCampaigns.some((c) => c.id === campaignId);
  };

  return (
    <section className="panel smart-campaign-panel" aria-labelledby={titleId}>
      {/* Panel Header */}
      <div className="store-stats-header campaign-hub-header">
        <div className="store-stats-header-info">
          <div className="store-stats-title-wrap">
            <div className="stats-icon-badge campaign-gradient-badge">
              <Icon name="sparkles" size={20} />
            </div>
            <div>
              <h2 id={titleId} className="panel-title store-stats-title">
                مركز العروض والحملات الذكية
              </h2>
              <span className="panel-subtitle">
                اقتراحات مدعومة بالذكاء لتصفية المخزون الراكد، إنشاء حزم التوفير (Bundles)، ومضاعفة المبيعات
              </span>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="store-stats-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "suggestions"}
            className={`stats-tab-btn ${activeTab === "suggestions" ? "active" : ""}`}
            onClick={() => setActiveTab("suggestions")}
          >
            العروض المقترحة ({recommendations.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "custom"}
            className={`stats-tab-btn ${activeTab === "custom" ? "active" : ""}`}
            onClick={() => setActiveTab("custom")}
          >
            إنشاء عرض مخصص +
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "saved"}
            className={`stats-tab-btn ${activeTab === "saved" ? "active" : ""}`}
            onClick={() => setActiveTab("saved")}
          >
            العروض النشطة والمحفوظة ({savedCampaigns.length})
          </button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="campaign-kpi-strip">
        <div className="campaign-kpi-tile">
          <span className="kpi-tile-icon">
            <Icon name="sparkles" size={16} />
          </span>
          <div className="kpi-tile-text">
            <span className="kpi-tile-num">{recommendations.length}</span>
            <span className="kpi-tile-desc">فرص عروض ذكية مكتشفة</span>
          </div>
        </div>

        {totalIdleUnlockable > 0 && (
          <div className="campaign-kpi-tile highlight">
            <span className="kpi-tile-icon">
              <Icon name="money" size={16} />
            </span>
            <div className="kpi-tile-text">
              <span className="kpi-tile-num">
                {numberFormat.format(totalIdleUnlockable)}{" "}
                <small>{resolvedCurrency}</small>
              </span>
              <span className="kpi-tile-desc">سيولة يمكن تحريرها من الراكد</span>
            </div>
          </div>
        )}

        <div className="campaign-kpi-tile">
          <span className="kpi-tile-icon">
            <Icon name="discount" size={16} />
          </span>
          <div className="kpi-tile-text">
            <span className="kpi-tile-num">{savedCampaigns.length}</span>
            <span className="kpi-tile-desc">عروض مجهزة ونشطة</span>
          </div>
        </div>
      </div>

      {/* BODY CONTENT BY TAB */}
      <div className="campaign-body-content">
        {/* TAB 1: SMART SUGGESTIONS */}
        {activeTab === "suggestions" && (
          <div>
            {/* Filter Pills */}
            <div className="segmented campaign-filter-bar">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`segmented-button ${filterType === f.id ? "is-active" : ""}`}
                  onClick={() => setFilterType(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredRecommendations.length === 0 ? (
              <div className="campaign-empty-box">
                <Icon name="checklist" size={32} />
                <p>لا توجد مقترحات عروض تحت هذا التصنيف حالياً.</p>
              </div>
            ) : (
              <div className="campaigns-grid">
                {filteredRecommendations.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    currency={resolvedCurrency}
                    onViewDetails={handleViewDetails}
                    onQuickCopy={handleQuickCopy}
                    onApplyToStore={handleApplyToStore}
                    isApplying={Boolean(isApplyingMap[campaign.id])}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CUSTOM BUILDER */}
        {activeTab === "custom" && (
          <CustomCampaignBuilder
            products={products}
            currency={resolvedCurrency}
            onSaveCampaign={handleSaveCustomCampaign}
            onCancel={() => setActiveTab("suggestions")}
          />
        )}

        {/* TAB 3: SAVED & ACTIVE CAMPAIGNS */}
        {activeTab === "saved" && (
          <div>
            {savedCampaigns.length === 0 ? (
              <div className="campaign-empty-box">
                <Icon name="tag" size={32} />
                <h4>لا توجد عروض محفوظة حتى الآن</h4>
                <p>
                  يمكنك حفظ أي عرض من المقترحات الذكية أو إنشاء عرض مخصص ومتابعة
                  تنفيذه هنا.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setActiveTab("custom")}
                >
                  إنشاء أول عرض الآن
                </Button>
              </div>
            ) : (
              <div className="campaigns-grid">
                {savedCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    currency={resolvedCurrency}
                    onViewDetails={handleViewDetails}
                    onQuickCopy={handleQuickCopy}
                    onApplyToStore={handleApplyToStore}
                    isApplying={Boolean(isApplyingMap[campaign.id])}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details & Live Preview Modal */}
      {selectedCampaign && (
        <CampaignDetailsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          campaign={selectedCampaign}
          currency={resolvedCurrency}
          onApplyToStore={handleApplyToStore}
          isApplying={Boolean(isApplyingMap[selectedCampaign.id])}
          onSaveToActive={handleSaveToActive}
          isSaved={isCurrentCampaignSaved(selectedCampaign.id)}
          showToast={showToast}
        />
      )}
    </section>
  );
}
