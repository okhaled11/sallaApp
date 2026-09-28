import { useEffect, useId, useState } from "react";

/**
 * Settings card with an on/off switch. Fields are dimmed when disabled.
 */
export default function IncentiveCard({
  title,
  description,
  enabled,
  onToggle,
  children,
}) {
  const switchId = useId();

  return (
    <section
      className={`panel incentive-card ${enabled ? "" : "incentive-card-off"}`}
      aria-labelledby={`${switchId}-title`}
    >
      <div className="incentive-card-header">
        <div>
          <h3 id={`${switchId}-title`} className="panel-title">
            {title}
          </h3>
          <p className="panel-subtitle">{description}</p>
        </div>
        <label className="switch" htmlFor={switchId}>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={`Enable ${title}`}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      <fieldset className="incentive-card-body" disabled={!enabled}>
        {children}
      </fieldset>
    </section>
  );
}

/**
 * Number input that only commits valid values (>= min) to settings,
 * while still letting the merchant type freely.
 */
export function NumberField({ label, value, min = 1, suffix, onCommit, hint }) {
  const [draft, setDraft] = useState(String(value));
  const id = useId();

  // Follow outside changes (e.g. "Reset settings")
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const numeric = Number(draft);
  const invalid =
    draft.trim() === "" || !Number.isFinite(numeric) || numeric < min;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={draft}
          aria-invalid={invalid}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            const n = Number(next);
            if (next.trim() !== "" && Number.isFinite(n) && n >= min) {
              onCommit(n);
            }
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      {invalid ? (
        <p className="field-error" role="alert">
          Enter a number of at least {min}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}
