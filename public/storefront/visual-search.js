/**
 * Salla Visual Search (storefront script)
 *
 * Adds a floating camera button to the store. The shopper takes or picks a photo
 * of something they like and the store shows the closest products.
 *
 * The photo is downsized in the browser and sent once to the app's
 * /api/visual-search endpoint; it is not stored.
 *
 *   <script src="https://YOUR-APP/storefront/visual-search.js" async></script>
 */
(function () {
  "use strict";

  var APP_ORIGIN = "";
  try {
    var selfScript = document.currentScript;
    if (selfScript && selfScript.src) APP_ORIGIN = new URL(selfScript.src).origin;
  } catch (e) {}
  if (!APP_ORIGIN) return;

  var ROOT_ID = "salla-vsearch-root";
  if (document.getElementById(ROOT_ID)) return;

  var BRAND = "#0d1f1b";
  var ACCENT = "#73fcd7";
  var MAX_SIDE = 768;
  var CAMERA_SVG =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.1a2 2 0 0 0 1.6-.8l.6-.9A2 2 0 0 1 11.5 3.5h1a2 2 0 0 1 1.7.8l.6.9a2 2 0 0 0 1.6.8h1.1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.3"/></svg>';

  function el(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text) node.textContent = text;
    return node;
  }

  function safeUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url) ? url : "";
  }

  // Downscale the photo so the upload is small and fast on mobile data.
  function fileToDataUrl(file) {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bitmap) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.8);
    });
  }

  var root = el("div");
  root.id = ROOT_ID;
  root.setAttribute("dir", "rtl");

  var fab = el(
    "button",
    "position:fixed;bottom:20px;left:20px;z-index:99990;display:flex;align-items:center;gap:8px;" +
      "border:0;border-radius:999px;padding:12px 18px;cursor:pointer;font:700 14px/1 inherit;" +
      "background:" + ACCENT + ";color:" + BRAND + ";box-shadow:0 8px 24px rgba(0,0,0,.25);",
  );
  fab.type = "button";
  fab.setAttribute("aria-label", "ابحث بالصورة");
  fab.innerHTML = CAMERA_SVG + "<span>ابحث بالصورة</span>";

  var overlay = el(
    "div",
    "position:fixed;inset:0;z-index:99991;display:none;align-items:flex-end;justify-content:center;" +
      "background:rgba(0,0,0,.6);",
  );
  var sheet = el(
    "div",
    "width:100%;max-width:520px;max-height:90vh;overflow:auto;background:#fff;color:#1c2024;" +
      "border-radius:22px 22px 0 0;padding:20px;box-sizing:border-box;font-family:inherit;",
  );
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "البحث بالصورة");

  var head = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;");
  head.appendChild(el("strong", "font-size:18px;", "ابحث بالصورة"));
  var closeBtn = el("button", "border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#555;", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "إغلاق");
  head.appendChild(closeBtn);

  var hint = el(
    "p",
    "margin:0 0 14px;color:#666;font-size:14px;line-height:1.7;",
    "صوّر أو اختر صورة لما يعجبك، وسنعرض لك أقرب المنتجات في المتجر.",
  );

  var actions = el("div", "display:grid;grid-template-columns:1fr 1fr;gap:10px;");
  function actionBtn(label, primary) {
    var b = el(
      "button",
      "border-radius:14px;padding:14px;font:700 15px/1 inherit;cursor:pointer;" +
        (primary
          ? "border:0;background:" + BRAND + ";color:" + ACCENT + ";"
          : "border:1px solid #d5dadf;background:#fff;color:#1c2024;"),
      label,
    );
    b.type = "button";
    return b;
  }
  var cameraBtn = actionBtn("التقاط صورة", true);
  var galleryBtn = actionBtn("من المعرض", false);
  actions.appendChild(cameraBtn);
  actions.appendChild(galleryBtn);

  function fileInput(capture) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.style.display = "none";
    return input;
  }
  var cameraInput = fileInput(true);
  var galleryInput = fileInput(false);

  var preview = el(
    "img",
    "display:none;width:100%;max-height:220px;object-fit:contain;border-radius:14px;background:#f3f5f6;margin-top:14px;",
  );
  preview.alt = "الصورة المختارة";
  var status = el("p", "margin:14px 0 0;color:#444;font-size:14px;line-height:1.7;");
  status.setAttribute("aria-live", "polite");
  var results = el("div", "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;");

  sheet.appendChild(head);
  sheet.appendChild(hint);
  sheet.appendChild(actions);
  sheet.appendChild(cameraInput);
  sheet.appendChild(galleryInput);
  sheet.appendChild(preview);
  sheet.appendChild(status);
  sheet.appendChild(results);
  overlay.appendChild(sheet);
  root.appendChild(fab);
  root.appendChild(overlay);

  function open() {
    overlay.style.display = "flex";
    document.documentElement.style.overflow = "hidden";
  }
  function close() {
    overlay.style.display = "none";
    document.documentElement.style.overflow = "";
  }
  fab.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.style.display === "flex") close();
  });
  cameraBtn.addEventListener("click", function () {
    cameraInput.click();
  });
  galleryBtn.addEventListener("click", function () {
    galleryInput.click();
  });

  function card(item) {
    var link = el(
      "a",
      "display:block;text-decoration:none;color:inherit;border:1px solid #e5e8eb;border-radius:14px;overflow:hidden;background:#fff;",
    );
    var href = safeUrl(item.url);
    if (href) link.href = href;
    var img = el("img", "width:100%;aspect-ratio:1;object-fit:cover;background:#f3f5f6;display:block;");
    var imgSrc = safeUrl(item.image);
    if (imgSrc) img.src = imgSrc;
    img.alt = item.name || "";
    img.loading = "lazy";
    var body = el("div", "padding:10px;");
    body.appendChild(el("div", "font-size:13px;font-weight:700;line-height:1.5;", item.name || ""));
    if (item.price != null) {
      var price = el("div", "margin-top:4px;font-size:13px;color:#0a7a5f;font-weight:700;");
      price.textContent = item.price + " " + (item.currency || "");
      body.appendChild(price);
    }
    if (item.reason) body.appendChild(el("div", "margin-top:4px;font-size:12px;color:#777;", item.reason));
    link.appendChild(img);
    link.appendChild(body);
    return link;
  }

  function setBusy(busy) {
    cameraBtn.disabled = busy;
    galleryBtn.disabled = busy;
    cameraBtn.style.opacity = galleryBtn.style.opacity = busy ? "0.5" : "1";
  }

  function search(file) {
    if (!file) return;
    results.innerHTML = "";
    status.textContent = "جارٍ البحث عن منتجات مشابهة…";
    setBusy(true);
    fileToDataUrl(file)
      .then(function (dataUrl) {
        preview.src = dataUrl;
        preview.style.display = "block";
        return fetch(APP_ORIGIN + "/api/scan-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "vsearch", image: dataUrl }),
        });
      })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (json) {
        if (!json.success) {
          status.textContent = json.error || "تعذّر البحث. حاول مرة أخرى";
          return;
        }
        var matches = (json.data && json.data.matches) || [];
        status.textContent = matches.length
          ? (json.data.description ? json.data.description + " — " : "") + "هذه أقرب المنتجات:"
          : "لم نجد منتجات مشابهة لهذه الصورة. جرّب صورة أوضح للمنتج.";
        matches.forEach(function (item) {
          results.appendChild(card(item));
        });
      })
      .catch(function () {
        status.textContent = "تعذّرت قراءة الصورة أو الاتصال بالمتجر";
      })
      .then(function () {
        setBusy(false);
      });
  }

  [cameraInput, galleryInput].forEach(function (input) {
    input.addEventListener("change", function () {
      search(input.files && input.files[0]);
      input.value = "";
    });
  });

  function mount() {
    if (document.body && !document.getElementById(ROOT_ID)) document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
