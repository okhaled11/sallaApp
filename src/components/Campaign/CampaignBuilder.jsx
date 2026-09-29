import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "../forms/Button.jsx";
import Icon from "../Icon.jsx";
import CampaignPreview from "./CampaignPreview.jsx";
import {
  MAX_PRODUCTS,
  createDraft,
  draftFromSnapshot,
  rankCandidates,
  suggestProductIds,
  toPreviewCampaign,
} from "../../utils/campaignDraft.js";
import { validateCampaign } from "../../../shared/campaign.js";
import { STOREFRONT_SCRIPT_PATH } from "../../utils/constants.js";

const HOUR_MS = 60 * 60 * 1000;
const DURATION_PRESETS = [
  { label: "24 hours", ms: 24 * HOUR_MS },
  { label: "3 days", ms: 72 * HOUR_MS },
  { label: "7 days", ms: 168 * HOUR_MS },
];
const FREQUENCY_OPTIONS = [
  { value: "session", label: "Once per visit" },
  { value: "day", label: "Once a day" },
  { value: "always", label: "Every page" },
];

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

// <input type="datetime-local"> works in local time without a timezone
function toLocalInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Use the dashboard's native confirm dialog inside Salla (design guidelines),
 * the browser's outside (local development).
 */
async function confirmAction(embedded, options) {
  const inIframe = window.parent !== window;
  if (inIframe && embedded?.ui?.confirm) {
    try {
      const result = await embedded.ui.confirm(options);
      return Boolean(result?.confirmed);
    } catch {
      return false;
    }
  }
  return window.confirm(`${options.title}\n\n${options.message}`);
}

function Segmented({ label, name, value, options, onChange }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="choice-group" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <label key={option.value} className="choice">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CampaignStatus({ campaign }) {
  if (!campaign) {
    return <span className="status-pill status-pill-draft">Not published</span>;
  }
  const live =
    campaign.enabled && new Date(campaign.endsAt).getTime() > Date.now();
  if (live) {
    return (
      <span className="status-pill status-pill-live">
        Live until {dateFormat.format(new Date(campaign.endsAt))}
      </span>
    );
  }
  return (
    <span className="status-pill status-pill-draft">
      {campaign.enabled ? "Ended" : "Stopped"}
    </span>
  );
}

/**
 * Promo popup builder: pick unsold products, a discount and a countdown,
 * customize the popup, preview it, and publish it to the store.
 */
export default function CampaignBuilder({
  products,
  campaign,
  isLoading,
  isSaving,
  error,
  onPublish,
  onStop,
  embedded,
}) {
  const ids = useId();
  const [draft, setDraft] = useState(() => createDraft());
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const initializedFor = useRef(undefined);

  // Start from the published campaign, or suggest the idle products
  useEffect(() => {
    if (isLoading) return;
    const key = campaign?.updatedAt ?? null;
    if (initializedFor.current === key) return;
    initializedFor.current = key;
    setDraft(
      campaign
        ? draftFromSnapshot(campaign)
        : { ...createDraft(), productIds: suggestProductIds(products) },
    );
  }, [campaign, isLoading, products]);

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateDesign = (patch) =>
    setDraft((prev) => ({ ...prev, design: { ...prev.design, ...patch } }));
  const updateTrigger = (patch) =>
    setDraft((prev) => ({ ...prev, trigger: { ...prev.trigger, ...patch } }));

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rankCandidates(products).filter(
      (p) => !q || p.name.toLowerCase().includes(q),
    );
  }, [products, query]);

  const previewCampaign = useMemo(
    () => toPreviewCampaign(draft, products),
    [draft, products],
  );
  const validation = validateCampaign(draft);
  const isLive =
    campaign?.enabled && new Date(campaign.endsAt).getTime() > Date.now();
  const selectedCount = draft.productIds.length;
  const snippet = `<script src="${window.location.origin}${STOREFRONT_SCRIPT_PATH}" defer></script>`;

  const toggleProduct = (id) =>
    setDraft((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(id)
        ? prev.productIds.filter((x) => x !== id)
        : [...prev.productIds, id],
    }));

  const handlePublish = async () => {
    if (validation.error) return;
    const confirmed = await confirmAction(embedded, {
      title: isLive ? "Update the live popup?" : "Publish the popup?",
      message: `This creates a ${draft.discountPercent}% discount on ${selectedCount} product${selectedCount === 1 ? "" : "s"} in your store until ${dateFormat.format(new Date(draft.endsAt))}, and shows the popup to shoppers.`,
      confirmText: isLive ? "Update" : "Publish",
      variant: "warning",
    });
    if (confirmed) await onPublish(validation.campaign);
  };

  const handleStop = async () => {
    const confirmed = await confirmAction(embedded, {
      title: "Stop the popup?",
      message:
        "Shoppers will stop seeing the popup and the discount will be turned off.",
      confirmText: "Stop",
      variant: "danger",
    });
    if (confirmed) await onStop();
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is selectable */
    }
  };

  return (
    <section className="panel campaign-panel" aria-labelledby={`${ids}-title`}>
      <div className="panel-header">
        <div>
          <h2 id={`${ids}-title`} className="panel-title">
            <Icon name="tag" className="panel-title-icon" />
            Boost unsold products
          </h2>
          <span className="panel-subtitle">
            A popup in your store with a real discount and a countdown
          </span>
        </div>
        <div className="panel-actions">
          <CampaignStatus campaign={campaign} />
        </div>
      </div>

      {isLoading ? (
        <div className="products-state">Loading campaign...</div>
      ) : (
        <div className="campaign-layout">
          <div className="campaign-form">
            {/* 1. Products */}
            <fieldset className="campaign-section">
              <legend>
                Products{" "}
                <span className="campaign-count">
                  {selectedCount}/{MAX_PRODUCTS}
                </span>
              </legend>
              <input
                type="search"
                className="products-search"
                placeholder="Search products"
                aria-label="Search products to promote"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className="campaign-products">
                {candidates.map((product) => {
                  const checked = draft.productIds.includes(product.id);
                  const disabled = !checked && selectedCount >= MAX_PRODUCTS;
                  return (
                    <li key={product.id}>
                      <label
                        className={`campaign-product ${checked ? "is-checked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleProduct(product.id)}
                        />
                        <span className="campaign-product-name">
                          {product.name}
                        </span>
                        {product.soldQuantity === 0 ? (
                          <span className="margin-badge margin-badge-thin">
                            Never sold
                          </span>
                        ) : (
                          <span className="category-item-detail">
                            {product.soldQuantity} sold
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {/* 2. Offer */}
            <fieldset className="campaign-section">
              <legend>Offer</legend>
              <div className="campaign-row">
                <div className="field">
                  <label htmlFor={`${ids}-discount`}>Discount</label>
                  <div className="field-input">
                    <input
                      id={`${ids}-discount`}
                      type="number"
                      min="1"
                      max="90"
                      step="1"
                      inputMode="numeric"
                      value={draft.discountPercent}
                      onChange={(e) =>
                        update({ discountPercent: Number(e.target.value) })
                      }
                    />
                    <span className="field-suffix">%</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`${ids}-ends`}>Countdown ends</label>
                  <input
                    id={`${ids}-ends`}
                    type="datetime-local"
                    value={toLocalInput(draft.endsAt)}
                    onChange={(e) => {
                      const date = new Date(e.target.value);
                      if (!Number.isNaN(date.getTime())) {
                        update({ endsAt: date.toISOString() });
                      }
                    }}
                  />
                </div>
              </div>
              <div className="chip-row">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="chip"
                    onClick={() =>
                      update({
                        endsAt: new Date(Date.now() + preset.ms).toISOString(),
                      })
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* 3. Design */}
            <fieldset className="campaign-section">
              <legend>Design</legend>
              <div className="field">
                <label htmlFor={`${ids}-heading`}>Title</label>
                <input
                  id={`${ids}-heading`}
                  type="text"
                  dir="auto"
                  maxLength={60}
                  value={draft.design.title}
                  onChange={(e) => updateDesign({ title: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`${ids}-message`}>Message</label>
                <textarea
                  id={`${ids}-message`}
                  dir="auto"
                  rows={2}
                  maxLength={140}
                  value={draft.design.message}
                  onChange={(e) => updateDesign({ message: e.target.value })}
                />
              </div>
              <div className="campaign-row">
                <div className="field">
                  <label htmlFor={`${ids}-button`}>Button text</label>
                  <input
                    id={`${ids}-button`}
                    type="text"
                    dir="auto"
                    maxLength={24}
                    value={draft.design.buttonText}
                    onChange={(e) =>
                      updateDesign({ buttonText: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${ids}-color`}>Accent color</label>
                  <div className="field-input">
                    <input
                      id={`${ids}-color`}
                      type="color"
                      className="color-input"
                      value={draft.design.accentColor}
                      onChange={(e) =>
                        updateDesign({ accentColor: e.target.value })
                      }
                    />
                    <code className="field-suffix">
                      {draft.design.accentColor}
                    </code>
                  </div>
                </div>
              </div>
              <div className="campaign-row">
                <Segmented
                  label="Theme"
                  name={`${ids}-theme`}
                  value={draft.design.theme}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                  onChange={(theme) => updateDesign({ theme })}
                />
                <Segmented
                  label="Position"
                  name={`${ids}-position`}
                  value={draft.design.position}
                  options={[
                    { value: "center", label: "Center" },
                    { value: "bottom", label: "Bottom sheet" },
                  ]}
                  onChange={(position) => updateDesign({ position })}
                />
              </div>
            </fieldset>

            {/* 4. When to show */}
            <fieldset className="campaign-section">
              <legend>When to show</legend>
              <div className="campaign-row">
                <div className="field">
                  <label htmlFor={`${ids}-delay`}>Show after</label>
                  <div className="field-input">
                    <input
                      id={`${ids}-delay`}
                      type="number"
                      min="0"
                      max="60"
                      step="1"
                      inputMode="numeric"
                      value={draft.trigger.delaySeconds}
                      onChange={(e) =>
                        updateTrigger({ delaySeconds: Number(e.target.value) })
                      }
                    />
                    <span className="field-suffix">seconds</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`${ids}-frequency`}>How often</label>
                  <select
                    id={`${ids}-frequency`}
                    className="category-limit-select"
                    value={draft.trigger.frequency}
                    onChange={(e) =>
                      updateTrigger({ frequency: e.target.value })
                    }
                  >
                    {FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {(validation.error || error) && (
              <p className="field-error" role="alert">
                {validation.error || error}
              </p>
            )}

            <div className="campaign-actions">
              <Button
                variant="primary"
                onClick={handlePublish}
                disabled={Boolean(validation.error) || isSaving}
              >
                {isSaving
                  ? "Saving..."
                  : isLive
                    ? "Update live popup"
                    : "Publish to store"}
              </Button>
              {isLive && (
                <Button onClick={handleStop} disabled={isSaving}>
                  Stop popup
                </Button>
              )}
            </div>

            <details className="campaign-setup">
              <summary>Store setup (one time)</summary>
              <ol>
                <li>
                  Salla Partners → your app → <strong>App Snippet</strong>: add
                  this code
                  <div className="snippet-box">
                    <code>{snippet}</code>
                    <Button size="small" onClick={copySnippet}>
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </li>
                <li>
                  <strong>App Settings</strong>: add a text field with the key{" "}
                  <code>promo_campaign</code>
                </li>
                <li>
                  <strong>App Scopes</strong>: Special Offers → Read &amp;
                  Write, then reinstall the app
                </li>
              </ol>
            </details>
          </div>

          <div className="campaign-preview-column">
            <CampaignPreview campaign={previewCampaign} />
          </div>
        </div>
      )}
    </section>
  );
}
