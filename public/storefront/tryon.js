/**
 * Salla Virtual Try-On (storefront script)
 *
 * Installed once in the store (same way as incentive.js). On a product page that
 * the merchant enabled, it adds a "try it on" button. Face tracking runs fully in
 * the visitor's browser (MediaPipe Face Landmarker): the camera frames and photos
 * are never uploaded anywhere.
 *
 *   <script src="https://YOUR-APP/storefront/tryon.js" data-store="STORE_ID" async></script>
 */
(function () {
  "use strict";

  var MP_VERSION = "0.10.14";
  var MP_BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/vision_bundle.mjs";
  var MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/wasm";
  var MP_MODEL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  // Face-mesh landmarks: outer eye corners, and the face edge at eye level (temples).
  var EYE_A = 33;
  var EYE_B = 263;
  var TEMPLE_A = 127;
  var TEMPLE_B = 356;
  var NOSE_TIP = 1;
  var CHIN = 152;
  var FOREHEAD = 10;
  var EAR_A = 234;
  var EAR_B = 454;
  // Lip contours (closed loops): the outside edge and the mouth opening.
  var LIPS = {
    outer: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
    inner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
  };
  // Fractions of the face width. Must match src/utils/tryOnTypes.js (a test checks this).
  var TYPE_FACTORS = {
    earrings: { width: 0.13, outward: 0.04, drop: 0.06 },
    hat: { width: 1.25, sink: 0.05 },
    necklace: { width: 0.95, drop: 0.18 },
  };
  // Where the face should sit in the frame, per product type (share of frame width / height).
  var GUIDES = {
    glasses: { target: 0.36, cy: 0.46 },
    earrings: { target: 0.36, cy: 0.46 },
    hat: { target: 0.32, cy: 0.56 },
    necklace: { target: 0.3, cy: 0.36 },
    lipstick: { target: 0.44, cy: 0.48 },
  };
  var BUTTON_TEXT = {
    glasses: "👓 جرّبها على وجهك",
    earrings: "💎 جرّب الأقراط على أذنك",
    hat: "🧢 جرّب القبعة على رأسك",
    necklace: "📿 جرّب السلسلة على رقبتك",
    lipstick: "💄 جرّب اللون على شفايفك",
  };
  // Most the camera image may be enlarged to fill a phone screen (1 = no cropping at all).
  var MAX_CROP_ZOOM = 1.2;

  var APP_ORIGIN = "";
  var DATA_STORE = "";
  try {
    var selfScript = document.currentScript;
    if (selfScript && selfScript.src) APP_ORIGIN = new URL(selfScript.src).origin;
    if (selfScript) DATA_STORE = selfScript.getAttribute("data-store") || "";
  } catch (e) {}

  var storeId = String(window._salla_target_store_id || DATA_STORE || "");
  var BTN_ID = "salla-tryon-btn";
  var MODAL_ID = "salla-tryon-modal";

  function getProductId() {
    var id = null;
    try {
      if (window.salla && window.salla.config && window.salla.config.product) id = window.salla.config.product.id;
      if (!id && window.sallaProduct) id = window.sallaProduct.id;
      if (!id) {
        var m = location.pathname.match(/\/p(\d+)/);
        if (m) id = m[1];
      }
      if (!id) {
        var el = document.querySelector("[data-product-id], meta[property='product:id'], [data-model-id]");
        if (el) id = el.getAttribute("data-product-id") || el.getAttribute("content") || el.getAttribute("data-model-id");
      }
    } catch (e) {}
    return id ? String(id) : "";
  }

  function el(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text) node.textContent = text;
    return node;
  }

  var landmarkerPromise = null;
  function loadLandmarker() {
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = import(MP_BUNDLE).then(function (mp) {
      return mp.FilesetResolver.forVisionTasks(MP_WASM).then(function (fileset) {
        return mp.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 4,
        });
      });
    });
    landmarkerPromise.catch(function () {
      landmarkerPromise = null;
    });
    return landmarkerPromise;
  }

  function dist(p, q) {
    return Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y));
  }
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * What every product type needs to know about a face: where the eyes are, how wide the face is
   * at the temples (the auto-fit size), the head's tilt and an approximate head turn.
   * x is mirrored (selfie view); pt(i) gives landmark i in canvas pixels.
   */
  function facePose(landmarks, w, h) {
    function pt(i) { return { x: (1 - landmarks[i].x) * w, y: landmarks[i].y * h }; }
    var a = pt(EYE_A), b = pt(EYE_B);
    // Mirroring swaps which corner is on the left; order them so the angle stays small.
    if (b.x < a.x) { var t = a; a = b; b = t; }
    var eyeDist = dist(a, b);
    var angle = Math.atan2(b.y - a.y, b.x - a.x);
    var ta = pt(TEMPLE_A), tb = pt(TEMPLE_B);
    var templeDist = dist(ta, tb);
    // Head turned away: the projected face width shrinks, so the product narrows with it.
    var faceWidth = templeDist > eyeDist ? templeDist : eyeDist * 2.1;
    // Approximate head turn: how far the nose tip sits from the middle of the temples.
    var nose = pt(NOSE_TIP);
    var turn = (nose.x - (ta.x + tb.x) / 2) / (faceWidth / 2);
    var yaw = Math.asin(Math.max(-1, Math.min(1, turn / 0.6)));
    var chin = pt(CHIN), forehead = pt(FOREHEAD);
    var faceHeight = dist(chin, forehead);
    var expectedNoseY = forehead.y + (chin.y - forehead.y) * 0.45;
    var pitchDiff = faceHeight > 10 ? (nose.y - expectedNoseY) / (faceHeight * 0.35) : 0;
    var pitch = Math.max(-0.6, Math.min(0.6, pitchDiff));
    return { pt: pt, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, eyeDist: eyeDist, angle: angle, faceWidth: faceWidth, yaw: yaw, pitch: pitch };
  }

  /** Glasses: centred on the eye line, as wide as the face at the temples. */
  function placement(landmarks, w, h, item) {
    return glassesPart(facePose(landmarks, w, h), item);
  }
  function glassesPart(f, item) {
    // Move along the face's own "down" axis so the offset follows head tilt.
    var shift = (item.offsetY || 0) * f.eyeDist;
    return {
      x: f.cx - Math.sin(f.angle) * shift,
      y: f.cy + Math.cos(f.angle) * shift,
      width: f.faceWidth * (item.fit || 1),
      angle: f.angle,
      yaw: f.yaw,
      pitch: f.pitch || 0,
    };
  }

  // Move `base` by (dx, dy) along the head's own axes, so offsets follow the head's tilt.
  function along(base, angle, dx, dy) {
    return {
      x: base.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: base.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  }

  /**
   * The pieces to draw for a product type: each has a position, a width, an anchor
   * ("top" hangs from the point, "bottom" rests on it, "center" is centred on it) and
   * optionally flip / alpha / arms. item.fit, offsetX and offsetY are small merchant tweaks.
   */
  function layout(type, f, item) {
    var W = f.faceWidth, fit = item.fit || 1;
    var ox = (item.offsetX || 0) * W, oy = (item.offsetY || 0) * W;
    var k = TYPE_FACTORS[type];
    var pos;

    if (type === "earrings") {
      var ears = [f.pt(EAR_A), f.pt(EAR_B)];
      if (ears[1].x < ears[0].x) ears.reverse();
      // Nose to the right of centre (yaw > 0) => the left ear is the far one and goes out of sight.
      var far = f.yaw > 0 ? 0 : 1;
      var farAlpha = clamp01(1 - (Math.abs(f.yaw) - 0.2) / 0.3);
      return [0, 1].map(function (i) {
        var side = i === 0 ? -1 : 1;
        var at = along(ears[i], f.angle, side * (k.outward * W + ox), k.drop * W + oy);
        return {
          key: "ear" + i, x: at.x, y: at.y, width: k.width * W * fit, angle: f.angle, yaw: f.yaw, pitch: f.pitch || 0,
          anchor: "top", flip: i === 1 && item.mirror !== false, alpha: i === far ? farAlpha : 1,
        };
      });
    }
    if (type === "hat") {
      pos = along(f.pt(FOREHEAD), f.angle, ox, k.sink * W + oy);
      return [{ key: "hat", x: pos.x, y: pos.y, width: k.width * W * fit, angle: f.angle, yaw: f.yaw, pitch: f.pitch || 0, anchor: "bottom" }];
    }
    if (type === "necklace") {
      pos = along(f.pt(CHIN), f.angle, ox, k.drop * W + oy);
      return [{ key: "necklace", x: pos.x, y: pos.y, width: k.width * W * fit, angle: f.angle, yaw: f.yaw, pitch: f.pitch || 0, anchor: "top" }];
    }
    var g = glassesPart(f, item);
    g.key = "glasses";
    g.anchor = "center";
    g.arms = true;
    return [g];
  }

  /** The lips as two closed point loops (outside edge and mouth opening), in canvas pixels. */
  function lipShape(landmarks, w, h) {
    function pt(i) { return { x: (1 - landmarks[i].x) * w, y: landmarks[i].y * h }; }
    return {
      outer: LIPS.outer.map(pt),
      inner: LIPS.inner.map(pt),
      width: dist(pt(61), pt(291)),
      centre: pt(17),
    };
  }

  // One Euro filter: steady when the head is still, quick to follow when it moves.
  function alphaFor(cutoffHz, dt) {
    var tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dt);
  }
  function makeFilter(minCutoff, beta) {
    var prev = null, prevSpeed = 0, prevT = 0;
    return function (x, nowMs) {
      if (prev === null) { prev = x; prevT = nowMs; return x; }
      var dt = Math.max(0.001, (nowMs - prevT) / 1000);
      prevT = nowMs;
      prevSpeed += alphaFor(1, dt) * ((x - prev) / dt - prevSpeed);
      prev += alphaFor(minCutoff + beta * Math.abs(prevSpeed), dt) * (x - prev);
      return prev;
    };
  }
  // [minCutoff Hz, beta]. Position/size are in frame-widths, angles in radians.
  var FILTER_SPECS = { x: [1.2, 12], y: [1.2, 12], width: [1.2, 12], angle: [1.2, 1], yaw: [1, 1], pitch: [1, 1] };
  function makeSmoother() {
    var f = {};
    for (var k in FILTER_SPECS) f[k] = makeFilter(FILTER_SPECS[k][0], FILTER_SPECS[k][1]);
    return function (p, w, nowMs) {
      return {
        x: f.x(p.x / w, nowMs) * w,
        y: f.y(p.y / w, nowMs) * w,
        width: f.width(p.width / w, nowMs) * w,
        angle: f.angle(p.angle, nowMs),
        yaw: f.yaw(p.yaw || 0, nowMs),
        pitch: f.pitch(p.pitch || 0, nowMs),
      };
    };
  }

  // Lips have 40 points; filter each coordinate so the colour does not shimmer.
  function makeLipSmoother() {
    var fx = [], fy = [];
    for (var i = 0; i < LIPS.outer.length + LIPS.inner.length; i++) {
      fx.push(makeFilter(2, 15));
      fy.push(makeFilter(2, 15));
    }
    return function (shape, w, nowMs) {
      var n = LIPS.outer.length;
      function run(list, offset) {
        return list.map(function (p, i) {
          return { x: fx[offset + i](p.x / w, nowMs) * w, y: fy[offset + i](p.y / w, nowMs) * w };
        });
      }
      return { outer: run(shape.outer, 0), inner: run(shape.inner, n), width: shape.width, centre: shape.centre };
    };
  }

  // When the head turns, the far end of the frame (the arm) goes behind the head: fade it out.
  var YAW_DEADZONE = 0.2;
  function farSideFade(yaw) {
    var over = Math.abs(yaw) - YAW_DEADZONE;
    if (over <= 0) return { side: null, amount: 0 };
    // Nose to the right of centre => the left side of the face is the far one.
    return { side: yaw > 0 ? "left" : "right", amount: Math.min(0.4, over * 0.8) };
  }

  // Head-positioning guide. Drawn in camera-frame coordinates so it scales with the video.
  // Returns the oval to draw, whether the face is well placed, and what to tell the visitor.
  function guideState(landmarks, w, h, type) {
    var cfg = GUIDES[type] || GUIDES.glasses;
    var target = cfg.target * Math.min(w, h * 0.75); // ideal face width at the temples
    var rx = target * 0.62;
    var g = { cx: w / 2, cy: h * cfg.cy, rx: rx, ry: rx * 1.35, ok: false, hint: "ضع وجهك داخل الإطار" };
    if (!landmarks) return g;
    function pt(i) { return { x: (1 - landmarks[i].x) * w, y: landmarks[i].y * h }; }
    var ta = pt(TEMPLE_A), tb = pt(TEMPLE_B), a = pt(EYE_A), b = pt(EYE_B);
    var width = Math.sqrt((tb.x - ta.x) * (tb.x - ta.x) + (tb.y - ta.y) * (tb.y - ta.y));
    var fx = (ta.x + tb.x) / 2;
    var fy = (a.y + b.y) / 2 + 0.3 * width;
    var size = width / target;
    if (size < 0.8) g.hint = "قرّب وجهك قليلاً";
    else if (size > 1.25) g.hint = "ابعد وجهك قليلاً";
    else if (Math.abs(fx - g.cx) > rx * 0.3) g.hint = fx < g.cx ? "حرّك وجهك لليمين" : "حرّك وجهك لليسار";
    else if (Math.abs(fy - g.cy) > g.ry * 0.25) g.hint = fy < g.cy ? "اخفض وجهك قليلاً" : "ارفع وجهك قليلاً";
    else {
      g.ok = true;
      g.hint = "ممتاز ✓ ثبّت وضعك";
    }
    return g;
  }

  // Dim rooms make the camera image dark; tone the product to match (luma 0..255 of the cheeks).
  function brightnessFor(luma) {
    return Math.min(1.1, Math.max(0.75, 0.6 + (luma / 255) * 0.6));
  }

  function openTryOn(item) {
    if (document.getElementById(MODAL_ID)) return;

    // Mobile phones: fullscreen immersion (like Snapchat/Instagram AR). Desktop: centered modal card.
    var mobile = !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    var overlayStyle =
      "position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:2147483000;font-family:PingARLT,system-ui,sans-serif;direction:rtl;box-sizing:border-box;margin:0;padding:0;overflow:hidden;";
    if (mobile) {
      overlayStyle += "background:#000;";
    } else {
      overlayStyle += "display:grid;place-items:center;background:rgba(0,0,0,.82);padding:16px;";
    }
    var overlay = el("div", overlayStyle);
    overlay.id = MODAL_ID;

    var cardStyle;
    if (mobile) {
      cardStyle =
        "background:#000;color:#fff;position:relative;overflow:hidden;width:100%;height:100%;height:100dvh;margin:0;border-radius:0;box-sizing:border-box;";
    } else {
      cardStyle =
        "background:#111;color:#fff;position:relative;overflow:hidden;width:100%;max-width:min(640px,calc(64vh * 1.3333));border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,0.6);box-sizing:border-box;";
    }
    var card = el("div", cardStyle);

    var stageStyle;
    if (mobile) {
      stageStyle = "position:absolute;inset:0;width:100%;height:100%;background:#000;overflow:hidden;";
    } else {
      stageStyle = "position:relative;width:100%;aspect-ratio:4/3;background:#000;overflow:hidden;";
    }
    var stage = el("div", stageStyle);
    var canvas = el("canvas", "width:100%;height:100%;display:block;object-fit:cover;");
    var status = el(
      "div",
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:14px;background:rgba(0,0,0,0.65);z-index:5;",
      "جارٍ تجهيز الكاميرا...",
    );
    stage.appendChild(canvas);
    stage.appendChild(status);

    var btnStyle = "border:0;cursor:pointer;font-family:inherit;font-weight:700;";
    var rect = btnStyle + "border-radius:12px;padding:12px 14px;font-size:14px;flex:1 1 0;min-width:0;box-sizing:border-box;";
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    var canCart = !!(item.productId && window.salla && window.salla.cart && typeof window.salla.cart.addItem === "function");
    var cartBtn = null;
    var hintEl = el(
      "div",
      "position:absolute;left:50%;transform:translateX(-50%);bottom:" +
        (mobile ? "160px" : "12px") +
        ";background:rgba(0,0,0,.7);backdrop-filter:blur(6px);color:#fff;padding:7px 16px;border-radius:999px;font-size:13px;font-weight:700;z-index:8;white-space:nowrap;display:none;pointer-events:none;",
    );
    var toastEl = el(
      "div",
      "position:absolute;left:50%;transform:translateX(-50%);bottom:" +
        (mobile ? "200px" : "56px") +
        ";background:rgba(0,0,0,.92);color:#fff;padding:8px 16px;border-radius:999px;font-size:13px;z-index:9;display:none;max-width:90%;text-align:center;",
    );
    var close = el(
      "button",
      btnStyle +
        "position:absolute;top:" +
        (mobile ? "max(16px,env(safe-area-inset-top,16px))" : "12px") +
        ";right:12px;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);color:#fff;font-size:16px;z-index:20;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.18);",
      "✕",
    );
    close.setAttribute("aria-label", "إغلاق");
    stage.appendChild(hintEl);
    stage.appendChild(toastEl);
    stage.appendChild(close);

    var barStyle;
    if (mobile) {
      barStyle =
        "position:absolute;bottom:0;left:0;right:0;z-index:15;padding:12px 16px;padding-bottom:max(16px,calc(env(safe-area-inset-bottom,0px) + 12px));background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 70%,rgba(0,0,0,0) 100%);display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-sizing:border-box;";
    } else {
      barStyle =
        "position:relative;z-index:10;display:flex;gap:8px;padding:14px;flex-wrap:wrap;align-items:center;background:#14181c;box-sizing:border-box;";
    }
    var bar = el("div", barStyle);
    if (canCart) {
      cartBtn = el("button", rect + "flex-basis:100%;background:#16a34a;color:#fff;font-size:15px;", "🛒 أضف للسلة");
      bar.appendChild(cartBtn);
    }
    var snap = el("button", rect + "background:#fff;color:#111;", "📸 التقاط صورة");
    var upload = el("button", rect + "background:#333;color:#fff;", "🖼️ رفع صورة");
    var note = el("div", "width:100%;font-size:11px;opacity:.65;text-align:center;color:#fff;", "🔒 الصورة تُعالَج على جهازك فقط ولا يتم رفعها لأي مكان.");
    bar.appendChild(snap);
    bar.appendChild(upload);
    bar.appendChild(fileInput);
    bar.appendChild(note);
    card.appendChild(stage);
    card.appendChild(bar);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    var ctx = canvas.getContext("2d");
    var glasses = new Image();
    if (item.image) glasses.src = item.image;

    var video = null;
    var stream = null;
    var raf = 0;
    var landmarker = null;
    var mode = "video";
    var photo = null;
    var type = item.type || "glasses";
    var smoothersByFace = [];
    var lipSmoothersByFace = [];
    var stopped = false;
    var frames = 0;
    var light = 1;
    var toastTimer = 0;
    var guideFade = 1;
    var hintText = "";
    var snapRequested = false;
    var shade = document.createElement("canvas");
    var supportsFilter = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

    // Ask for a portrait stream on a portrait phone so it fills the screen without cropping much.
    function cameraConstraints() {
      var portrait = mobile && window.innerHeight > window.innerWidth;
      var constraints = {
        facingMode: "user",
        width: { ideal: portrait ? 1080 : 1920, min: 720 },
        height: { ideal: portrait ? 1920 : 1080, min: 720 },
      };
      // Match the tall modal's shape so the image fills it without needing a big crop.
      if (mobile) constraints.aspectRatio = { ideal: portrait ? 9 / 16 : 16 / 9 };
      return constraints;
    }

    function setStatus(text) {
      status.textContent = text || "";
      status.style.display = text ? "flex" : "none";
    }

    function toast(message, ms) {
      toastEl.textContent = message;
      toastEl.style.display = "block";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.style.display = "none"; }, ms || 2500);
    }

    // Average brightness of the cheek area (under the frame) -> how bright the product should be.
    function sampleLight(p) {
      try {
        var x = Math.max(0, Math.round(p.x - p.width * 0.25));
        var y = Math.max(0, Math.round(p.y + p.width * 0.05));
        var w = Math.min(canvas.width - x, Math.round(p.width * 0.5));
        var h = Math.min(canvas.height - y, Math.round(p.width * 0.25));
        if (w < 2 || h < 2) return;
        var d = ctx.getImageData(x, y, w, h).data;
        var sum = 0, n = 0;
        for (var i = 0; i < d.length; i += 16) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          n++;
        }
        if (n) light += (brightnessFor(sum / n) - light) * 0.4;
      } catch (e) {}
    }

    function drawProduct(p) {
      if (!glasses.complete || !glasses.naturalWidth) return;
      var W = Math.max(1, Math.round(p.width));
      var H = Math.max(1, Math.round(p.width * (glasses.naturalHeight / glasses.naturalWidth)));
      // Draw the product on its own layer first so the far arm can be faded without touching the video.
      var sctx = shade.getContext("2d");
      if (shade.width !== W || shade.height !== H) {
        shade.width = W;
        shade.height = H;
      } else {
        sctx.clearRect(0, 0, W, H);
      }
      sctx.drawImage(glasses, 0, 0, W, H);
      var fade = p.arms ? farSideFade(p.yaw || 0) : { side: null };
      if (fade.side) {
        var g = sctx.createLinearGradient(0, 0, W, 0);
        if (fade.side === "left") {
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(fade.amount, "rgba(0,0,0,1)");
        } else {
          g.addColorStop(1 - fade.amount, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
        }
        sctx.globalCompositeOperation = "destination-in";
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, W, H);
        sctx.globalCompositeOperation = "source-over";
      }

      // 3D Specular Sheen (dynamic metallic/glass light reflection as head turns)
      sctx.save();
      sctx.globalCompositeOperation = "source-atop";
      var sheenX = W * (0.5 + (p.yaw || 0) * 0.85);
      var sheenY = H * (0.5 + (p.pitch || 0) * 0.85);
      var sheen = sctx.createLinearGradient(sheenX - W * 0.35, sheenY - H * 0.3, sheenX + W * 0.35, sheenY + H * 0.3);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.24)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      sctx.fillStyle = sheen;
      sctx.fillRect(0, 0, W, H);

      // 3D Ambient Occlusion / Depth shading on the far side as head turns
      if (Math.abs(p.yaw || 0) > 0.08) {
        var occGrad = sctx.createLinearGradient(0, 0, W, 0);
        if ((p.yaw || 0) > 0) {
          occGrad.addColorStop(0, "rgba(0,0,0,0)");
          occGrad.addColorStop(0.65, "rgba(0,0,0,0)");
          occGrad.addColorStop(1, "rgba(0,0,0,0.22)");
        } else {
          occGrad.addColorStop(0, "rgba(0,0,0,0.22)");
          occGrad.addColorStop(0.35, "rgba(0,0,0,0)");
          occGrad.addColorStop(1, "rgba(0,0,0,0)");
        }
        sctx.fillStyle = occGrad;
        sctx.fillRect(0, 0, W, H);
      }
      sctx.restore();

      var top = p.anchor === "top" ? 0 : p.anchor === "bottom" ? -H : -H / 2;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      // 3D Perspective Foreshortening & Spatial Depth
      var yawScale = Math.cos((p.yaw || 0) * 0.8);
      var pitchScale = Math.cos((p.pitch || 0) * 0.65);
      ctx.scale(Math.max(0.35, yawScale), Math.max(0.45, pitchScale));

      // Subtle 3D vertical skew when head turns
      var skewY = Math.sin(p.yaw || 0) * 0.08;
      ctx.transform(1, skewY, 0, 1, 0, 0);

      if (p.flip) ctx.scale(-1, 1);
      if (p.alpha != null) ctx.globalAlpha = p.alpha;
      if (supportsFilter) ctx.filter = "brightness(" + light.toFixed(2) + ")";

      // Dynamic Directional 3D Cast Shadow
      ctx.shadowColor = "rgba(0,0,0,0.36)";
      ctx.shadowOffsetX = -Math.sin(p.yaw || 0) * p.width * 0.04;
      ctx.shadowOffsetY = p.width * 0.022 + Math.sin(p.pitch || 0) * p.width * 0.025;
      ctx.shadowBlur = p.width * 0.038;

      ctx.drawImage(shade, -W / 2, top);
      ctx.restore();
    }

    // A smooth closed curve through the points (quadratic segments between midpoints).
    function traceLoop(list) {
      var n = list.length;
      ctx.moveTo((list[n - 1].x + list[0].x) / 2, (list[n - 1].y + list[0].y) / 2);
      for (var i = 0; i < n; i++) {
        var p = list[i], q = list[(i + 1) % n];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      }
      ctx.closePath();
    }

    // Tints the lips (not the mouth opening) so the real lip texture still shows through.
    function drawLips(shape) {
      var opacity = item.opacity > 0 ? item.opacity : 0.7;
      ctx.save();
      if (supportsFilter) ctx.filter = "blur(" + Math.max(0.6, shape.width * 0.012).toFixed(1) + "px)";
      ctx.fillStyle = item.color || "#c2185b";
      ctx.beginPath();
      traceLoop(shape.outer);
      traceLoop(shape.inner);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = opacity;
      ctx.fill("evenodd");
      // Multiply alone barely shows on pale lips: add a light normal-blend pass.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = opacity * 0.35;
      ctx.fill("evenodd");
      ctx.restore();
      if (item.finish === "gloss") {
        ctx.save();
        ctx.beginPath();
        traceLoop(shape.outer);
        traceLoop(shape.inner);
        ctx.clip("evenodd");
        var cx = shape.centre.x, cy = shape.centre.y - shape.width * 0.03, r = shape.width * 0.3;
        var shine = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        shine.addColorStop(0, "rgba(255,255,255,0.55)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    // Draws the product for one detected face. `live` = video (smooth over time); photos are drawn as-is.
    function paintFace(face, w, h, nowMs, live, faceIdx) {
      faceIdx = faceIdx || 0;
      var f = facePose(face, w, h);
      if (faceIdx === 0 && (!live || frames++ % 10 === 0)) sampleLight({ x: f.cx, y: f.cy, width: f.faceWidth });
      if (type === "lipstick") {
        var shape = lipShape(face, w, h);
        if (live) {
          var smLip = lipSmoothersByFace[faceIdx] || (lipSmoothersByFace[faceIdx] = makeLipSmoother());
          shape = smLip(shape, w, nowMs);
        }
        drawLips(shape);
        return;
      }
      var faceSmoothers = smoothersByFace[faceIdx] || (smoothersByFace[faceIdx] = {});
      layout(type, f, item).forEach(function (part) {
        var drawn = part;
        if (live) {
          var sm = faceSmoothers[part.key] || (faceSmoothers[part.key] = makeSmoother());
          drawn = Object.assign({}, part, sm(part, w, nowMs));
        }
        drawProduct(drawn);
      });
    }

    // The stage takes the camera's real shape (clamped to a tall modal on phones) and shows the
    // image cropped to fill it only when that enlarges it a little; otherwise the whole frame.
    function fit(w, h) {
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      var ratio = mobile ? Math.min(0.8, Math.max(0.5, w / h)) : w / h;
      stage.style.aspectRatio = ratio.toFixed(4);
      if (!mobile) card.style.maxWidth = "min(640px, calc(64vh * " + ratio.toFixed(4) + "))";
      var stageRatio = stage.clientWidth / Math.max(1, stage.clientHeight);
      var zoom = Math.max(stageRatio / (w / h), (w / h) / stageRatio);
      canvas.style.objectFit = zoom <= MAX_CROP_ZOOM ? "cover" : "contain";
    }

    // The message turns green once the face is placed (there is no outline to colour).
    function setHint(text, ok) {
      var key = text + (ok ? "|ok" : "");
      if (key === hintText) return;
      hintText = key;
      hintEl.textContent = text;
      hintEl.style.display = text ? "block" : "none";
      hintEl.style.background = ok ? "rgba(22,163,74,.92)" : "rgba(0,0,0,.65)";
    }

    // Clean full-camera view without darkening oval (Snapchat style)
    function drawGuide() {}

    function savePicture() {
      var a = document.createElement("a");
      a.download = "try-on.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    }

    function frame() {
      if (stopped || mode !== "video") return;
      raf = requestAnimationFrame(frame);
      if (!video || video.readyState < 2 || !landmarker) return;
      var w = video.videoWidth, h = video.videoHeight;
      fit(w, h);
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
      var res = landmarker.detectForVideo(video, performance.now());
      var faces = (res && res.faceLandmarks) || [];
      if (faces.length > 0) {
        faces.forEach(function (face, idx) {
          paintFace(face, w, h, performance.now(), true, idx);
        });
        setStatus("");
        if (faces.length > 1) {
          setHint("تم رصد " + faces.length + " وجوه ✓", true);
        } else {
          setHint("", false);
        }
      } else {
        smoothersByFace = [];
        lipSmoothersByFace = [];
        setHint("", false);
      }
      // A picture is taken cleanly
      if (snapRequested) {
        snapRequested = false;
        savePicture();
      }
    }

    function renderPhoto() {
      if (!photo) return;
      if (!landmarker) {
        // The measuring tool is still loading: finish the photo as soon as it is ready.
        loadLandmarker()
          .then(function (lm) {
            landmarker = lm;
            if (!stopped) renderPhoto();
          })
          .catch(function () {
            setStatus("تعذّر تحميل أداة القياس. تحقق من اتصالك وحاول مرة أخرى.");
          });
        return;
      }
      setHint("");
      fit(photo.naturalWidth, photo.naturalHeight);
      canvas.style.objectFit = "contain";
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      landmarker.setOptions({ runningMode: "IMAGE" });
      var res = landmarker.detect(photo);
      var faces = (res && res.faceLandmarks) || [];
      if (faces.length === 0) return setStatus("لم نتمكن من العثور على أي وجه في الصورة");
      faces.forEach(function (face, idx) {
        var mirrored = face.map(function (pt) { return { x: 1 - pt.x, y: pt.y }; });
        paintFace(mirrored, canvas.width, canvas.height, 0, false, idx);
      });
      setStatus("");
    }

    function stopCamera() {
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }

    function teardown() {
      stopped = true;
      stopCamera();
      overlay.remove();
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") teardown(); }
    document.addEventListener("keydown", onKey);
    close.onclick = teardown;
    overlay.addEventListener("click", function (e) { if (e.target === overlay) teardown(); });

    snap.onclick = function () {
      if (mode === "video") snapRequested = true;
      else savePicture();
    };

    if (cartBtn) {
      cartBtn.onclick = function () {
        var label = cartBtn.textContent;
        cartBtn.disabled = true;
        cartBtn.textContent = "جارٍ الإضافة...";
        Promise.resolve()
          .then(function () { return window.salla.cart.addItem({ id: item.productId, quantity: 1 }); })
          .then(function () {
            cartBtn.textContent = "✓ تمت الإضافة للسلة";
            toast("تمت إضافة المنتج إلى سلتك 🛒", 2500);
            setTimeout(function () { cartBtn.disabled = false; cartBtn.textContent = label; }, 3000);
          })
          .catch(function () {
            // Usually a product with required options (size/colour): send them to pick on the page.
            cartBtn.disabled = false;
            cartBtn.textContent = label;
            toast("اختر الخيارات (المقاس/اللون) من صفحة المنتج ثم أضفه للسلة", 2500);
            setTimeout(function () {
              if (stopped) return;
              teardown();
              var anchor = document.querySelector("salla-add-product-button, .product-form");
              if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 1800);
          });
      };
    }

    upload.onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        stopCamera();
        mode = "photo";
        photo = img;
        setStatus("جارٍ تحليل الصورة...");
        renderPhoto();
      };
      img.src = url;
    };

    loadLandmarker()
      .then(function (lm) {
        landmarker = lm;
        // Closed, or the visitor already chose a photo instead: do not switch the camera on.
        if (stopped || mode !== "video") return;
        return navigator.mediaDevices
          .getUserMedia({ video: cameraConstraints(), audio: false })
          .then(function (s) {
            if (stopped || mode !== "video") return s.getTracks().forEach(function (t) { t.stop(); });
            stream = s;
            video = document.createElement("video");
            video.playsInline = true;
            video.muted = true;
            video.srcObject = s;
            return video.play().then(function () {
              setStatus("");
              frame();
            });
          })
          .catch(function () {
            setStatus("تعذّر تشغيل الكاميرا. يمكنك رفع صورة لوجهك بدلاً منها.");
          });
      })
      .catch(function () {
        setStatus("تعذّر تحميل أداة القياس. تحقق من اتصالك وحاول مرة أخرى.");
      });
  }

  function mountButton(item) {
    if (document.getElementById(BTN_ID)) return;
    var btn = el(
      "button",
      "display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;padding:12px 16px;border-radius:10px;border:1.5px solid currentColor;background:transparent;color:inherit;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;",
      BUTTON_TEXT[item.type] || BUTTON_TEXT.glasses,
    );
    btn.id = BTN_ID;
    btn.type = "button";
    btn.onclick = function () { openTryOn(item); };
    var anchor = document.querySelector("salla-add-product-button, .product-form, form.product-form, .sticky-product-bar");
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    } else {
      btn.style.cssText += "position:fixed;bottom:20px;left:20px;width:auto;margin:0;background:#111;color:#fff;border-color:#111;z-index:2147482000;";
      document.body.appendChild(btn);
    }
  }

  window.openSallaTryOn = openTryOn;

  // Lets the unit tests reach the pure maths; does nothing on a real storefront.
  if (window.__SALLA_TRYON_TEST__) {
    window.__SALLA_TRYON_TEST__.api = {
      placement: placement, facePose: facePose, layout: layout, lipShape: lipShape, makeSmoother: makeSmoother,
      makeLipSmoother: makeLipSmoother, farSideFade: farSideFade, brightnessFor: brightnessFor, guideState: guideState,
      TYPE_FACTORS: TYPE_FACTORS, GUIDES: GUIDES, openTryOn: openTryOn,
    };
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    var productId = getProductId();
    if (!productId || !storeId || !APP_ORIGIN) return;
    fetch(APP_ORIGIN + "/api/tryon-config?store=" + encodeURIComponent(storeId))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var items = (res && res.success && res.data && res.data.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].productId) === productId) return mountButton(items[i]);
        }
      })
      .catch(function () {});
  }

  if (typeof salla !== "undefined" && salla.onReady) {
    try { salla.onReady(boot); } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
    setTimeout(boot, 500);
  }
})();
