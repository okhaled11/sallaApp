/**
 * Tests for the real storefront script (public/storefront/campaign.js).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";

const NOW = new Date("2030-01-01T10:00:00Z").getTime();
let api;

beforeAll(async () => {
  await import("../../public/storefront/campaign.js");
  api = window.SallaPromoCampaign;
});

const campaign = (overrides = {}) => ({
  discountPercent: 20,
  endsAt: new Date(NOW + 26 * 60 * 60 * 1000 + 61_000).toISOString(),
  design: {
    title: "عرض لفترة محدودة",
    message: "خصم خاص",
    buttonText: "تسوق الآن",
    accentColor: "#004d5b",
    theme: "light",
    position: "center",
  },
  trigger: { delaySeconds: 0, frequency: "session" },
  products: [
    {
      id: 1,
      name: "بخور",
      image: "https://cdn.test/1.png",
      url: "https://store.test/p/1",
      currency: "SAR",
      price: 100,
      finalPrice: 80,
    },
    {
      id: 2,
      name: "عود",
      image: null,
      url: null,
      currency: "SAR",
      price: 50,
      finalPrice: 40,
    },
  ],
  updatedAt: "v1",
  ...overrides,
});

function mount(data, options = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const handle = api.render(root, data, { now: () => NOW, ...options });
  return { host, root, handle };
}

describe("storefront campaign script", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.salla;
  });

  it("exposes the renderer without auto-booting when imported", () => {
    expect(api.version).toBe(1);
    expect(document.getElementById("salla-promo-campaign")).toBe(null);
  });

  it("renders an accessible RTL dialog with the campaign content", () => {
    const { root } = mount(campaign());
    const dialog = root.querySelector("[role=dialog]");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.querySelector(".overlay").getAttribute("dir")).toBe("rtl");
    expect(root.getElementById("promo-title").textContent).toBe(
      "عرض لفترة محدودة",
    );
    expect(root.querySelector(".badge").textContent).toBe("خصم 20%");
    expect(root.querySelector(".close").getAttribute("aria-label")).toBe(
      "إغلاق",
    );
  });

  it("shows products with old and new prices and safe links", () => {
    const { root } = mount(campaign());
    const items = root.querySelectorAll(".product");
    expect(items).toHaveLength(2);
    expect(items[0].tagName).toBe("A");
    expect(items[0].getAttribute("href")).toBe("https://store.test/p/1");
    expect(items[0].textContent).toContain("80 ر.س");
    expect(items[0].querySelector("s").textContent).toBe("100 ر.س");
    // No URL: not a link
    expect(items[1].tagName).toBe("DIV");
    // CTA goes to the first product with a link
    expect(root.querySelector(".cta").getAttribute("href")).toBe(
      "https://store.test/p/1",
    );
  });

  it("never renders campaign text as HTML (no script injection)", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { root } = mount(
      campaign({
        design: { ...campaign().design, title: evil, message: evil },
        products: [
          {
            id: 1,
            name: evil,
            url: "javascript:alert(1)",
            image: "javascript:x",
            price: 1,
            finalPrice: 1,
          },
        ],
      }),
    );
    expect(root.querySelector("img[onerror]")).toBe(null);
    expect(root.getElementById("promo-title").textContent).toBe(evil);
    // javascript: URLs are dropped
    expect(root.querySelector("a.product")).toBe(null);
    expect(root.querySelector(".thumb").tagName).toBe("SPAN");
  });

  it("ignores an invalid accent color", () => {
    const { root } = mount(
      campaign({
        design: { ...campaign().design, accentColor: "red;background:url(x)" },
      }),
    );
    expect(
      root.querySelector(".overlay").style.getPropertyValue("--accent"),
    ).toBe("#004d5b");
  });

  it("picks readable text on the accent color", () => {
    const light = mount(
      campaign({ design: { ...campaign().design, accentColor: "#73fcd7" } }),
    );
    expect(
      light.root
        .querySelector(".overlay")
        .style.getPropertyValue("--on-accent"),
    ).toBe("#111111");
    const dark = mount(campaign());
    expect(
      dark.root.querySelector(".overlay").style.getPropertyValue("--on-accent"),
    ).toBe("#ffffff");
  });

  it("counts down days, hours, minutes and seconds", () => {
    vi.useFakeTimers();
    let now = NOW;
    const { root } = mount(campaign(), { now: () => now });
    const values = () =>
      [...root.querySelectorAll(".unit b")].map((b) => b.textContent);
    expect(values()).toEqual(["01", "02", "01", "01"]);

    now += 2000;
    vi.advanceTimersByTime(1000);
    expect(values()).toEqual(["01", "02", "00", "59"]);
  });

  it("closes itself when the countdown ends", () => {
    vi.useFakeTimers();
    let now = NOW;
    const onClose = vi.fn();
    const data = campaign({ endsAt: new Date(NOW + 1500).toISOString() });
    const { root } = mount(data, { now: () => now, onClose });

    now += 2000;
    vi.advanceTimersByTime(1000);
    expect(onClose).toHaveBeenCalled();
    expect(root.querySelector("[role=dialog]")).toBe(null);
  });

  it("closes with the close button, Esc, and a click outside", () => {
    const first = vi.fn();
    const a = mount(campaign(), { onClose: first });
    a.root.querySelector(".close").click();
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    mount(campaign(), { onClose: second });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(second).toHaveBeenCalledTimes(1);

    const third = vi.fn();
    const c = mount(campaign(), { onClose: third });
    c.root
      .querySelector(".overlay")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("preview mode stays open, is not modal and does not navigate", () => {
    vi.useFakeTimers();
    let now = NOW;
    const onClose = vi.fn();
    const { root } = mount(
      campaign({ endsAt: new Date(NOW + 500).toISOString() }),
      { preview: true, onClose, now: () => now },
    );
    expect(
      root.querySelector(".overlay").classList.contains("is-preview"),
    ).toBe(true);
    expect(root.querySelector("[role=dialog]").getAttribute("aria-modal")).toBe(
      "false",
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    now += 5000;
    vi.advanceTimersByTime(2000);
    expect(onClose).not.toHaveBeenCalled();

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    root.querySelector("a.product").dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("destroy removes the popup and stops listening", () => {
    const onClose = vi.fn();
    const { root, handle } = mount(campaign(), { onClose });
    handle.destroy();
    expect(root.querySelector("[role=dialog]")).toBe(null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("frequency", () => {
    it("session: once per session, again after a republish", () => {
      const data = campaign();
      expect(api.shouldShow(data, NOW)).toBe(true);
      api.markShown(data, NOW);
      expect(api.shouldShow(data, NOW)).toBe(false);
      expect(api.shouldShow({ ...data, updatedAt: "v2" }, NOW)).toBe(true);
    });

    it("day: again after 24 hours", () => {
      const data = campaign({ trigger: { delaySeconds: 0, frequency: "day" } });
      api.markShown(data, NOW);
      expect(api.shouldShow(data, NOW + 60_000)).toBe(false);
      expect(api.shouldShow(data, NOW + 25 * 60 * 60 * 1000)).toBe(true);
    });

    it("always: every time", () => {
      const data = campaign({
        trigger: { delaySeconds: 0, frequency: "always" },
      });
      api.markShown(data, NOW);
      expect(api.shouldShow(data, NOW)).toBe(true);
    });
  });

  describe("boot (in the store)", () => {
    function stubSalla(storeId) {
      window.salla = {
        config: { get: (key) => (key === "store.id" ? storeId : undefined) },
      };
    }

    it("fetches this store's campaign and shows it after the delay", async () => {
      stubSalla(777);
      const data = campaign({
        endsAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ campaign: data }),
        });
      vi.stubGlobal("fetch", fetchMock);

      await api.boot({ origin: "https://app.test", storeIdTimeoutMs: 100 });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://app.test/api/storefront-campaign?store=777",
        { credentials: "omit" },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      const host = document.getElementById("salla-promo-campaign");
      expect(host).not.toBe(null);
      expect(host.shadowRoot.querySelector("[role=dialog]")).not.toBe(null);
    });

    it("does nothing without a store id, a campaign, or when already seen", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ campaign: null }),
        });
      vi.stubGlobal("fetch", fetchMock);

      await api.boot({ origin: "https://app.test", storeIdTimeoutMs: 50 });
      expect(fetchMock).not.toHaveBeenCalled();

      stubSalla(777);
      expect(
        await api.boot({ origin: "https://app.test", storeIdTimeoutMs: 50 }),
      ).toBe(null);

      const data = campaign({
        endsAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      api.markShown(data, Date.now());
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaign: data }),
      });
      expect(
        await api.boot({ origin: "https://app.test", storeIdTimeoutMs: 50 }),
      ).toBe(null);
    });

    it("never throws when the API fails", async () => {
      stubSalla(777);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      await expect(
        api.boot({ origin: "https://app.test", storeIdTimeoutMs: 50 }),
      ).resolves.toBe(null);
    });
  });
});
