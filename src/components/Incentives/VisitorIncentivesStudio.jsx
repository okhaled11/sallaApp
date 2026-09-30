import { useState, useEffect, useMemo, useCallback } from "react";
import Icon from "../Icon.jsx";
import StorefrontModalPreview from "./StorefrontModalPreview.jsx";
import IncentiveRulesManager from "./IncentiveRulesManager.jsx";
import {
  DEFAULT_INCENTIVE_CONFIG,
  loadSavedIncentiveConfig,
  saveIncentiveConfig,
  generateMockFrequentVisitors,
  generateStorefrontTrackingScript,
  checkVisitorEligibility,
  getRealStoredVisitors,
  saveRealStoredVisitors,
  recordRealVisitorSession,
  clearRealStoredVisitors,
} from "../../utils/visitorIncentives.js";

/**
 * VisitorIncentivesStudio:
 * Detects frequent store visitors who haven't purchased and provides
 * a fully customizable storefront discount modal when they visit 3 times in close intervals.
 */
export default function VisitorIncentivesStudio({
  products = [],
  currency = "SAR",
  initialVisitors,
  storeId,
  onShowToast,
}) {
  const [activeSubTab, setActiveSubTab] = useState("visitors"); // visitors | customizer | preview | script
  const [config, setConfig] = useState(() => loadSavedIncentiveConfig());
  const [activeStoreId, setActiveStoreId] = useState(() => {
    if (storeId) return String(storeId);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("_salla_active_store_id");
      if (saved) return saved;
      const sallaStore = window.salla?.config?.get?.("store.id");
      if (sallaStore) return String(sallaStore);
    }
    return "apptest";
  });

  useEffect(() => {
    if (storeId && String(storeId) !== String(activeStoreId)) {
      setActiveStoreId(String(storeId));
    }
  }, [storeId, activeStoreId]);

  const [scriptFormat, setScriptFormat] = useState("pureJs"); // pureJs | htmlTag
  const [visitors, setVisitors] = useState(() => {
    if (initialVisitors !== undefined) return initialVisitors;
    const real = getRealStoredVisitors();
    return real;
  });
  const [filterType, setFilterType] = useState("all"); // all | qualified | watching | converted | online
  const [searchQuery, setSearchQuery] = useState("");
  const [simulationStep, setSimulationStep] = useState(0); // 0 = idle, 1, 2, 3 = show modal
  const [isSimulating, setIsSimulating] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Update visitors eligibility based on current config
  const qualifiedCount = useMemo(() => {
    return visitors.filter((v) => checkVisitorEligibility(v, config)).length;
  }, [visitors, config]);

  const convertedCount = useMemo(() => {
    return visitors.filter((v) => v.status === "converted").length;
  }, [visitors]);

  const onlineCount = useMemo(() => {
    return visitors.filter((v) => Boolean(v.isOnline)).length;
  }, [visitors]);

  const filteredVisitors = useMemo(() => {
    return visitors.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.city.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === "online") {
        return Boolean(v.isOnline);
      }
      if (filterType === "qualified") {
        return checkVisitorEligibility(v, config);
      }
      if (filterType === "converted") {
        return v.status === "converted";
      }
      if (filterType === "watching") {
        return v.visitCount < config.minVisits && v.purchasesCount === 0;
      }
      return true;
    });
  }, [visitors, filterType, searchQuery, config]);

  // Real-time synchronization: Ably Presence + LocalStorage Sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. LocalStorage poll & cross-tab sync
    const syncFromStorage = () => {
      const real = getRealStoredVisitors();
      if (real && real.length > 0) {
        setVisitors((prev) => {
          const map = new Map(prev.map((v) => [v.id, v]));
          let changed = false;
          real.forEach((r) => {
            const ex = map.get(r.id);
            if (
              !ex ||
              ex.visitCount !== r.visitCount ||
              ex.isOnline !== r.isOnline ||
              ex.status !== r.status
            ) {
              map.set(r.id, { ...ex, ...r });
              changed = true;
            }
          });
          return changed ? Array.from(map.values()) : prev;
        });
      }
    };

    syncFromStorage();
    const pollTimer = setInterval(syncFromStorage, 2500);
    window.addEventListener("storage", syncFromStorage);

    // 2. Ably Realtime Presence connection
    let isMounted = true;
    let realtimeInstance = null;

    async function setupPresence() {
      try {
        if (!window.Ably) {
          if (
            (typeof process !== "undefined" &&
              process.env?.NODE_ENV === "test") ||
            import.meta.env?.MODE === "test"
          ) {
            return;
          }
          const s = document.createElement("script");
          s.src = config.ablyCdn || "https://cdn.ably.com/lib/ably.min-2.js";
          document.head.appendChild(s);
          await new Promise((res) => {
            s.onload = res;
            s.onerror = res;
            setTimeout(res, 3000);
          });
        }

        if (!window.Ably || !isMounted) return;

        realtimeInstance = new window.Ably.Realtime({
          authCallback: (_tokenParams, callback) => {
            fetch(config.tokenEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storeId: activeStoreId,
                clientId: "dashboard-" + Math.random().toString(36).slice(2),
                tokenParams: _tokenParams || {},
              }),
            })
              .then((res) => res.json())
              .then((t) => callback(null, t))
              .catch((err) => callback(err, null));
          },
        });

        const channel = realtimeInstance.channels.get(
          `presence:store:${activeStoreId}`,
        );

        const updateVisitorFromPresence = (member, isOnline) => {
          if (!isMounted) return;
          const cId = member.data?.clientId || member.clientId;
          if (!cId || cId.startsWith("dashboard-")) return;

          const vCount = member.data?.visitCount || 1;
          const path = member.data?.pathname || "/";
          const pName = member.data?.productId
            ? `منتج #${member.data.productId}`
            : "واجهة المتجر";

          setVisitors((prev) => {
            const idx = prev.findIndex((v) => v.id === cId);
            let updatedList;
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                visitCount: Math.max(updated[idx].visitCount, vCount),
                isOnline,
                lastVisitedAgo: isOnline ? `متصل الآن (${path})` : "منذ قليل",
                status:
                  vCount >= (config.minVisits || 3)
                    ? "qualified"
                    : updated[idx].status,
              };
              updatedList = updated;
            } else if (isOnline) {
              updatedList = [
                {
                  id: cId,
                  name: `زائر متجر سلة (#${cId.slice(-4)})`,
                  visitorType: "guest",
                  city: "متصفح حقيقي",
                  device: "جوال / متصفح",
                  visitCount: vCount,
                  isOnline: true,
                  visitTimestamps: [Date.now()],
                  purchasesCount: 0,
                  cartItemsCount: 0,
                  cartValue: 0,
                  viewedProducts: [pName],
                  status:
                    vCount >= (config.minVisits || 3)
                      ? "qualified"
                      : "watching",
                  lastVisitedAgo: `متصل الآن (${path})`,
                  timeSpanText: `${vCount} زيارات خلال وقت متقارب`,
                },
                ...prev,
              ];
            } else {
              return prev;
            }
            saveRealStoredVisitors(updatedList);
            return updatedList;
          });
        };

        const handlePresenceList = (members) => {
          if (!isMounted || !members) return;
          members.forEach((m) => updateVisitorFromPresence(m, true));
        };

        try {
          const getRes = channel.presence.get((err, members) => {
            if (!err && members) handlePresenceList(members);
          });
          if (getRes && typeof getRes.then === "function") {
            getRes.then(handlePresenceList).catch(() => {});
          }
        } catch {
          // ignore
        }

        channel.presence.subscribe("enter", (m) =>
          updateVisitorFromPresence(m, true),
        );
        channel.presence.subscribe("update", (m) =>
          updateVisitorFromPresence(m, true),
        );
        channel.presence.subscribe("leave", (m) =>
          updateVisitorFromPresence(m, false),
        );
      } catch {
        // Fallback gracefully if offline
      }
    }

    setupPresence();

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      window.removeEventListener("storage", syncFromStorage);
      try {
        realtimeInstance?.close();
      } catch {}
    };
  }, [
    config.enabled,
    config.tokenEndpoint,
    config.ablyCdn,
    config.minVisits,
    activeStoreId,
  ]);

  // Form field updater
  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // Save current config to storage and notify
  const handleSaveConfig = () => {
    saveIncentiveConfig(config);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("salla-incentive-config-updated", { detail: config }),
        );
      } catch {
        // ignore
      }
    }
    onShowToast?.(
      "تم حفظ إعدادات التصميم والنصوص وتحديث واجهة المتجر بنجاح! ستظهر التعديلات فوراً للزوار. ✓",
      "success",
    );
  };

  // Reset to default Salla template
  const handleResetDefaults = () => {
    setConfig(DEFAULT_INCENTIVE_CONFIG);
    saveIncentiveConfig(DEFAULT_INCENTIVE_CONFIG);
    onShowToast?.(
      "تمت استعادة إعدادات التصميم والنصوص الافتراضية لمنصة سلة ↺",
      "info",
    );
  };

  // Trigger instant manual discount for a visitor from the list
  const handleOfferDirectDiscount = (visitor) => {
    setVisitors((prev) =>
      prev.map((v) =>
        v.id === visitor.id
          ? {
              ...v,
              status: "offered",
              timeSpanText: `${v.visitCount} زيارات - تم إرسال كود ${config.couponCode} فوراً!`,
            }
          : v,
      ),
    );
    onShowToast?.(
      `تم إرسال كود الخصم (${config.couponCode}) إلى ${visitor.name}`,
      "success",
    );
  };

  // Copy tracking script to clipboard
  const handleCopyScript = () => {
    const script = generateStorefrontTrackingScript(
      config,
      activeStoreId,
      scriptFormat === "htmlTag",
    );
    navigator.clipboard?.writeText?.(script);
    setScriptCopied(true);
    onShowToast?.("تم نسخ كود التتبع لواجهة المتجر بنجاح", "success");
    setTimeout(() => setScriptCopied(false), 2500);
  };

  // Clear tracked visitors log
  const handleClearVisitors = () => {
    clearRealStoredVisitors();
    setVisitors([]);
    onShowToast?.("تم مسح سجل الزيارات بنجاح", "info");
  };

  // Seed sample data for testing purposes
  const handleSeedSampleVisitors = () => {
    const sample = generateMockFrequentVisitors(products);
    setVisitors(sample);
    onShowToast?.("تم تحميل عينة زيارات تجريبية للاختبار", "success");
  };

  // Run 3-visits simulation sequence and record real session
  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    setSimulationStep(1);

    const simId = "vis_storefront_live";
    const simProduct = products[0]?.name || "عطر مميز من متجرك";

    // Visit 1: First visit
    const updated1 = recordRealVisitorSession({
      id: simId,
      name: "متصفح متجر سلة (جلسة حالية)",
      visitorType: "guest",
      city: "متصفح حقيقي",
      device:
        typeof navigator !== "undefined" &&
        /Mobile|Android|iPhone/i.test(navigator.userAgent)
          ? "جوال (سلة)"
          : "متصفح ويب",
      viewedProducts: [simProduct],
      cartItemsCount: 0,
      cartValue: 0,
      status: "watching",
    });
    setVisitors(updated1);

    setTimeout(() => {
      setSimulationStep(2);
      // Visit 2: Return visit
      const updated2 = recordRealVisitorSession({
        id: simId,
        name: "متصفح متجر سلة (جلسة حالية)",
        viewedProducts: [simProduct, products[1]?.name || "ساعة أنيقة"],
        cartItemsCount: 1,
        cartValue: 185,
        status: "watching",
      });
      setVisitors(updated2);

      setTimeout(() => {
        setSimulationStep(3); // 3rd visit triggers modal!
        const updated3 = recordRealVisitorSession({
          id: simId,
          name: "متصفح متجر سلة (جلسة حالية)",
          status: "qualified",
          viewedProducts: [simProduct, products[1]?.name || "ساعة أنيقة"],
          cartItemsCount: 1,
          cartValue: 185,
        });
        setVisitors(updated3);
        setIsSimulating(false);
      }, 1500);
    }, 1500);
  }, [products]);

  const resetSimulation = () => {
    setSimulationStep(0);
    setIsSimulating(false);
  };

  return (
    <div className="visitor-incentives-view">
      {/* Top Hero Overview Banner */}
      <div className="incentives-hero-card">
        <div className="incentives-hero-content">
          <div className="incentives-hero-badge">
            <Icon name="sparkles" size={16} />
            <span>نظام استعادة وتحفيز الزوار المتكررين في متجر سلة</span>
          </div>
          <h2 className="incentives-hero-title">
            <Icon name="target" size={20} className="inline-icon-prefix" />
            <span>تحويل الزوار المترددين إلى مشترين حقيقيين</span>
          </h2>
          <p className="incentives-hero-desc">
            رصد تلقائي للعملاء الذين يترددون على متجرك ({config.minVisits} مرات
            في وقت متقارب) دون إتمام الشراء، مع إطلاق نافذة منبثقة مخصصة تمنحهم
            كود خصم حصري لتشجيعهم على الشراء فوراً.
          </p>
        </div>

        {/* Global Campaign Toggle */}
        <div className="incentives-hero-toggle-card">
          <div className="toggle-info-row">
            <span className="toggle-label">حالة النافذة في المتجر:</span>
            <span
              className={`toggle-status-badge ${
                config.enabled ? "active" : "inactive"
              }`}
            >
              {config.enabled ? "مفعلة وتعمل بالمتجر" : "معطلة مؤقتاً"}
            </span>
          </div>
          <button
            type="button"
            className={`btn-toggle-campaign ${config.enabled ? "on" : "off"}`}
            onClick={() => handleConfigChange("enabled", !config.enabled)}
            aria-pressed={config.enabled}
          >
            {config.enabled ? "تعطيل الحملة" : "تفعيل الحملة الآن"}
          </button>

          {/* Store Channel Connection Bar */}
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              background: "rgba(0, 77, 91, 0.25)",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(115, 252, 215, 0.2)",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#00b259",
                display: "inline-block",
                boxShadow: "0 0 6px #00b259",
              }}
            />
            <span>قناة الربط الحي:</span>
            <input
              type="text"
              value={activeStoreId}
              onChange={(e) => {
                const val = e.target.value.trim();
                setActiveStoreId(val);
                if (typeof window !== "undefined") {
                  localStorage.setItem("_salla_active_store_id", val);
                }
              }}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(115, 252, 215, 0.4)",
                color: "#ffffff",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
                width: "100px",
                textAlign: "center",
                direction: "ltr",
              }}
              title="معرف متجرك في قناة Ably Presence"
            />
          </div>
        </div>
      </div>

      {/* KPI Counters Bar - Salla Metric Cards Grid */}
      <div className="incentives-kpi-grid salla-dashboard-grid">
        {/* KPI 1: Frequent Visitors */}
        <div className="stats-kpi-card salla-metric-card kpi-mini-card">
          <div className="salla-card-header">
            <div className="salla-card-title-group">
              <span className="salla-metric-title kpi-mini-lbl">إجمالي الزوار المتكررين</span>
              <span className="salla-tooltip-trigger" title="عملاء تصفحوا المتجر عدة مرات دون إتمام طلب">?</span>
            </div>
            <button type="button" className="salla-card-refresh-btn" title="تحديث السجل" onClick={() => window.dispatchEvent(new Event("storage"))}>
              <Icon name="refresh" size={13} />
            </button>
          </div>

          <div className="salla-metric-value-row">
            <span className="salla-big-number kpi-mini-val">{visitors.length}</span>
            <span className="salla-metric-badge salla-badge-good">
              {visitors.filter((v) => v.isOnline).length > 0
                ? `${visitors.filter((v) => v.isOnline).length} متصل الآن`
                : "▲ نشط بالمتجر"}
            </span>
          </div>

          <div className="salla-metric-progress-track">
            <div
              className="salla-metric-progress-fill"
              style={{ width: `${Math.min(100, Math.max(15, visitors.length * 10))}%` }}
            />
          </div>

          <div className="salla-card-footer">
            <span className="salla-metric-subtext">
              تم رصد <strong>{visitors.length}</strong> جلسة تصفح متكررة
            </span>
            <button
              type="button"
              className="salla-card-action-pill"
              onClick={() => setActiveSubTab("visitors")}
            >
              عرض الزوار
            </button>
          </div>
        </div>

        {/* KPI 2: Qualified for Discount */}
        <div className="stats-kpi-card salla-metric-card kpi-mini-card">
          <div className="salla-card-header">
            <div className="salla-card-title-group">
              <span className="salla-metric-title kpi-mini-lbl">
                مؤهلون للخصم ({config.minVisits}+ زيارات دون شراء)
              </span>
              <span className="salla-tooltip-trigger" title="زوار حققوا شرط عدد الزيارات ومؤهلون لإطلاق الخصم">?</span>
            </div>
            <button type="button" className="salla-card-refresh-btn" title="تحديث البيانات">
              <Icon name="refresh" size={13} />
            </button>
          </div>

          <div className="salla-metric-value-row">
            <span className="salla-big-number kpi-mini-val">{qualifiedCount}</span>
            <span className="salla-metric-badge salla-badge-good">▲ فرصة بيع</span>
          </div>

          <div className="salla-metric-progress-track">
            <div
              className="salla-metric-progress-fill"
              style={{
                width: `${visitors.length > 0 ? (qualifiedCount / visitors.length) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="salla-card-footer">
            <span className="salla-metric-subtext">
              جاهزون لإطلاق النافذة المنبثقة
            </span>
            <button
              type="button"
              className="salla-card-action-pill"
              onClick={() => setActiveSubTab("customizer")}
            >
              شروط الخصم
            </button>
          </div>
        </div>

        {/* KPI 3: Converted */}
        <div className="stats-kpi-card salla-metric-card kpi-mini-card">
          <div className="salla-card-header">
            <div className="salla-card-title-group">
              <span className="salla-metric-title kpi-mini-lbl">أتموا الشراء بعد الخصم</span>
              <span className="salla-tooltip-trigger" title="زوار تحولوا إلى مشترين حقيقيين بعد رؤية الخصم">?</span>
            </div>
            <button type="button" className="salla-card-refresh-btn" title="تحديث البيانات">
              <Icon name="refresh" size={13} />
            </button>
          </div>

          <div className="salla-metric-value-row">
            <span className="salla-big-number kpi-mini-val">{convertedCount}</span>
            <span className="salla-metric-badge salla-badge-good">
              {qualifiedCount > 0
                ? `${Math.round((convertedCount / Math.max(1, qualifiedCount)) * 100)}% تحويل`
                : "▲ مبيعات مستعادة"}
            </span>
          </div>

          <div className="salla-metric-progress-track">
            <div
              className="salla-metric-progress-fill"
              style={{
                width: `${qualifiedCount > 0 ? (convertedCount / qualifiedCount) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="salla-card-footer">
            <span className="salla-metric-subtext">
              طلبات تم إنقاذها بنجاح
            </span>
            <button
              type="button"
              className="salla-card-action-pill"
              onClick={() => setActiveSubTab("preview")}
            >
              المعاينة الحية
            </button>
          </div>
        </div>

        {/* KPI 4: Active Code */}
        <div className="stats-kpi-card salla-metric-card kpi-mini-card">
          <div className="salla-card-header">
            <div className="salla-card-title-group">
              <span className="salla-metric-title kpi-mini-lbl">الكود النشط للزوار</span>
              <span className="salla-tooltip-trigger" title="كود الخصم ونسبة التخفيض المفعّلة حالياً">?</span>
            </div>
            <button type="button" className="salla-card-refresh-btn" title="تحديث الكود">
              <Icon name="refresh" size={13} />
            </button>
          </div>

          <div className="salla-metric-value-row">
            <span className="salla-big-number kpi-mini-val" style={{ fontSize: "28px" }}>
              {config.couponCode} ({config.discountValue}%)
            </span>
            <span className="salla-metric-badge salla-badge-neutral">
              {config.enabled ? "يعمل بالمتجر" : "معطل"}
            </span>
          </div>

          <div className="salla-metric-progress-track">
            <div
              className="salla-metric-progress-fill"
              style={{ width: `${Math.min(100, config.discountValue * 2)}%` }}
            />
          </div>

          <div className="salla-card-footer">
            <span className="salla-metric-subtext">
              خصم <strong>{config.discountValue}%</strong> للمترددين
            </span>
            <button
              type="button"
              className="salla-card-action-pill secondary"
              onClick={() => setActiveSubTab("rules")}
            >
              قواعد التحفيز
            </button>
          </div>
        </div>
      </div>

      {/* Studio Sub-Navigation Tabs */}
      <div className="studio-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "visitors"}
          className={`studio-tab-btn ${
            activeSubTab === "visitors" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("visitors")}
        >
          <Icon name="view" size={16} />
          <span>سجل الزوار المترددين ({visitors.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "customizer"}
          className={`studio-tab-btn ${
            activeSubTab === "customizer" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("customizer")}
        >
          <Icon name="fileEdit" size={16} />
          <span>شروط الزيارات وتخصيص المودال</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "preview"}
          className={`studio-tab-btn ${
            activeSubTab === "preview" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("preview")}
        >
          <Icon name="sparkles" size={16} />
          <span>المعاينة الحية ومحاكاة الدخول</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "rules"}
          className={`studio-tab-btn ${
            activeSubTab === "rules" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("rules")}
        >
          <Icon name="flash" size={16} />
          <span>قواعد التحفيز المتعددة</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "script"}
          className={`studio-tab-btn ${
            activeSubTab === "script" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("script")}
        >
          <Icon name="copy" size={16} />
          <span>كود التثبيت في متجر سلة</span>
        </button>
      </div>

      {/* SUB-TAB 1: Visitors Intelligence Table */}
      {activeSubTab === "visitors" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                من هم الزوار الذين يترددون على متجرك دون شراء؟
              </span>
              <span className="panel-subtitle">
                قائمة مفصلة بسلوك الزوار، عدد مرات تكرار الزيارة، وسلات
                المشتريات المتروكة
              </span>
            </div>

            {/* Filter buttons */}
            <div className="visitors-filter-group">
              <input
                type="text"
                placeholder="بحث بالاسم أو المدينة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-visitor-search"
              />

              <button
                type="button"
                className={`filter-btn ${
                  filterType === "online" ? "active" : ""
                }`}
                onClick={() => setFilterType("online")}
              >
                <span className="pulse-dot-inline" />
                متصل الآن ({onlineCount})
              </button>
              <button
                type="button"
                className={`filter-btn ${filterType === "all" ? "active" : ""}`}
                onClick={() => setFilterType("all")}
              >
                الكل ({visitors.length})
              </button>
              <button
                type="button"
                className={`filter-btn ${
                  filterType === "qualified" ? "active" : ""
                }`}
                onClick={() => setFilterType("qualified")}
              >
                مؤهلون للخصم ({qualifiedCount})
              </button>
              <button
                type="button"
                className={`filter-btn ${
                  filterType === "converted" ? "active" : ""
                }`}
                onClick={() => setFilterType("converted")}
              >
                تم الشراء ({convertedCount})
              </button>

              {visitors.length > 0 && (
                <button
                  type="button"
                  className="filter-btn btn-clear-log"
                  onClick={handleClearVisitors}
                  title="مسح جميع الزيارات المسجلة"
                >
                  <Icon name="trash" size={14} />
                  <span>مسح السجل</span>
                </button>
              )}
            </div>
          </div>

          {/* Ably Realtime Active Channel Banner */}
          <div className="realtime-channel-bar">
            <div className="channel-info-left">
              <span className="channel-live-beacon" />
              <span className="channel-title">
                قناة التواجد اللحظي في المتجر:
              </span>
              <code className="channel-code">
                presence:store:{activeStoreId}
              </code>
              <span className="channel-badge-connected">
                <span className="pulse-dot-inline" />
                <span>متصل عبر Ably Realtime</span>
              </span>
            </div>
            <div className="channel-info-right">
              <span className="channel-online-summary">
                <strong>{onlineCount}</strong> زوار يتصفحون المتجر في هذه اللحظة
              </span>
            </div>
          </div>

          {filteredVisitors.length === 0 ? (
            <div className="visitors-empty-state">
              <div className="empty-state-beacon">
                <Icon name="sparkles" size={26} />
              </div>
              <h3 className="empty-state-title">
                {visitors.length === 0
                  ? "لا توجد زيارات مسجلة بعد في متجرك"
                  : "لا توجد نتائج تطابق خيارات البحث"}
              </h3>
              <p className="empty-state-desc">
                {visitors.length === 0
                  ? "النظام بانتظار رصد زيارات المتجر الحقيقية عبر كود التتبع وقنوات التواجد اللحظي. يمكنك تشغيل المحاكاة الآن لرؤية طريقة عمل النافذة أو نسخ كود التثبيت لمتجرك بسلة."
                  : "جرب تغيير مصطلح البحث أو اختيار فلتر آخر لعرض الزوار."}
              </p>
              {visitors.length === 0 && (
                <div className="empty-state-actions">
                  <button
                    type="button"
                    className="btn-run-simulation"
                    onClick={() => {
                      setActiveSubTab("preview");
                      startSimulation();
                    }}
                  >
                    <Icon name="flash" size={16} />
                    <span>تشغيل محاكاة الزيارات والخصم</span>
                  </button>
                  <button
                    type="button"
                    className="btn-copy-script"
                    onClick={() => setActiveSubTab("script")}
                  >
                    <Icon name="code" size={16} />
                    <span>كود تثبيت الإضافة بالمتجر</span>
                  </button>
                  <button
                    type="button"
                    className="btn-seed-sample"
                    onClick={handleSeedSampleVisitors}
                  >
                    <Icon name="refresh" size={16} />
                    <span>تجربة بيانات توضيحية</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="doc-table visitors-table">
                <thead>
                  <tr>
                    <th>الزائر / العميل</th>
                    <th>عدد الزيارات</th>
                    <th>الفارق الزمني والنشاط</th>
                    <th>المنتجات المشاهدة</th>
                    <th>قيمة السلة</th>
                    <th>حالة العرض</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisitors.map((visitor) => {
                    const isQualified = checkVisitorEligibility(
                      visitor,
                      config,
                    );

                    return (
                      <tr
                        key={visitor.id}
                        className={isQualified ? "row-qualified" : ""}
                      >
                        <td>
                          <div className="visitor-identity-cell">
                            <div className="visitor-title-line">
                              <span className="visitor-name">
                                {visitor.name}
                              </span>
                              {visitor.isOnline && (
                                <span
                                  className="online-presence-indicator"
                                  title="يتصفح المتجر حالياً"
                                >
                                  <span className="pulse-dot-green" />
                                  متصل الآن
                                </span>
                              )}
                            </div>
                            <span className="visitor-sub-info">
                              {visitor.city} • {visitor.device}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="visit-counter-pill">
                            <span className="count-number">
                              {visitor.visitCount}
                            </span>
                            <span className="count-text">مرات</span>
                          </div>
                        </td>

                        <td>
                          <div className="activity-cell">
                            <span className="activity-desc">
                              {visitor.timeSpanText}
                            </span>
                            <span className="activity-ago">
                              آخر نشاط: {visitor.lastVisitedAgo}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="viewed-products-list">
                            {visitor.viewedProducts.map((pName, idx) => (
                              <span key={idx} className="viewed-tag">
                                {pName}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td>
                          {visitor.cartValue > 0 ? (
                            <span className="cart-val-tag">
                              {visitor.cartValue} {currency} (
                              {visitor.cartItemsCount} عناصر)
                            </span>
                          ) : (
                            <span className="cart-empty-tag">تصفح فقط</span>
                          )}
                        </td>

                        <td>
                          {visitor.status === "converted" ? (
                            <span className="visitor-status-tag converted">
                              <Icon name="checkCircle" size={13} />
                              <span>اشترى بعد العرض</span>
                            </span>
                          ) : visitor.status === "offered" ? (
                            <span className="visitor-status-tag offered">
                              <Icon name="file" size={13} />
                              <span>تم عرض المودال</span>
                            </span>
                          ) : isQualified ? (
                            <span className="visitor-status-tag qualified">
                              <Icon name="target" size={13} />
                              <span>مؤهل لخصم الـ {config.minVisits} زيارات</span>
                            </span>
                          ) : (
                            <span className="visitor-status-tag watching">
                              <Icon name="clock" size={13} />
                              <span>بانتظار الزيارة الثالثة</span>
                            </span>
                          )}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="btn-trigger-action"
                            onClick={() => handleOfferDirectDiscount(visitor)}
                            disabled={visitor.status === "converted"}
                            title="عرض النافذة فوراً للزائر وتطبيق الخصم"
                          >
                            {visitor.status === "converted" ? (
                              <span>مكتمل</span>
                            ) : (
                              <>
                                <Icon name="gift" size={13} />
                                <span>تفعيل الخصم</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: Rules Builder & Modal Customizer */}
      {activeSubTab === "customizer" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                قواعد التشغيل وتخصيص النافذة المنبثقة (Modal Customizer)
              </span>
              <span className="panel-subtitle">
                تحكم في شروط الاستهداف وكافة نصوص وألوان كود الخصم في متجرك
              </span>
            </div>
            <div className="customizer-header-actions">
              <button
                type="button"
                className="btn-save-settings"
                onClick={handleSaveConfig}
                title="حفظ التعديلات ونشرها لواجهة المتجر فوراً"
              >
                <Icon name="checkCircle" size={16} />
                <span>حفظ التعديلات وتحديث المتجر</span>
              </button>
              <button
                type="button"
                className="btn-reset-settings"
                onClick={handleResetDefaults}
                title="استعادة النصوص والألوان الأصلية"
              >
                <Icon name="refresh" size={15} />
                <span>استعادة الافتراضي</span>
              </button>
            </div>
          </div>

          <div className="customizer-workspace">
            {/* Form Column */}
            <div className="customizer-form-column">
              {/* Card 1: Modal Texts & Copy */}
              <div className="form-section-card">
                <h4 className="section-card-title">
                  1. تخصيص محتوى ونصوص النافذة (Modal Texts)
                </h4>
                <p className="section-card-desc">
                  اكتب العنوان والنصوص المقنعة التي تظهر للزائر داخل النافذة
                  التشجيعية.
                </p>

                <div className="form-field-group">
                  <label htmlFor="headlineInput" className="form-label">
                    عنوان النافذة (العنوان الجذاب):
                  </label>
                  <input
                    id="headlineInput"
                    type="text"
                    value={config.headline}
                    onChange={(e) =>
                      handleConfigChange("headline", e.target.value)
                    }
                    className="form-input"
                    placeholder="سعداء بزيارتك المتكررة..."
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="messageInput" className="form-label">
                    نص الرسالة التشجيعية:
                  </label>
                  <textarea
                    id="messageInput"
                    rows="3"
                    value={config.message}
                    onChange={(e) =>
                      handleConfigChange("message", e.target.value)
                    }
                    className="form-textarea"
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="captionInput" className="form-label">
                    النص التوضيحي فوق كود الخصم:
                  </label>
                  <input
                    id="captionInput"
                    type="text"
                    value={config.couponCaption ?? "كود الخصم الحصري لك:"}
                    onChange={(e) =>
                      handleConfigChange("couponCaption", e.target.value)
                    }
                    className="form-input"
                    placeholder="كود الخصم الحصري لك:"
                  />
                </div>

                <div className="form-row-dual">
                  <div className="form-field-group">
                    <label htmlFor="couponInput" className="form-label">
                      كود الخصم في متجر سلة:
                    </label>
                    <input
                      id="couponInput"
                      type="text"
                      value={config.couponCode}
                      onChange={(e) =>
                        handleConfigChange(
                          "couponCode",
                          e.target.value.toUpperCase(),
                        )
                      }
                      className="form-input font-mono"
                      placeholder="SPECIAL3X"
                    />
                  </div>

                  <div className="form-field-group">
                    <label htmlFor="discountValInput" className="form-label">
                      نسبة الخصم (%):
                    </label>
                    <input
                      id="discountValInput"
                      type="number"
                      min="5"
                      max="90"
                      value={config.discountValue}
                      onChange={(e) =>
                        handleConfigChange(
                          "discountValue",
                          parseInt(e.target.value, 10) || 15,
                        )
                      }
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-row-dual">
                  <div className="form-field-group">
                    <label htmlFor="ctaInput" className="form-label">
                      نص زر الشراء وتطبيق الخصم (CTA):
                    </label>
                    <input
                      id="ctaInput"
                      type="text"
                      value={config.ctaText}
                      onChange={(e) =>
                        handleConfigChange("ctaText", e.target.value)
                      }
                      className="form-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label htmlFor="dismissInput" className="form-label">
                      نص زر التخطي والإغلاق:
                    </label>
                    <input
                      id="dismissInput"
                      type="text"
                      value={config.dismissText ?? "متابعة التصفح"}
                      onChange={(e) =>
                        handleConfigChange("dismissText", e.target.value)
                      }
                      className="form-input"
                      placeholder="متابعة التصفح"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Visual Appearance & Colors */}
              <div className="form-section-card">
                <h4 className="section-card-title">
                  2. مظهر وألوان الـ Snippet (Colors & Theme)
                </h4>
                <p className="section-card-desc">
                  خصص ألوان النافذة لتتوافق تماماً مع هوية متجرك وعلامتك
                  التجارية.
                </p>

                {/* Primary Color */}
                <div className="color-picker-group">
                  <label htmlFor="primaryColorPicker" className="form-label">
                    اللون الأساسي للنافذة والزر الرئيسي (Primary Color):
                  </label>
                  <div className="color-input-row">
                    <input
                      id="primaryColorPicker"
                      type="color"
                      value={config.primaryColor || "#004d5b"}
                      onChange={(e) =>
                        handleConfigChange("primaryColor", e.target.value)
                      }
                      className="color-swatch-input"
                      title="اختر اللون الأساسي"
                    />
                    <input
                      type="text"
                      value={config.primaryColor || "#004d5b"}
                      onChange={(e) =>
                        handleConfigChange("primaryColor", e.target.value)
                      }
                      className="form-input font-mono"
                      style={{ width: "130px" }}
                      placeholder="#004d5b"
                    />
                  </div>

                  {/* Preset chips for primary color */}
                  <div className="palette-presets">
                    {[
                      { name: "سلة الأصلي", color: "#004d5b" },
                      { name: "بنفسجي فاخر", color: "#3b1a54" },
                      { name: "أزرق ملكي", color: "#0f3b75" },
                      { name: "كحلي ليلي", color: "#111827" },
                      { name: "أخضر زمردي", color: "#064e3b" },
                      { name: "عنابي أنيق", color: "#831843" },
                    ].map((preset) => (
                      <button
                        key={preset.color}
                        type="button"
                        className="palette-chip"
                        onClick={() =>
                          handleConfigChange("primaryColor", preset.color)
                        }
                      >
                        <span
                          className="palette-chip-circle"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color */}
                <div className="color-picker-group">
                  <label htmlFor="accentColorPicker" className="form-label">
                    لون التمييز والأيقونة والحدود (Accent Color):
                  </label>
                  <div className="color-input-row">
                    <input
                      id="accentColorPicker"
                      type="color"
                      value={config.accentColor || "#73fcd7"}
                      onChange={(e) =>
                        handleConfigChange("accentColor", e.target.value)
                      }
                      className="color-swatch-input"
                      title="اختر لون التمييز"
                    />
                    <input
                      type="text"
                      value={config.accentColor || "#73fcd7"}
                      onChange={(e) =>
                        handleConfigChange("accentColor", e.target.value)
                      }
                      className="form-input font-mono"
                      style={{ width: "130px" }}
                      placeholder="#73fcd7"
                    />
                  </div>

                  {/* Preset chips for accent color */}
                  <div className="palette-presets">
                    {[
                      { name: "مينت سلة", color: "#73fcd7" },
                      { name: "ذهبي لامع", color: "#f59e0b" },
                      { name: "وردي نيون", color: "#f472b6" },
                      { name: "سماوي مبهج", color: "#38bdf8" },
                      { name: "أخضر فسفوري", color: "#4ade80" },
                      { name: "برتقالي جذاب", color: "#fb923c" },
                    ].map((preset) => (
                      <button
                        key={preset.color}
                        type="button"
                        className="palette-chip"
                        onClick={() =>
                          handleConfigChange("accentColor", preset.color)
                        }
                      >
                        <span
                          className="palette-chip-circle"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emoji Selector */}
                <div className="form-field-group">
                  <label className="form-label">
                    أيقونة العرض والهدية (Hugeicons):
                  </label>
                  <div className="emoji-picker-grid">
                    {[
                      { name: "gift", label: "هدية" },
                      { name: "sparkles", label: "بريق" },
                      { name: "tag", label: "كود خصم" },
                      { name: "flash", label: "عرض سريع" },
                      { name: "bag", label: "حقيبة تسوق" },
                      { name: "star", label: "نجمة مميزة" },
                      { name: "coins", label: "مكافأة" },
                      { name: "percent", label: "نسبة خصم" },
                    ].map((iconItem) => (
                      <button
                        key={iconItem.name}
                        type="button"
                        className={`emoji-btn ${
                          (config.giftIcon || "gift") === iconItem.name
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          handleConfigChange("giftIcon", iconItem.name)
                        }
                        title={iconItem.label}
                        aria-label={iconItem.label}
                      >
                        <Icon name={iconItem.name} size={22} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Countdown Option */}
                <div className="form-field-group">
                  <label
                    className="form-label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(config.showCountdown)}
                      onChange={(e) =>
                        handleConfigChange("showCountdown", e.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>
                      تفعيل العداد التنازلي لإثارة الحماس وسرعة الشراء (FOMO
                      Timer)
                    </span>
                  </label>

                  {config.showCountdown && (
                    <div
                      className="input-number-wrap"
                      style={{ marginTop: "6px" }}
                    >
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={config.countdownMinutes || 15}
                        onChange={(e) =>
                          handleConfigChange(
                            "countdownMinutes",
                            parseInt(e.target.value, 10) || 15,
                          )
                        }
                        className="form-input"
                        style={{ width: 80 }}
                      />
                      <span className="input-unit">دقائق حتى ينتهي الخصم</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Frequency & Connection Rules */}
              <div className="form-section-card">
                <h4 className="section-card-title">
                  3. قواعد الاستهداف والربط اللحظي
                </h4>
                <p className="section-card-desc">
                  حدد متى تنبثق النافذة للزائر تلقائياً وقناة التواجد اللحظي.
                </p>

                <div className="form-field-group">
                  <label htmlFor="minVisitsInput" className="form-label">
                    عدد مرات الدخول المطلوبة لإظهار الخصم:
                  </label>
                  <div className="input-number-wrap">
                    <input
                      id="minVisitsInput"
                      type="number"
                      min="2"
                      max="10"
                      value={config.minVisits}
                      onChange={(e) =>
                        handleConfigChange(
                          "minVisits",
                          parseInt(e.target.value, 10) || 3,
                        )
                      }
                      className="form-input"
                    />
                    <span className="input-unit">زيارات في وقت متقارب</span>
                  </div>
                </div>

                <div className="form-field-group">
                  <label htmlFor="timeWindowInput" className="form-label">
                    الإطار الزمني لتقارب الزيارات:
                  </label>
                  <select
                    id="timeWindowInput"
                    value={config.timeWindowMinutes}
                    onChange={(e) =>
                      handleConfigChange(
                        "timeWindowMinutes",
                        parseInt(e.target.value, 10),
                      )
                    }
                    className="form-select"
                  >
                    <option value={15}>خلال 15 دقيقة (تقارب سريع جداً)</option>
                    <option value={30}>خلال 30 دقيقة (جلسة تصفح واحدة)</option>
                    <option value={60}>خلال ساعة واحدة (موصى به)</option>
                    <option value={180}>خلال 3 ساعات</option>
                    <option value={1440}>خلال 24 ساعة (نفس اليوم)</option>
                  </select>
                </div>

                <div className="rule-badge-note">
                  <Icon name="checkCircle" size={16} />
                  <span>
                    الشرط الحالي: إذا دخل الزائر {config.minVisits} مرات خلال{" "}
                    {config.timeWindowMinutes} دقيقة ولم يسبق له الشراء، تنبثق
                    النافذة فوراً.
                  </span>
                </div>

                <div className="form-field-group" style={{ marginTop: "8px" }}>
                  <label htmlFor="tokenEndpointInput" className="form-label">
                    نقطة التوثيق الآمن لقناة التواجد (Token Endpoint):
                  </label>
                  <input
                    id="tokenEndpointInput"
                    type="url"
                    value={config.tokenEndpoint}
                    onChange={(e) =>
                      handleConfigChange("tokenEndpoint", e.target.value)
                    }
                    className="form-input font-mono"
                  />
                  <span className="form-hint">
                    يستخدم السكربت هذا الرابط لتوليد مفتاح اتصال مشفر بـ Ably
                  </span>
                </div>
              </div>
            </div>

            {/* Preview Column: Sticky Live Preview */}
            <div className="customizer-preview-column">
              <div className="live-preview-box">
                <span className="live-preview-badge">
                  <Icon name="sparkles" size={13} />
                  معاينة حية ومباشرة (Live Preview)
                </span>

                <StorefrontModalPreview
                  config={config}
                  onClose={() =>
                    onShowToast?.("تمت تجربة إغلاق النافذة بنجاح", "info")
                  }
                  onApplyDiscount={(code) =>
                    onShowToast?.(
                      `تم تجربة نسخ الكود (${code}) بنجاح`,
                      "success",
                    )
                  }
                />

                <span className="live-preview-hint">
                  <Icon name="sparkles" size={13} />
                  <span>
                    تتغير ألوان ونصوص المعاينة فوراً في الوقت الحقيقي أثناء
                    قيامك بالتعديل. انقر على &quot;حفظ التعديلات وتحديث
                    المتجر&quot; لتطبيقها على واجهة المتجر فوراً.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Live Preview & 3-Visits Simulation */}
      {activeSubTab === "preview" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                معاينة مباشرة ومحاكاة دخول العميل (Storefront Live Test)
              </span>
              <span className="panel-subtitle">
                جرب بنفسك كيف يرى العميل المتجر وكيف تظهر النافذة التلقائية عند
                الزيارة الثالثة
              </span>
            </div>

            <div className="preview-action-controls">
              <button
                type="button"
                className="btn-run-simulation"
                onClick={startSimulation}
                disabled={isSimulating}
              >
                <Icon name="flash" size={16} />
                <span>
                  {isSimulating
                    ? "جارٍ تشغيل محاكاة الزيارات..."
                    : "بدء محاكاة دخول زائر 3 مرات"}
                </span>
              </button>

              {simulationStep > 0 && (
                <button
                  type="button"
                  className="btn-reset-simulation"
                  onClick={resetSimulation}
                >
                  إعادة تعيين المحاكاة
                </button>
              )}
            </div>
          </div>

          {/* Simulation Status Steps Indicator */}
          {simulationStep > 0 && (
            <div className="simulation-stepper-box">
              <div className="stepper-title">حالة محاكاة الزائر في المتجر:</div>
              <div className="stepper-track">
                <div
                  className={`step-item ${simulationStep >= 1 ? "done" : ""}`}
                >
                  <span className="step-num">1</span>
                  <span className="step-txt">
                    الزيارة الأولى: تصفح الصفحة الرئيسية
                  </span>
                </div>
                <div className="step-divider" />
                <div
                  className={`step-item ${simulationStep >= 2 ? "done" : ""}`}
                >
                  <span className="step-num">2</span>
                  <span className="step-txt">
                    الزيارة الثانية: العودة بعد 3 دقائق ومقارنة المنتجات
                  </span>
                </div>
                <div className="step-divider" />
                <div
                  className={`step-item ${
                    simulationStep >= 3 ? "active-trigger" : ""
                  }`}
                >
                  <span className="step-num">3</span>
                  <span className="step-txt">
                    الزيارة الثالثة (الآن): تحقق الشرط وانبثاق المودال!
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Storefront Mockup Frame */}
          <div className="storefront-mockup-frame">
            <div className="storefront-browser-bar">
              <div className="browser-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="browser-address">
                https://store.salla.sa/products
              </div>
            </div>

            {/* Embedded Storefront Preview Viewport */}
            <div className="storefront-viewport">
              {/* Background Mock Storefront Content */}
              <div className="mock-store-content">
                <div className="mock-nav">
                  <div className="mock-logo">متجرنا الرسمي</div>
                  <div className="mock-links">الرئيسية • المنتجات • العروض</div>
                </div>

                <div className="mock-products-grid">
                  {(products.slice(0, 3).length > 0
                    ? products.slice(0, 3)
                    : [
                        { id: 1, name: "عطر فاخر", price: 290 },
                        { id: 2, name: "ساعة أنيقة", price: 450 },
                        { id: 3, name: "حقيبة جلدية", price: 320 },
                      ]
                  ).map((p) => (
                    <div key={p.id} className="mock-product-card">
                      <div className="mock-prod-img" />
                      <div className="mock-prod-name">{p.name}</div>
                      <div className="mock-prod-price">
                        {p.price || 199} {currency}
                      </div>
                      <button type="button" className="mock-add-cart">
                        إضافة للسلة
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* The Interactive Pop-up Modal */}
              <StorefrontModalPreview
                config={config}
                isLiveSimulation={simulationStep === 3}
                onApplyDiscount={(code) => {
                  onShowToast?.(
                    `تم تطبيق كود الخصم (${code}) بنجاح!`,
                    "success",
                  );
                }}
                onClose={() => setSimulationStep(0)}
              />
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3.5: Multi-Rule Incentive Studio */}
      {activeSubTab === "rules" && (
        <div className="panel studio-panel" style={{ padding: 0, background: "transparent", border: "none" }}>
          <IncentiveRulesManager
            products={products}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* SUB-TAB 4: Storefront Twilight Script Code */}
      {activeSubTab === "script" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                كود تثبيت الإضافة في واجهة متجر سلة (Twilight Integration)
              </span>
              <span className="panel-subtitle">
                انسخ هذا الكود وضعه في إعدادات متجرك بسلة ليعمل التتبع وظهور
                النافذة تلقائياً
              </span>
            </div>

            <button
              type="button"
              className="btn-copy-script"
              onClick={handleCopyScript}
            >
              <Icon name="copy" size={16} />
              <span>
                {scriptCopied ? "تم النسخ بنجاح! ✓" : "نسخ كود التتبع"}
              </span>
            </button>
          </div>

          <div className="script-instructions-box">
            <h4 className="instructions-title">
              طريقة التفعيل في تطبيق مقتطفات الرموز (Code Snippets):
            </h4>
            <ol className="instructions-steps">
              <li>
                افتح تطبيق <strong>مقتطفات الرموز (Code Snippets)</strong> في
                متجرك بسلة.
              </li>
              <li>
                اختر <strong>JavaScript</strong>، والصق الكود أدناه مباشرة{" "}
                <em>(بدون أي وسوم script أو أخطاء صياغة)</em>.
              </li>
              <li>
                اضغط <strong>تحديث المعاينة</strong> ثم <strong>حفظ</strong>.
                افتح متجرك في تبويب جديد وستظهر جلستك فوراً في لوحة التحكم تحت{" "}
                <strong>متصل الآن</strong>!
              </li>
            </ol>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "14px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: "bold" }}>
                صيغة الكود:
              </span>
              <button
                type="button"
                className={`filter-btn ${
                  scriptFormat === "pureJs" ? "active" : ""
                }`}
                onClick={() => setScriptFormat("pureJs")}
              >
                <Icon name="star" size={14} />
                <span>JavaScript مباشر (لتطبيق مقتطفات الرموز)</span>
              </button>
              <button
                type="button"
                className={`filter-btn ${
                  scriptFormat === "htmlTag" ? "active" : ""
                }`}
                onClick={() => setScriptFormat("htmlTag")}
              >
                <Icon name="code" size={14} />
                <span>كامل مع وسم &lt;script&gt; (للقوالب)</span>
              </button>
            </div>
          </div>

          <div className="code-block-container">
            <pre className="code-snippet-box">
              <code>
                {generateStorefrontTrackingScript(
                  config,
                  activeStoreId,
                  scriptFormat === "htmlTag",
                )}
              </code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
