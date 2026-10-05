import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  { id: "strict", label: "صارم" },
  { id: "balanced", label: "متوازن" },
  { id: "relaxed", label: "متساهل" },
];

const LEVEL_TABS = [
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
  "العميل الموثوق يخفض التقييم، والدفع المسبق يخفضه كثيراً",
];

const COLUMNS = 6;

/**
 * Risky orders: scores cash-on-delivery orders before they ship, and shows why
 * each one is risky and what to do about it (call, WhatsApp, confirm).
 */
export default function RiskyOrders({ token, currency = "SAR", onShowToast }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [sensitivity, setSensitivity] = useState("balanced");
  const [levelFilter, setLevelFilter] = useState("all");
  const [onlyNotShipped, setOnlyNotShipped] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(() => loadConfirmed());
  const [openId, setOpenId] = useState(null);

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
    () =>
      orders
        .filter((order) => (!onlyNotShipped || order.isNotShipped) && matchesSearch(order, query))
        .map((order) => ({ ...order, level: levelFor(order.score, thresholds) })),
    [orders, onlyNotShipped, query, thresholds],
  );

  // Orders the merchant already confirmed no longer need attention
  const summary = useMemo(() => summarize(scope.filter((o) => !confirmed.has(o.id)), thresholds), [scope, confirmed, thresholds]);

  const counts = useMemo(
    () => ({
      all: scope.length,
      [LEVELS.HIGH]: scope.filter((o) => o.level === LEVELS.HIGH).length,
      [LEVELS.MEDIUM]: scope.filter((o) => o.level === LEVELS.MEDIUM).length,
      [LEVELS.LOW]: scope.filter((o) => o.level === LEVELS.LOW).length,
    }),
    [scope],
  );

  const visible = useMemo(() => {
    const filtered = levelFilter === "all" ? scope : scope.filter((o) => o.level === levelFilter);
    // Confirmed orders sink to the bottom; the rest stay riskiest first
    return [...filtered].sort((a, b) => Number(confirmed.has(a.id)) - Number(confirmed.has(b.id)) || b.score - a.score);
  }, [scope, levelFilter, confirmed]);

  const toggleConfirmed = (order) => {
    const wasConfirmed = confirmed.has(order.id);
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      saveConfirmed(next);
      return next;
    });
    if (!wasConfirmed) onShowToast?.(`تم تسجيل تأكيد الطلب #${order.referenceId}`, "success");
  };

  const stats = state.data?.stats;
  const cities = state.data?.cityStats ?? [];

  return (
    <div className="risk-root">
      <div className="panel risk-panel">
        <div className="panel-header risk-header">
          <div>
            <span className="panel-title">كاشف الطلبات الخطرة</span>
            <span className="panel-subtitle">راجع طلبات الدفع عند الاستلام المشبوهة قبل شحنها</span>
          </div>
          <button type="button" className="risk-link-btn" onClick={load} disabled={state.status === "loading"}>
            <Icon name="refresh" size={14} />
            <span>{state.status === "loading" ? "جاري التحليل..." : "تحديث"}</span>
          </button>
        </div>

        {state.status === "error" && (
          <div className="risk-state risk-state-error" role="alert">
            <Icon name="alert" size={20} />
            <p>{state.error}</p>
            <button type="button" className="risk-link-btn" onClick={load}>
              إعادة المحاولة
            </button>
          </div>
        )}

        {state.status === "loading" && !state.data && (
          <div className="risk-state" aria-busy="true">
            <Icon name="refresh" size={20} />
            <p>جاري تحليل طلباتك الأخيرة...</p>
          </div>
        )}

        {state.data && (
          <>
            <div className="risk-stats">
              <Stat dot="high" label="تحتاج اتصالاً الآن" value={summary.high} sub={`${formatMoney(summary.highAmount, currency)} معرضة للمرتجع`} />
              <Stat dot="medium" label="تحتاج تأكيد واتساب" value={summary.medium} sub={`${formatMoney(summary.mediumAmount, currency)} إجمالي قيمتها`} />
              <Stat label="نسبة الدفع عند الاستلام" value={formatPercent(stats?.codShare)} sub={`${stats?.codOrders ?? 0} من ${stats?.totalOrders ?? 0} طلب`} />
              <Stat
                label="نسبة مرتجعات الدفع عند الاستلام"
                value={formatPercent(stats?.returnRate)}
                sub={stats?.closedCodOrders ? `من ${stats.closedCodOrders} طلب مكتمل` : "لا توجد بيانات كافية بعد"}
              />
            </div>

            {state.data.truncated && (
              <p className="risk-note">
                تم تحليل أحدث {state.data.fetched} طلب فقط، لذا قد تكون إحصاءات العملاء القدامى ناقصة.
              </p>
            )}

            <div className="risk-toolbar">
              <div className="risk-tabs" role="group" aria-label="مستوى الخطر">
                {LEVEL_TABS.map((tab) => (
                  <button key={tab.id} type="button" className={levelFilter === tab.id ? "is-active" : ""} aria-pressed={levelFilter === tab.id} onClick={() => setLevelFilter(tab.id)}>
                    {tab.label}
                    <span className="risk-tab-count">{counts[tab.id]}</span>
                  </button>
                ))}
              </div>

              <div className="risk-tools">
                <input
                  type="search"
                  className="risk-field"
                  placeholder="بحث بالاسم أو الجوال أو رقم الطلب"
                  aria-label="بحث في الطلبات"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label className="risk-select">
                  <span>الحساسية</span>
                  <select className="risk-field" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                    {SENSITIVITY_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="risk-check">
                  <input type="checkbox" checked={onlyNotShipped} onChange={(e) => setOnlyNotShipped(e.target.checked)} />
                  <span>الطلبات التي لم تُشحن فقط</span>
                </label>
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="risk-state">
                <Icon name="checkCircle" size={20} />
                <p>
                  {orders.length === 0
                    ? "لا توجد طلبات في آخر 30 يوماً."
                    : onlyNotShipped && scope.length === 0
                      ? "لا توجد طلبات بانتظار الشحن حالياً. ألغِ فلتر «لم تُشحن» لمراجعة كل الطلبات."
                      : "لا توجد طلبات مطابقة لهذا الفلتر."}
                </p>
              </div>
            ) : (
              <div className="risk-table-wrap">
                <table className="risk-table">
                  <thead>
                    <tr>
                      <th>الطلب</th>
                      <th>العميل</th>
                      <th>المبلغ</th>
                      <th>الخطر</th>
                      <th>أبرز الأسباب</th>
                      <th>
                        <span className="sr-only">إجراءات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        currency={currency}
                        isConfirmed={confirmed.has(order.id)}
                        isOpen={openId === order.id}
                        onToggleOpen={() => setOpenId((id) => (id === order.id ? null : order.id))}
                        onToggleConfirmed={() => toggleConfirmed(order)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {cities.length > 0 && (
              <section className="risk-cities" aria-label="المدن الأعلى مرتجعات">
                <h4 className="risk-section-title">المدن الأعلى في المرتجعات والإلغاء</h4>
                <ul>
                  {cities.map((c) => (
                    <li key={c.city}>
                      <span className="risk-city-name">{c.city}</span>
                      <span className="risk-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, Math.round(c.rate * 100))}%` }} data-high={c.rate >= 0.4 ? "true" : "false"} />
                      </span>
                      <span className="risk-city-rate">
                        {formatPercent(c.rate)} <small>(<bdi>{c.closed}</bdi> طلب)</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <details className="risk-how">
              <summary>كيف يُحسب التقييم؟</summary>
              <p>كل طلب يُقارن بتاريخ متجرك نفسه (آخر {state.data.windowDays} يوماً)، وتُجمع نقاط من الإشارات التالية:</p>
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

function Stat({ dot, label, value, sub }) {
  return (
    <div className="risk-stat">
      <span className="risk-stat-label">
        {dot && <i className={`risk-dot risk-dot-${dot}`} aria-hidden="true" />}
        {label}
      </span>
      <strong className="risk-stat-value">{value}</strong>
      <span className="risk-stat-sub">{sub}</span>
    </div>
  );
}

function OrderRow({ order, currency, isConfirmed, isOpen, onToggleOpen, onToggleConfirmed }) {
  const meta = LEVEL_META[order.level];
  const whatsapp = buildWhatsAppUrl(order);
  const tel = buildTelUrl(order);
  const reasons = order.reasons.filter((r) => r.points !== 0);
  const products = order.items.map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join("، ");

  return (
    <Fragment>
      <tr className={`risk-row${isConfirmed ? " is-confirmed" : ""}`} data-level={order.level}>
        <td>
          <span className="risk-cell-main">#{order.referenceId}</span>
          <span className="risk-cell-sub">{timeAgo(order.createdAt)}</span>
        </td>
        <td>
          <span className="risk-cell-main">{order.customerName || "عميل"}</span>
          <span className="risk-cell-sub">{[order.city, !order.isCod && "مدفوع مسبقاً"].filter(Boolean).join(" · ")}</span>
        </td>
        <td>
          <span className="risk-cell-main">{formatMoney(order.total, order.currency || currency)}</span>
          <span className="risk-cell-sub risk-cell-products" title={products}>
            {products}
          </span>
        </td>
        <td>
          <span className={`risk-badge risk-badge-${meta.tone}`} aria-label={`درجة الخطر ${order.score} من 100`}>
            <i className="risk-dot" aria-hidden="true" />
            {meta.short}
            <b dir="ltr">{order.score}</b>
          </span>
          {isConfirmed && (
            <span className="risk-cell-sub risk-confirmed-note">
              <Icon name="checkCircle" size={12} /> تم التأكيد
            </span>
          )}
        </td>
        <td>
          {reasons.length === 0 ? (
            <span className="risk-cell-sub">لا توجد إشارات مقلقة</span>
          ) : (
            <>
              <span className="risk-cell-main risk-reason-first">{reasons[0].label}</span>
              {reasons.length > 1 && (
                <button type="button" className="risk-link-btn" onClick={onToggleOpen} aria-expanded={isOpen}>
                  {isOpen ? "إخفاء" : `عرض كل الأسباب (${reasons.length})`}
                </button>
              )}
            </>
          )}
        </td>
        <td>
          <div className="risk-actions">
            {tel ? (
              <a className="risk-icon-btn" href={tel} aria-label="اتصال" title="اتصال بالعميل">
                <Icon name="call" size={16} />
              </a>
            ) : (
              <span className="risk-icon-btn is-disabled" aria-hidden="true">
                <Icon name="call" size={16} />
              </span>
            )}
            {whatsapp ? (
              <a className="risk-icon-btn" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="واتساب" title="مراسلة واتساب برسالة تأكيد جاهزة">
                <Icon name="whatsapp" size={16} />
              </a>
            ) : (
              <span className="risk-icon-btn is-disabled" aria-hidden="true">
                <Icon name="whatsapp" size={16} />
              </span>
            )}
            <button
              type="button"
              className={`risk-icon-btn${isConfirmed ? " is-on" : ""}`}
              onClick={onToggleConfirmed}
              aria-pressed={isConfirmed}
              aria-label={isConfirmed ? "إلغاء التأكيد" : "تم التأكيد"}
              title={isConfirmed ? "إلغاء التأكيد" : "تسجيل أن الطلب تم تأكيده"}
            >
              <Icon name="checkCircle" size={16} />
            </button>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr className="risk-detail">
          <td colSpan={COLUMNS}>
            <ul className="risk-detail-reasons">
              {reasons.map((r) => (
                <li key={r.code + r.label}>
                  <span>{r.label}</span>
                  <b dir="ltr" className={r.points < 0 ? "is-good" : ""}>
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </b>
                </li>
              ))}
            </ul>
            <p className="risk-advice">
              <Icon name="target" size={14} /> {ACTIONS[order.level]}
            </p>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
