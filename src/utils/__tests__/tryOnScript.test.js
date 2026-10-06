import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Loads the real storefront script; it exposes its pure maths through a test-only hook.
let api;
beforeAll(() => {
  window.__SALLA_TRYON_TEST__ = {};
  const source = readFileSync(resolve(process.cwd(), "public/storefront/tryon.js"), "utf8");
  new Function(source)();
  api = window.__SALLA_TRYON_TEST__.api;
});

// Face-mesh stand-in: only the landmarks the script reads (normalized, un-mirrored).
function face({ eyeA = [0.4, 0.4], eyeB = [0.6, 0.4], templeA = [0.3, 0.42], templeB = [0.7, 0.42], nose = [0.5, 0.5] } = {}) {
  const lm = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  const set = (i, [x, y]) => (lm[i] = { x, y });
  set(33, eyeA);
  set(263, eyeB);
  set(127, templeA);
  set(356, templeB);
  set(1, nose);
  return lm;
}
const item = (extra = {}) => ({ fit: 1, offsetY: 0, ...extra });
const SIZE = 1000;

describe("placement", () => {
  it("centres a front-facing frame on the eyes, as wide as the face at the temples", () => {
    const p = api.placement(face(), SIZE, SIZE, item());
    expect(p.x).toBeCloseTo(500, 3);
    expect(p.y).toBeCloseTo(400, 3);
    expect(p.width).toBeCloseTo(400, 3);
    expect(p.angle).toBeCloseTo(0, 5);
    expect(Math.abs(p.yaw)).toBeLessThan(0.01);
  });

  it("scales with fit and shifts down with offsetY", () => {
    const p = api.placement(face(), SIZE, SIZE, item({ fit: 1.25, offsetY: 0.1 }));
    expect(p.width).toBeCloseTo(500, 3);
    expect(p.y).toBeCloseTo(400 + 0.1 * 200, 3);
  });

  it("follows head tilt without flipping the frame upside down", () => {
    const p = api.placement(face({ eyeA: [0.4, 0.38], eyeB: [0.6, 0.42] }), SIZE, SIZE, item());
    expect(Math.abs(p.angle)).toBeCloseTo(Math.atan2(40, 200), 5);
    expect(Math.abs(p.angle)).toBeLessThan(0.3);
  });

  it("narrows the frame when the face is turned (temples closer together)", () => {
    const turned = api.placement(face({ templeA: [0.38, 0.42], templeB: [0.66, 0.42] }), SIZE, SIZE, item());
    expect(turned.width).toBeCloseTo(280, 3);
  });

  it("falls back to an eye-based width if the temples are unusable", () => {
    const p = api.placement(face({ templeA: [0.5, 0.42], templeB: [0.5, 0.42] }), SIZE, SIZE, item());
    expect(p.width).toBeCloseTo(200 * 2.1, 3);
  });

  it("reads the head turn from the nose, with opposite signs per direction", () => {
    const right = api.placement(face({ nose: [0.42, 0.5] }), SIZE, SIZE, item());
    const left = api.placement(face({ nose: [0.58, 0.5] }), SIZE, SIZE, item());
    expect(right.yaw).toBeGreaterThan(0.5);
    expect(left.yaw).toBeLessThan(-0.5);
    expect(right.yaw).toBeCloseTo(-left.yaw, 5);
  });
});

describe("guideState", () => {
  // Portrait 720x1280 frame: ideal face width = 0.36 * min(720, 960) = 259.2px, guide centred at (360, 589).
  const W = 720;
  const H = 1280;
  const T = 0.36 * W;
  // A face whose temples are `width` px apart, centred at (cx, cy) on screen (un-mirrored coords).
  function placed(width, cx = W / 2, cy = H * 0.46) {
    const eyeY = cy - 0.3 * width;
    const n = (x, y) => [1 - x / W, y / H]; // screen px -> un-mirrored normalized
    return face({
      templeA: n(cx - width / 2, eyeY),
      templeB: n(cx + width / 2, eyeY),
      eyeA: n(cx - width * 0.25, eyeY),
      eyeB: n(cx + width * 0.25, eyeY),
    });
  }

  it("asks for a face when none is detected", () => {
    const g = api.guideState(null, W, H);
    expect(g.ok).toBe(false);
    expect(g.hint).toBe("ضع وجهك داخل الإطار");
    expect(g.cx).toBe(W / 2);
    expect(g.ry).toBeGreaterThan(g.rx);
  });

  it("accepts a well-placed face", () => {
    const g = api.guideState(placed(T), W, H);
    expect(g.ok).toBe(true);
    expect(g.hint).toContain("ممتاز");
  });

  it("tells the visitor to come closer or move back", () => {
    expect(api.guideState(placed(T * 0.6), W, H).hint).toContain("قرّب");
    expect(api.guideState(placed(T * 1.5), W, H).hint).toContain("ابعد");
  });

  it("points the way when the face is off to one side", () => {
    // Face sits on the left of the screen -> move right, and vice versa.
    expect(api.guideState(placed(T, W * 0.25), W, H).hint).toContain("لليمين");
    expect(api.guideState(placed(T, W * 0.75), W, H).hint).toContain("لليسار");
  });

  it("points the way when the face is too high or too low", () => {
    expect(api.guideState(placed(T, W / 2, H * 0.3), W, H).hint).toContain("اخفض");
    expect(api.guideState(placed(T, W / 2, H * 0.62), W, H).hint).toContain("ارفع");
  });

  it("sizes the oval from the frame, not a fixed pixel size", () => {
    const portrait = api.guideState(null, 720, 1280);
    const landscape = api.guideState(null, 1280, 720);
    expect(portrait.rx).toBeCloseTo(0.36 * 720 * 0.62, 5);
    expect(landscape.rx).toBeCloseTo(0.36 * 540 * 0.62, 5);
  });
});

describe("farSideFade", () => {
  it("does nothing for a nearly frontal face", () => {
    expect(api.farSideFade(0.1)).toEqual({ side: null, amount: 0 });
    expect(api.farSideFade(-0.2)).toEqual({ side: null, amount: 0 });
  });

  it("fades the side that turned away and grows with the turn", () => {
    expect(api.farSideFade(0.4).side).toBe("left");
    expect(api.farSideFade(-0.4).side).toBe("right");
    expect(api.farSideFade(0.5).amount).toBeGreaterThan(api.farSideFade(0.3).amount);
  });

  it("never hides more than 40% of the frame", () => {
    expect(api.farSideFade(1.5).amount).toBe(0.4);
  });
});

describe("brightnessFor", () => {
  it("dims the product in dark rooms and brightens slightly in bright ones", () => {
    expect(api.brightnessFor(0)).toBe(0.75);
    expect(api.brightnessFor(255)).toBe(1.1);
    expect(api.brightnessFor(128)).toBeCloseTo(0.9, 1);
  });

  it("is monotonic", () => {
    let prev = -Infinity;
    for (let l = 0; l <= 255; l += 15) {
      const b = api.brightnessFor(l);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
});

describe("makeSmoother", () => {
  const sample = (x, yaw = 0) => ({ x, y: 400, width: 400, angle: 0, yaw });

  it("returns the first sample unchanged", () => {
    const out = api.makeSmoother()(sample(500), SIZE, 0);
    expect(out).toMatchObject({ x: 500, y: 400, width: 400, angle: 0, yaw: 0 });
  });

  it("damps jitter on a still head", () => {
    const smooth = api.makeSmoother();
    let maxOut = 0;
    for (let i = 0; i < 90; i++) {
      const out = smooth(sample(500 + (i % 2 ? 1 : -1)), SIZE, i * 33);
      if (i > 30) maxOut = Math.max(maxOut, Math.abs(out.x - 500));
    }
    expect(maxOut).toBeLessThan(0.5);
  });

  it("settles on a new position after the head jumps", () => {
    const smooth = api.makeSmoother();
    let out;
    for (let i = 0; i < 60; i++) out = smooth(sample(i < 5 ? 500 : 700), SIZE, i * 33);
    expect(out.x).toBeCloseTo(700, 0);
  });

  it("keeps up with a fast-moving head (little lag)", () => {
    const smooth = api.makeSmoother();
    let lag = 0;
    for (let i = 0; i < 30; i++) {
      const x = 300 + i * 20; // ~600 px/s
      const out = smooth(sample(x), SIZE, i * 33);
      lag = x - out.x;
    }
    expect(lag).toBeGreaterThanOrEqual(0);
    expect(lag).toBeLessThan(30);
  });
});
