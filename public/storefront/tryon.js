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
  var SMOOTHING = 0.45;
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
    // Move along the face's own "down" axis so the offset follows head tilt.
    var shift = (item.offsetY || 0) * eyeDist;
    return {
      x: (a.x + b.x) / 2 - Math.sin(angle) * shift,
      y: (a.y + b.y) / 2 + Math.cos(angle) * shift,
      width: faceWidth * (item.fit || 1),
      angle: angle,
    };
  }

  function smooth(prev, next) {
    if (!prev) return next;
    var out = {};
    for (var k in next) out[k] = prev[k] + (next[k] - prev[k]) * SMOOTHING;
    return out;
  }

  function openTryOn(item) {
    if (document.getElementById(MODAL_ID)) return;

    // Phones get a full-screen camera (like the native app); desktops get a centred card.
    var mobile = !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);

    var overlay = el(
      "div",
      "position:fixed;inset:0;z-index:2147483000;display:flex;font-family:PingARLT,system-ui,sans-serif;direction:rtl;" +
        (mobile ? "background:#000;" : "background:rgba(0,0,0,.75);align-items:center;justify-content:center;padding:12px;"),
    );
    overlay.id = MODAL_ID;
    var card = el(
      "div",
      "background:#111;color:#fff;position:relative;overflow:hidden;width:100%;" +
        (mobile
          ? "height:100%;display:flex;flex-direction:column;"
          : "border-radius:16px;max-width:min(640px,calc(64vh * 1.3333));"),
    );
    var stage = el(
      "div",
      "position:relative;width:100%;background:#000;" + (mobile ? "flex:1;min-height:0;" : "aspect-ratio:4/3;"),
    );
    var canvas = el("canvas", "width:100%;height:100%;display:block;" + (mobile ? "object-fit:cover;" : ""));
    var status = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:14px;", "جارٍ تجهيز الكاميرا...");
    stage.appendChild(canvas);
    stage.appendChild(status);

    var safeTop = "calc(12px + env(safe-area-inset-top,0px))";
    var safeBottom = "calc(18px + env(safe-area-inset-bottom,0px))";
    var btnStyle = "border:0;cursor:pointer;font-family:inherit;font-weight:700;";
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    var snap, upload, close, note;

    if (mobile) {
      var round = btnStyle + "border-radius:50%;display:flex;align-items:center;justify-content:center;";
      snap = el("button", round + "width:68px;height:68px;font-size:28px;background:#fff;color:#111;border:4px solid rgba(255,255,255,.5);", "📸");
      upload = el("button", round + "width:46px;height:46px;font-size:20px;background:rgba(0,0,0,.45);color:#fff;", "🖼️");
      close = el("button", round + "position:absolute;top:" + safeTop + ";right:12px;width:40px;height:40px;font-size:18px;background:rgba(0,0,0,.45);color:#fff;z-index:2;", "✕");
      note = el("div", "position:absolute;top:" + safeTop + ";left:64px;right:64px;text-align:center;font-size:11px;line-height:1.4;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);z-index:1;", "🔒 المعالجة على جهازك فقط، ولا يتم رفع الصورة");
      snap.setAttribute("aria-label", "التقاط صورة");
      upload.setAttribute("aria-label", "رفع صورة بدل الكاميرا");
      close.setAttribute("aria-label", "إغلاق");
      var mbar = el(
        "div",
        "position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-around;padding:40px 24px " + safeBottom + ";background:linear-gradient(transparent,rgba(0,0,0,.65));z-index:1;",
      );
      mbar.appendChild(upload);
      mbar.appendChild(snap);
      mbar.appendChild(el("span", "width:46px;height:46px;"));
      stage.appendChild(note);
      stage.appendChild(close);
      stage.appendChild(mbar);
      stage.appendChild(fileInput);
      card.appendChild(stage);
    } else {
      var rect = btnStyle + "border-radius:10px;padding:10px 14px;font-size:13px;";
      snap = el("button", rect + "background:#fff;color:#111;", "📸 التقاط صورة");
      upload = el("button", rect + "background:#333;color:#fff;", "🖼️ ارفع صورة بدل الكاميرا");
      close = el("button", rect + "background:#333;color:#fff;margin-inline-start:auto;", "إغلاق");
      note = el("div", "width:100%;font-size:11px;opacity:.65;", "🔒 الصورة تُعالَج على جهازك فقط ولا يتم رفعها لأي مكان.");
      var bar = el("div", "display:flex;gap:8px;padding:12px;flex-wrap:wrap;align-items:center;");
      bar.appendChild(snap);
      bar.appendChild(upload);
      bar.appendChild(fileInput);
      bar.appendChild(close);
      bar.appendChild(note);
      card.appendChild(stage);
      card.appendChild(bar);
    }

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
    var last = null;
    var stopped = false;

    // Ask for a portrait stream on a portrait phone so it fills the screen without cropping much.
    function cameraConstraints() {
      var portrait = mobile && window.innerHeight > window.innerWidth;
      var constraints = {
        facingMode: "user",
        width: { ideal: portrait ? 720 : 1280 },
        height: { ideal: portrait ? 1280 : 720 },
      };
      // Match the screen's shape so the image fills it without needing a big crop.
      if (mobile) constraints.aspectRatio = { ideal: window.innerWidth / window.innerHeight };
      return constraints;
    }

    function setStatus(text) {
      status.textContent = text || "";
      status.style.display = text ? "flex" : "none";
    }

    function drawGlasses(p) {
      if (!glasses.complete || !glasses.naturalWidth) return;
      var height = p.width * (glasses.naturalHeight / glasses.naturalWidth);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.drawImage(glasses, -p.width / 2, -height / 2, p.width, height);
      ctx.restore();
    }

    // Desktop: the card takes the camera's real aspect ratio and never grows taller than the
    // viewport. Phones: the canvas covers the whole screen, so only its pixel size matters.
    function fit(w, h) {
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      if (mobile) {
        // Fill the screen only when that crops little; otherwise show the whole frame
        // rather than zooming in on the middle of it.
        var screenRatio = stage.clientWidth / Math.max(1, stage.clientHeight);
        var cropZoom = Math.max(screenRatio / (w / h), (w / h) / screenRatio);
        canvas.style.objectFit = cropZoom <= MAX_CROP_ZOOM ? "cover" : "contain";
        return;
      }
      stage.style.aspectRatio = w + " / " + h;
      card.style.maxWidth = "min(640px, calc(64vh * " + (w / h).toFixed(4) + "))";
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
      if (face) {
        last = smooth(last, placement(face, w, h, item));
        drawGlasses(last);
        setStatus("");
      } else {
        last = null;
        setStatus("وجّه وجهك نحو الكاميرا");
      }
    }

    function renderPhoto() {
      if (!photo || !landmarker) return;
      fit(photo.naturalWidth, photo.naturalHeight);
      canvas.style.objectFit = "contain";
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      landmarker.setOptions({ runningMode: "IMAGE" });
      var res = landmarker.detect(photo);
      var face = res && res.faceLandmarks && res.faceLandmarks[0];
      if (!face) return setStatus("لم نتمكن من العثور على وجه في الصورة");
      // Photos are not mirrored, so flip x back before reusing the shared maths.
      var mirrored = face.map(function (pt) { return { x: 1 - pt.x, y: pt.y }; });
      drawGlasses(placement(mirrored, canvas.width, canvas.height, item));
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
      var a = document.createElement("a");
      a.download = "try-on.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };

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
