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

  // Face-mesh landmarks: outer eye corners (subject's right / left).
  var EYE_A = 33;
  var EYE_B = 263;
  var SMOOTHING = 0.45;

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
   * Where the glasses go for one face: centred between the eyes, sized from the
   * eye distance, tilted with the eye line. x is mirrored (selfie view).
   */
  function placement(landmarks, w, h, item) {
    var a = landmarks[EYE_A];
    var b = landmarks[EYE_B];
    var ax = (1 - a.x) * w, ay = a.y * h;
    var bx = (1 - b.x) * w, by = b.y * h;
    // Mirroring swaps which corner is on the left; order them so the angle stays small.
    if (bx < ax) {
      var tx = ax, ty = ay;
      ax = bx; ay = by; bx = tx; by = ty;
    }
    var dist = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    var angle = Math.atan2(by - ay, bx - ax);
    // Move along the face's own "down" axis so the offset follows head tilt.
    var shift = (item.offsetY || 0) * dist;
    return {
      x: (ax + bx) / 2 - Math.sin(angle) * shift,
      y: (ay + by) / 2 + Math.cos(angle) * shift,
      width: dist * (item.scale || 2.1),
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

    var overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;",
    );
    overlay.id = MODAL_ID;
    var card = el("div", "background:#111;border-radius:16px;width:100%;max-width:560px;overflow:hidden;color:#fff;position:relative;");
    var stage = el("div", "position:relative;width:100%;aspect-ratio:4/3;background:#000;");
    var canvas = el("canvas", "width:100%;height:100%;display:block;");
    var status = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:14px;", "جارٍ تجهيز الكاميرا...");
    stage.appendChild(canvas);
    stage.appendChild(status);

    var bar = el("div", "display:flex;gap:8px;padding:12px;flex-wrap:wrap;align-items:center;");
    var btnStyle = "border:0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;";
    var snap = el("button", btnStyle + "background:#fff;color:#111;", "📸 التقاط صورة");
    var upload = el("button", btnStyle + "background:#333;color:#fff;", "🖼️ ارفع صورة بدل الكاميرا");
    var close = el("button", btnStyle + "background:#333;color:#fff;margin-inline-start:auto;", "إغلاق");
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    var note = el("div", "width:100%;font-size:11px;opacity:.65;", "🔒 الصورة تُعالَج على جهازك فقط ولا يتم رفعها لأي مكان.");
    bar.appendChild(snap);
    bar.appendChild(upload);
    bar.appendChild(fileInput);
    bar.appendChild(close);
    bar.appendChild(note);

    card.appendChild(stage);
    card.appendChild(bar);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

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

    function fit(w, h) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
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
          .getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false })
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
