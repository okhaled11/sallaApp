import { useEffect, useRef, useState } from "react";
import { STOREFRONT_SCRIPT_PATH } from "../../utils/constants.js";

let loader = null;

/**
 * Load the real storefront script in preview mode (no auto-boot), so the
 * dashboard preview is exactly what shoppers will see.
 */
export function loadStorefrontRenderer() {
  if (window.SallaPromoCampaign) {
    return Promise.resolve(window.SallaPromoCampaign);
  }
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = STOREFRONT_SCRIPT_PATH;
      script.async = true;
      script.setAttribute("data-mode", "preview");
      script.onload = () => resolve(window.SallaPromoCampaign);
      script.onerror = () => {
        loader = null;
        reject(new Error("Could not load the storefront script"));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Live preview of the storefront popup on a mock store page.
 */
export default function CampaignPreview({ campaign }) {
  const hostRef = useRef(null);
  const [renderer, setRenderer] = useState(
    () => window.SallaPromoCampaign ?? null,
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    if (renderer) return;
    let cancelled = false;
    loadStorefrontRenderer()
      .then((loaded) => !cancelled && setRenderer(loaded))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [renderer]);

  useEffect(() => {
    const host = hostRef.current;
    if (!renderer || !host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const handle = renderer.render(root, campaign, { preview: true });
    return () => handle.destroy();
  }, [renderer, campaign]);

  return (
    <figure className="campaign-preview" aria-label="Storefront popup preview">
      {/* Mock storefront behind the popup */}
      <div className="campaign-preview-store" aria-hidden="true">
        <span className="mock-bar" />
        <span className="mock-hero" />
        <span className="mock-row" />
        <span className="mock-row" />
      </div>
      <div ref={hostRef} className="campaign-preview-host" />
      {error && <p className="campaign-preview-error">{error}</p>}
      <figcaption className="visually-hidden">
        Preview of the popup shoppers will see in the store
      </figcaption>
    </figure>
  );
}
