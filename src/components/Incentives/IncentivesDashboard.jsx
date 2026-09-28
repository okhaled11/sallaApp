import { useId, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import Button from "../forms/Button.jsx";
import IncentiveCard, { NumberField } from "./IncentiveCard.jsx";
import IncentivePreview from "./IncentivePreview.jsx";
import { DEMO_CART } from "./incentiveDefaults.js";
import { useIncentiveSettings } from "../../hooks/useIncentiveSettings.js";

const HOUR_MS = 60 * 60 * 1000;
const COUNTDOWN_PRESETS = [
  { label: "1 hour", ms: HOUR_MS },
  { label: "24 hours", ms: 24 * HOUR_MS },
  { label: "3 days", ms: 72 * HOUR_MS },
];

// <input type="datetime-local"> works in local time without a timezone
function toLocalInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Cart incentives: live preview + one settings card per incentive.
 * Renders grid items directly so they share the dashboard grid.
 */
export default function IncentivesDashboard({ token = null }) {
  const { settings, updateSection, resetSettings, save, isSaving, isDirty } =
    useIncentiveSettings(token);
  const { freeShipping, countdown, coupon, lowStock } = settings;
  const ids = useId();
  const [saveStatus, setSaveStatus] = useState(null);

  const handleSave = async () => {
    setSaveStatus(null);
    const result = await save();
    setSaveStatus(
      result.success
        ? { type: "success", message: "Saved — live on your product pages" }
        : { type: "error", message: `Could not save: ${result.error}` },
    );
  };

  let saveLabel = "Save changes";
  if (isSaving) saveLabel = "Saving...";
  else if (token && !isDirty) saveLabel = "Saved";

  return (
    <>
      <section
        className="panel grid-preview"
        aria-labelledby={`${ids}-preview`}
      >
        <div className="panel-header">
          <div>
            <h2 id={`${ids}-preview`} className="panel-title">
              Live preview
            </h2>
            <span className="panel-subtitle">
              What customers see in the cart
            </span>
          </div>
          <div className="panel-actions">
            <Button size="small" onClick={resetSettings} title="Reset settings">
              <RotateCcw size={14} />
              Reset
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={handleSave}
              disabled={!token || isSaving || !isDirty}
              title={
                token
                  ? "Show these incentives on your store's product pages"
                  : "Open the app from the Salla dashboard to save"
              }
            >
              <Save size={14} />
              {saveLabel}
            </Button>
          </div>
        </div>
        {saveStatus && !(saveStatus.type === "success" && isDirty) && (
          <p
            className={`save-status save-status-${saveStatus.type}`}
            role={saveStatus.type === "error" ? "alert" : "status"}
          >
            {saveStatus.message}
          </p>
        )}
        <IncentivePreview settings={settings} />
      </section>

      <IncentiveCard
        title="Free shipping bar"
        description="Fills up as the cart grows — the strongest lever for order value."
        enabled={freeShipping.enabled}
        onToggle={(enabled) => updateSection("freeShipping", { enabled })}
      >
        <NumberField
          label="Free shipping from"
          value={freeShipping.threshold}
          suffix={DEMO_CART.currency}
          onCommit={(threshold) => updateSection("freeShipping", { threshold })}
        />
      </IncentiveCard>

      <IncentiveCard
        title="Countdown"
        description="A real deadline, before the offer is gone."
        enabled={countdown.enabled}
        onToggle={(enabled) => updateSection("countdown", { enabled })}
      >
        <div className="field">
          <label htmlFor={`${ids}-ends`}>Offer ends at</label>
          <input
            id={`${ids}-ends`}
            type="datetime-local"
            value={toLocalInput(countdown.endsAt)}
            onChange={(e) => {
              const date = new Date(e.target.value);
              if (!Number.isNaN(date.getTime())) {
                updateSection("countdown", { endsAt: date.toISOString() });
              }
            }}
          />
        </div>
        <div className="chip-row">
          {COUNTDOWN_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() =>
                updateSection("countdown", {
                  endsAt: new Date(Date.now() + preset.ms).toISOString(),
                })
              }
            >
              +{preset.label}
            </button>
          ))}
        </div>
      </IncentiveCard>

      <IncentiveCard
        title="Discount coupon"
        description="Floating or fixed, copied with one tap."
        enabled={coupon.enabled}
        onToggle={(enabled) => updateSection("coupon", { enabled })}
      >
        <div className="field">
          <label htmlFor={`${ids}-code`}>Coupon code</label>
          <input
            id={`${ids}-code`}
            type="text"
            className="field-code"
            value={coupon.code}
            maxLength={30}
            onChange={(e) =>
              updateSection("coupon", {
                code: e.target.value.toUpperCase().replace(/\s+/g, ""),
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-text`}>Message</label>
          <input
            id={`${ids}-text`}
            type="text"
            dir="auto"
            value={coupon.text}
            maxLength={80}
            onChange={(e) => updateSection("coupon", { text: e.target.value })}
          />
        </div>
        <div className="field">
          <span className="field-label" id={`${ids}-display`}>
            Display
          </span>
          <div
            className="segmented"
            role="radiogroup"
            aria-labelledby={`${ids}-display`}
          >
            {[
              { value: "inline", label: "Fixed in cart" },
              { value: "popup", label: "Floating" },
            ].map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name={`${ids}-display`}
                  value={option.value}
                  checked={coupon.display === option.value}
                  onChange={() =>
                    updateSection("coupon", { display: option.value })
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </IncentiveCard>

      <IncentiveCard
        title="Remaining stock"
        description="Real quantity, shown only below a set limit."
        enabled={lowStock.enabled}
        onToggle={(enabled) => updateSection("lowStock", { enabled })}
      >
        <NumberField
          label="Show when stock is at or below"
          value={lowStock.threshold}
          suffix="pcs"
          onCommit={(threshold) => updateSection("lowStock", { threshold })}
          hint={`Preview item has ${DEMO_CART.lowStockItem.stock} left`}
        />
      </IncentiveCard>
    </>
  );
}
