import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../Icon.jsx";
import { fetchRiskyOrders } from "../../utils/ordersApi.js";
import { ACTIONS, LEVELS, SENSITIVITY, levelFor, summarize } from "../../../shared/orderRisk.js";
import {
  LEVEL_META,
  buildTelUrl,
  buildWhatsAppUrl,
  formatMoney,
  formatPercent,
  loadConfirmed,
  matchesSearch,
  saveConfirmed,
  timeAgo,
} from "../../utils/riskUi.js";

const SENSITIVITY_OPTIONS = [
  { id: "strict", label: "صارم", hint: "يكشف أكبر عدد من الطلبات المشبوهة" },
  { id: "balanced", label: "متوازن", hint: "الإعداد الموصى به" },
  { id: "relaxed", label: "متساهل", hint: "يُظهر الطلبات الواضحة فقط" },
];

const LEVEL_FILTERS = [
  { id: "all", label: "الكل" },
  { id: LEVELS.HIGH, label: "خطر مرتفع" },
  { id: LEVELS.MEDIUM, label: "خطر متوسط" },
  { id: LEVELS.LOW, label: "خطر منخفض" },
];

const SIGNALS = [
  "عميل جديد بلا طلبات سابقة، أو لم يستلم أي طلب من قبل",
  "مرتجعات أو إلغاءات سابقة من نفس العميل",
  "قيمة الطلب أعلى بكثير من المعتاد في متجرك",
  "كمية كبيرة من منتج واحد",
  "مدينة نسبة مرتجعاتها مرتفعة",
  "عدة طلبات من نفس الرقم خلال 24 ساعة",
  "رقم جوال يبدو غير حقيقي، أو مدينة غير محددة",
  "العميل الموثوق (طلبات سابقة مستلمة) يخفض التقييم، والدفع المسبق يخفضه كثيراً",
];

/**
 * Risky orders: scores cash-on-delivery orders before they ship, shows why each
 * one is risky and what to do about it (call, WhatsApp, confirm).
 */
export default function RiskyOrders({ token, currency = "SAR", onShowToast }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [sensitivity, setSensitivity] = useState("balanced");
  const [levelFilter, setLevelFilter] = useState("all");
  const [onlyNotShipped, setOnlyNotShipped] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(() => loadConfirmed());

  const load = useCallback(async () => {
    if (!token) {
      setState({ status: "error", data: null, error: "افتح التطبيق من لوحة تحكم سلة لتحليل الطلبات." });
      return;
    }
    setState((prev) => ({ ...prev, status: "loading", error: "" }));
    const res = await fetchRiskyOrders(token);
    if (res.success) setState({ status: "ready", data: res.data, error: "" });
    else setState({ status: "error", data: null, error: res.error || "تعذر تحميل الطلبات" });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const thresholds = SENSITIVITY[sensitivity];
  const orders = useMemo(() => state.data?.orders ?? [], [state.data]);

  const scope = useMemo(
    () => orders.filter((order) => (!onlyNotShipped || order.isNotShipped) && matchesSearch(order, query)),
    [orders, onlyNotShipped, query],
  );

  // Orders already confirmed by the merchant no longer need attention
  const summary = useMemo(() => summarize(scope.filter((o) => !confirmed.has(o.id)), thresholds), [scope, confirmed, thresholds]);

  const visible = useMemo(() => {
    const withLevel = scope.map((order) => ({ ...order, level: levelFor(order.score, thresholds) }));
    const filtered = levelFilter === "all" ? withLevel : withLevel.filter((o) => o.level === levelFilter);
    // Confirmed orders sink to the bottom; the rest stay riskiest first
    return [...filtered].sort((a, b) => Number(confirmed.has(a.id)) - Number(confirmed.has(b.id)) || b.score - a.score);
  }, [scope, thresholds, levelFilter, confirmed]);

  const toggleConfirmed = (order) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      saveConfirmed(next);
      return next;
    });
    if (!confirmed.has(order.id)) onShowToast?.(`تم تسجيل تأكيد الطلب #${order.referenceId}`, "success");
  };

  const stats = state.data?.stats;
  const cities = state.data?.cityStats ?? [];

  return (
    <div className="risk-root">
      <div className="panel risk-panel">
        <div className="panel-header risk-header">
          <div>
            <span className="panel-title">كاشف الطلبات الخطرة</span>
            <span className="panel-subtitle">
              اكتشف طلبات الدفع عند الاستلام المشبوهة قبل شحنها، وعرف السبب والإجراء المناسب
            </span>
          </div>
          <button type="button" className="filter-btn" onClick={load} disabled={state.status === "loading"}>
            <Icon name="refresh" size={14} />
            <span>{state.status === "loading" ? "جاري التحليل..." : "تحديث"}</span>
          </button>
        </div>

        {state.status === "error" && (
          <div className="risk-state risk-state-error" role="alert">
            <Icon name="alert" size={22} />
            <p>{state.error}</p>
            <button type="button" className="filter-btn" onClick={load}>
              إعادة المحاولة
            </button>
          </div>
        )}

        {state.status === "loading" && !state.data && (
          <div className="risk-state" aria-busy="true">
            <Icon name="refresh" size={22} />
            <p>جاري تحليل طلباتك الأخيرة...</p>
          </div>
        )}

        {state.data && (
          <>
            <div className="risk-kpis">
              <KpiCard tone="high" title="تحتاج اتصالاً الآن" value={summary.high} sub={`${formatMoney(summary.highAmount, currency)} معرضة للمرتجع`} />
              <KpiCard tone="medium" title="تحتاج تأكيد واتساب" value={summary.medium} sub={`${formatMoney(summary.mediumAmount, currency)} إجمالي قيمتها`} />
              <KpiCard tone="neutral" title="نسبة الدفع عند الاستلام" value={formatPercent(stats?.codShare)} sub={`${stats?.codOrders ?? 0} من ${stats?.totalOrders ?? 0} طلب`} />
              <KpiCard
                tone="neutral"
                title="نسبة مرتجعات COD"
                value={formatPercent(stats?.returnRate)}
                sub={stats?.closedCodOrders ? `من ${stats.closedCodOrders} طلب مكتمل` : "لا توجد بيانات كافية بعد"}
              />
            </div>

            {state.data.truncated && (
              <p className="risk-note">
                تم تحليل أحدث {state.data.fetched} طلب فقط لحجم المتجر الكبير، لذا قد تكون إحصاءات العملاء القدامى ناقصة.
              </p>
            )}

            <div className="risk-controls">
              <div className="risk-filters" role="group" aria-label="مستوى الخطر">
                {LEVEL_FILTERS.map((f) => (
                  <button key={f.id} type="button" className={`filter-btn ${levelFilter === f.id ? "active" : ""}`} onClick={() => setLevelFilter(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="risk-tools">
                <label className="risk-check">
                  <input type="checkbox" checked={onlyNotShipped} onChange={(e) => setOnlyNotShipped(e.target.checked)} />
                  <span>الطلبات التي لم تُشحن فقط</span>
                </label>
                <label className="risk-select">
                  <span>الحساسية</span>
                  <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} title={SENSITIVITY_OPTIONS.find((o) => o.id === sensitivity)?.hint}>
                    {SENSITIVITY_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="search"
                  className="risk-search"
                  placeholder="ابحث بالاسم أو الجوال أو رقم الطلب"
                  aria-label="بحث في الطلبات"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="risk-state">
                <Icon name="checkCircle" size={22} />
                <p>
                  {orders.length === 0
                    ? "لا توجد طلبات في آخر 30 يوماً."
                    : onlyNotShipped && scope.length === 0
                      ? "لا توجد طلبات بانتظار الشحن حالياً. ألغِ فلتر «لم تُشحن» لمراجعة كل الطلبات."
                      : "لا توجد طلبات مطابقة لهذا الفلتر."}
                </p>
              </div>
            ) : (
              <ul className="risk-list">
                {visible.map((order) => (
                  <OrderCard key={order.id} order={order} currency={currency} isConfirmed={confirmed.has(order.id)} onToggleConfirmed={() => toggleConfirmed(order)} />
                ))}
              </ul>
            )}

            {cities.length > 0 && (
              <section className="risk-cities" aria-label="المدن الأعلى مرتجعات">
                <h4 className="risk-section-title">المدن الأعلى في المرتجعات والإلغاء</h4>
                <ul>
                  {cities.map((c) => (
                    <li key={c.city}>
                      <span className="risk-city-name">{c.city}</span>
                      <span className="risk-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, Math.round(c.rate * 100))}%` }} data-tone={c.rate >= 0.4 ? "high" : c.rate >= 0.25 ? "medium" : "low"} />
                      </span>
                      <span className="risk-city-rate">
                        {formatPercent(c.rate)} <small>({c.closed} طلب)</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <details className="risk-how">
              <summary>كيف يُحسب التقييم؟</summary>
              <p>
                كل طلب يُقارن بتاريخ متجرك نفسه (آخر {state.data.windowDays} يوماً)، وتُجمع نقاط من الإشارات التالية:
              </p>
              <ul>
                {SIGNALS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p>
                التقييم من 0 إلى 100. «خطر مرتفع» من {thresholds.high} فأكثر، و«متوسط» من {thresholds.medium}. غيّر الحساسية من القائمة أعلاه.
              </p>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ tone, title, value, sub }) {
  return (
    <div className={`risk-kpi risk-kpi-${tone}`}>
      <span className="risk-kpi-title">{title}</span>
      <strong className="risk-kpi-value">{value}</strong>
      <span className="risk-kpi-sub">{sub}</span>
    </div>
  );
}

function OrderCard({ order, currency, isConfirmed, onToggleConfirmed }) {
  const meta = LEVEL_META[order.level];
  const whatsapp = buildWhatsAppUrl(order);
  const tel = buildTelUrl(order);
  const products = order.items.map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join("، ");

  return (
    <li className={`risk-order risk-order-${meta.tone}${isConfirmed ? " is-confirmed" : ""}`} data-level={order.level}>
      <div className="risk-score" aria-label={`درجة الخطر ${order.score} من 100`}>
        <strong>{order.score}</strong>
        <span>{meta.short}</span>
      </div>

      <div className="risk-order-main">
        <div className="risk-order-top">
          <strong>{order.customerName || "عميل"}</strong>
          <span className="risk-muted">#{order.referenceId}</span>
          {order.city && <span className="risk-muted">{order.city}</span>}
          <span className="risk-muted">{timeAgo(order.createdAt)}</span>
          {!order.isCod && <span className="risk-pill">مدفوع مسبقاً</span>}
          {isConfirmed && <span className="risk-pill risk-pill-ok">تم التأكيد ✓</span>}
        </div>

        <div className="risk-order-meta">
          <span>{formatMoney(order.total, order.currency || currency)}</span>
          <span className="risk-muted" title={products}>{products}</span>
          <span className="risk-muted">{order.statusName}</span>
        </div>

        {order.reasons.length > 0 && order.reasons.some((r) => r.points !== 0) && (
          <ul className="risk-reasons">
            {order.reasons
              .filter((r) => r.points !== 0)
              .map((r) => (
                <li key={r.code + r.label} className={r.points < 0 ? "is-good" : ""}>
                  {r.label}
                  <b>{r.points > 0 ? `+${r.points}` : r.points}</b>
                </li>
              ))}
          </ul>
        )}

        <p className="risk-advice">
          <Icon name="target" size={13} /> {ACTIONS[order.level]}
        </p>
      </div>

      <div className="risk-actions">
        {tel ? (
          <a className="filter-btn" href={tel}>اتصال</a>
        ) : (
          <span className="filter-btn is-disabled">اتصال</span>
        )}
        {whatsapp ? (
          <a className="filter-btn" href={whatsapp} target="_blank" rel="noopener noreferrer">واتساب</a>
        ) : (
          <span className="filter-btn is-disabled">واتساب</span>
        )}
        <button type="button" className={`filter-btn ${isConfirmed ? "active" : ""}`} onClick={onToggleConfirmed} aria-pressed={isConfirmed}>
          {isConfirmed ? "إلغاء التأكيد" : "تم التأكيد"}
        </button>
      </div>
    </li>
  );
}
