import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateStorefrontTrackingScript, DEFAULT_INCENTIVE_CONFIG } from "../visitorIncentives.js";

const giftRule = (incentive = {}) => ({
  id: "r1",
  name: "هدية",
  enabled: true,
  priority: 1,
  trigger: { type: "store_visits", minVisits: 1, timeWindowMinutes: 60 },
  incentive: {
    type: "free_product",
    couponCode: "",
    isCreatedInSalla: true,
    buyProducts: [
      { id: "111", name: "فستان", image: "", url: "https://shop.test/dress/p111" },
      { id: "112", name: "عباية", image: "", url: "" },
    ],
    buyQuantity: 2,
    giftProducts: [{ id: "222", name: "وشاح", image: "", url: "" }],
    giftQuantity: 1,
    ...incentive,
  },
  modal: { headline: "هدية لك", message: "تفضل", ctaText: "أضف", dismissText: "لاحقاً" },
});

// Runs the generated storefront script as the browser would
async function runStorefront(rules) {
  const script = generateStorefrontTrackingScript({ ...DEFAULT_INCENTIVE_CONFIG, enabled: true }, "t", false, rules);
  new Function(script)();
  await vi.advanceTimersByTimeAsync(2500);
}

describe("storefront gift offer (buy N get M free)", () => {
  let addItem;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = "";
    addItem = vi.fn(() => Promise.resolve({}));
    window.salla = {
      cart: { addItem, addCoupon: vi.fn(() => Promise.resolve({})), getCount: () => 0 },
      storage: { get: () => null },
      event: { on: () => {} },
      config: { get: () => "t" },
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete window.salla;
  });

  it("shows the buy -> free gift products without any coupon code", async () => {
    await runStorefront([giftRule()]);
    const modal = document.getElementById("salla-freq-visitor-modal");
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain("فستان");
    expect(modal.textContent).toContain("وشاح");
    expect(modal.textContent).toContain("مجاناً");
    expect(modal.textContent).not.toContain("SPECIAL3X");
  });

  it("lets the visitor pick which of several products to buy", async () => {
    await runStorefront([giftRule()]);
    const second = document.querySelector('[data-pick="buy"][data-idx="1"]');
    expect(second).not.toBeNull();
    second.click();
    document.getElementById("salla-modal-apply").click();
    await vi.advanceTimersByTimeAsync(50);
    expect(addItem).toHaveBeenNthCalledWith(1, { id: "112", quantity: 2 });
    expect(addItem).toHaveBeenNthCalledWith(2, { id: "222", quantity: 1 });
  });

  it("still supports rules saved with a single product per side", async () => {
    await runStorefront([
      giftRule({
        buyProducts: undefined,
        giftProducts: undefined,
        buyProductId: "111",
        buyProductName: "فستان",
        giftProductId: "222",
        giftProductName: "وشاح",
      }),
    ]);
    expect(document.getElementById("salla-freq-visitor-modal").textContent).toContain("وشاح");
  });

  it("adds the buy quantity and then the free gift to the cart on click", async () => {
    await runStorefront([giftRule()]);
    document.getElementById("salla-modal-apply").click();
    await vi.advanceTimersByTimeAsync(50);
    expect(addItem).toHaveBeenNthCalledWith(1, { id: "111", quantity: 2 });
    expect(addItem).toHaveBeenNthCalledWith(2, { id: "222", quantity: 1 });
    expect(document.getElementById("salla-freq-visitor-modal")).toBeNull();
  });

  it("still adds the gift when the buy product needs options, then sends the visitor to its page", async () => {
    addItem
      .mockImplementationOnce(() => Promise.reject({ response: { data: { error: { message: "اختر المقاس" } } } }))
      .mockImplementationOnce(() => Promise.resolve({}));
    const hrefSetter = vi.fn();
    const loc = { ...window.location, pathname: "/", set href(v) { hrefSetter(v); } };
    vi.stubGlobal("location", loc);
    await runStorefront([giftRule()]);
    document.getElementById("salla-modal-apply").click();
    await vi.advanceTimersByTimeAsync(3500);
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(addItem).toHaveBeenNthCalledWith(2, { id: "222", quantity: 1 });
    expect(document.getElementById("salla-incentives-toast") || document.getElementById("salla-incentive-toast").textContent).toBeTruthy();
    expect(document.getElementById("salla-incentive-toast").textContent).toContain("اختر المقاس");
    expect(hrefSetter).toHaveBeenCalledWith("https://shop.test/dress/p111");
  });

  it("never shows a gift rule whose offer was not created in Salla", async () => {
    await runStorefront([giftRule({ isCreatedInSalla: false })]);
    expect(document.getElementById("salla-freq-visitor-modal")).toBeNull();
  });

  it("does not auto-popup in manual mode", async () => {
    const script = generateStorefrontTrackingScript(
      { ...DEFAULT_INCENTIVE_CONFIG, enabled: true, triggerMode: "manual" },
      "t",
      false,
      [giftRule()],
    );
    new Function(script)();
    await vi.advanceTimersByTimeAsync(2500);
    expect(document.getElementById("salla-freq-visitor-modal")).toBeNull();
  });
});
