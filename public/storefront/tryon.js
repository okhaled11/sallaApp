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
          numFaces: 1,
        });
      });
    });
    landmarkerPromise.catch(function () {
      landmarkerPromise = null;
    });
    return landmarkerPromise;
  }

  /**
   * Where the glasses go for one face. Auto-fit: the frame is as wide as the face
   * at the temples, centred on the eye line and tilted with it, so it suits any
   * face without manual tuning. item.fit / item.offsetY are only small tweaks.
   * x is mirrored (selfie view).
   */
  function placement(landmarks, w, h, item) {
    function pt(i) { return { x: (1 - landmarks[i].x) * w, y: landmarks[i].y * h }; }
    var a = pt(EYE_A), b = pt(EYE_B);
    // Mirroring swaps which corner is on the left; order them so the angle stays small.
    if (b.x < a.x) { var t = a; a = b; b = t; }
    var eyeDist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    var angle = Math.atan2(b.y - a.y, b.x - a.x);
    var ta = pt(TEMPLE_A), tb = pt(TEMPLE_B);
    var templeDist = Math.sqrt((tb.x - ta.x) * (tb.x - ta.x) + (tb.y - ta.y) * (tb.y - ta.y));
    // Head turned away: the projected face width shrinks, so the frame narrows with it.
    var faceWidth = templeDist > eyeDist ? templeDist : eyeDist * 2.1;
    // Approximate head turn: how far the nose tip sits from the middle of the temples.
    var nose = pt(NOSE_TIP);
    var turn = (nose.x - (ta.x + tb.x) / 2) / (faceWidth / 2);
    var yaw = Math.asin(Math.max(-1, Math.min(1, turn / 0.6)));
    // Move along the face's own "down" axis so the offset follows head tilt.
    var shift = (item.offsetY || 0) * eyeDist;
    return {
      x: (a.x + b.x) / 2 - Math.sin(angle) * shift,
      y: (a.y + b.y) / 2 + Math.cos(angle) * shift,
      width: faceWidth * (item.fit || 1),
      angle: angle,
      yaw: yaw,
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
  var FILTER_SPECS = { x: [1.2, 12], y: [1.2, 12], width: [1.2, 12], angle: [1.2, 1], yaw: [1, 1] };
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
      };
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
  function guideState(landmarks, w, h) {
    var target = 0.36 * Math.min(w, h * 0.75); // ideal face width at the temples
    var rx = target * 0.62;
    var g = { cx: w / 2, cy: h * 0.46, rx: rx, ry: rx * 1.35, ok: false, hint: "ضع وجهك داخل الإطار" };
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

    // Same layout everywhere: a modal card. Tall (portrait) on phones, wider on desktop.
    var mobile = !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);

    var overlay = el(
      "div",
      "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;background:rgba(0,0,0,.75);font-family:PingARLT,system-ui,sans-serif;direction:rtl;",
    );
    overlay.id = MODAL_ID;
    var card = el(
      "div",
      "background:#111;color:#fff;position:relative;overflow:hidden;width:100%;margin:auto;border-radius:18px;" +
        (mobile ? "max-width:420px;" : "max-width:min(640px,calc(64vh * 1.3333));"),
    );
    // Phones: tall stage that still leaves room for the buttons under it.
    var stage = el(
      "div",
      "position:relative;width:100%;background:#000;" +
        (mobile ? "aspect-ratio:3/4;max-height:calc(100vh - 220px);max-height:calc(100dvh - 220px);" : "aspect-ratio:4/3;"),
    );
    var canvas = el("canvas", "width:100%;height:100%;display:block;object-fit:cover;");
    var status = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:14px;", "جارٍ تجهيز الكاميرا...");
    stage.appendChild(canvas);
    stage.appendChild(status);

    var btnStyle = "border:0;cursor:pointer;font-family:inherit;font-weight:700;";
    var rect = btnStyle + "border-radius:12px;padding:12px 14px;font-size:14px;flex:1 1 0;";
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    var canCart = !!(item.productId && window.salla && window.salla.cart && typeof window.salla.cart.addItem === "function");
    var cartBtn = null;
    var hintEl = el(
      "div",
      "position:absolute;left:50%;transform:translateX(-50%);bottom:12px;background:rgba(0,0,0,.65);color:#fff;padding:7px 14px;border-radius:999px;font-size:13px;font-weight:700;z-index:2;white-space:nowrap;display:none;pointer-events:none;",
    );
    var toastEl = el(
      "div",
      "position:absolute;left:50%;transform:translateX(-50%);bottom:56px;background:rgba(0,0,0,.88);color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;z-index:3;display:none;max-width:90%;text-align:center;",
    );
    var close = el(
      "button",
      btnStyle + "position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:16px;z-index:3;display:flex;align-items:center;justify-content:center;",
      "✕",
    );
    close.setAttribute("aria-label", "إغلاق");
    stage.appendChild(hintEl);
    stage.appendChild(toastEl);
    stage.appendChild(close);

    var bar = el("div", "display:flex;gap:8px;padding:12px;flex-wrap:wrap;align-items:center;");
    if (canCart) {
      cartBtn = el("button", rect + "flex-basis:100%;background:#16a34a;color:#fff;font-size:15px;", "🛒 أضف للسلة");
      bar.appendChild(cartBtn);
    }
    var snap = el("button", rect + "background:#fff;color:#111;", "📸 التقاط صورة");
    var upload = el("button", rect + "background:#333;color:#fff;", "🖼️ رفع صورة");
    var note = el("div", "width:100%;font-size:11px;opacity:.65;text-align:center;", "🔒 الصورة تُعالَج على جهازك فقط ولا يتم رفعها لأي مكان.");
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
    glasses.src = item.image;

    var video = null;
    var stream = null;
    var raf = 0;
    var landmarker = null;
    var mode = "video";
    var photo = null;
    var smoother = makeSmoother();
    var last = null;
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
        width: { ideal: portrait ? 720 : 1280 },
        height: { ideal: portrait ? 1280 : 720 },
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

    function drawGlasses(p) {
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
      var fade = farSideFade(p.yaw || 0);
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
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      if (supportsFilter) ctx.filter = "brightness(" + light.toFixed(2) + ")";
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = p.width * 0.03;
      ctx.shadowOffsetY = p.width * 0.018;
      ctx.drawImage(shade, -W / 2, -H / 2);
      ctx.restore();
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

    // Darkens everything outside the oval (no outline); fades back once the face is placed.
    function drawGuide(g) {
      guideFade += ((g.ok ? 0.25 : 1) - guideFade) * 0.15;
      var cw = canvas.width, ch = canvas.height;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0," + (0.38 * guideFade).toFixed(3) + ")";
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.restore();
    }

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
      var face = res && res.faceLandmarks && res.faceLandmarks[0];
      var guide = guideState(face || null, w, h);
      if (face) {
        last = smoother(placement(face, w, h, item), w, performance.now());
        if (frames++ % 10 === 0) sampleLight(last);
        drawGlasses(last);
        setStatus("");
      } else {
        last = null;
        smoother = makeSmoother();
      }
      // A picture is taken before the guide is drawn so the saved image is clean.
      if (snapRequested) {
        snapRequested = false;
        savePicture();
      }
      drawGuide(guide);
      setHint(guide.hint, guide.ok);
    }

    function renderPhoto() {
      if (!photo || !landmarker) return;
      setHint("");
      fit(photo.naturalWidth, photo.naturalHeight);
      canvas.style.objectFit = "contain";
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      landmarker.setOptions({ runningMode: "IMAGE" });
      var res = landmarker.detect(photo);
      var face = res && res.faceLandmarks && res.faceLandmarks[0];
      if (!face) return setStatus("لم نتمكن من العثور على وجه في الصورة");
      // Photos are not mirrored, so flip x back before reusing the shared maths.
      var mirrored = face.map(function (pt) { return { x: 1 - pt.x, y: pt.y }; });
      var placed = placement(mirrored, canvas.width, canvas.height, item);
      sampleLight(placed);
      drawGlasses(placed);
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
        if (stopped) return;
        return navigator.mediaDevices
          .getUserMedia({ video: cameraConstraints(), audio: false })
          .then(function (s) {
            if (stopped) return s.getTracks().forEach(function (t) { t.stop(); });
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
      "👓 جرّبها على وجهك",
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

  // Lets the unit tests reach the pure maths; does nothing on a real storefront.
  if (window.__SALLA_TRYON_TEST__) {
    window.__SALLA_TRYON_TEST__.api = { placement: placement, makeSmoother: makeSmoother, farSideFade: farSideFade, brightnessFor: brightnessFor, guideState: guideState };
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
