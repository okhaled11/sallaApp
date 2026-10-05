/**
 * Prepares a merchant's overlay image (e.g. glasses) for the storefront:
 * checks it is transparent, trims empty borders so it centres on the eyes, and
 * shrinks it until it fits the server's size limit.
 */

export const MAX_IMAGE_CHARS = 150 * 1024;
const MAX_WIDTH = 480;
const ALPHA_VISIBLE = 16;

/**
 * Bounding box of the visible (non-transparent) pixels in RGBA data.
 *
 * @returns {{ x: number, y: number, width: number, height: number, hasTransparency: boolean } | null}
 *   null when the image is fully transparent.
 */
export function measureVisibleArea(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let hasTransparency = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 255) hasTransparency = true;
      if (alpha < ALPHA_VISIBLE) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, hasTransparency };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة الصورة"));
    };
    img.src = url;
  });
}

function draw(source, sx, sy, sw, sh, outWidth) {
  const outHeight = Math.max(1, Math.round((sh / sw) * outWidth));
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  canvas.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
  return canvas;
}

/**
 * @param {File} file
 * @returns {Promise<{ success: true, image: string } | { success: false, error: string }>}
 */
export async function fileToOverlayDataUrl(file) {
  if (!file || !/^image\/(png|webp)$/.test(file.type)) {
    return { success: false, error: "ارفع صورة PNG أو WebP بخلفية شفافة" };
  }
  try {
    const img = await loadImage(file);
    const probe = draw(img, 0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth);
    const { width, height } = probe;
    const pixels = probe.getContext("2d").getImageData(0, 0, width, height).data;
    const area = measureVisibleArea(pixels, width, height);
    if (!area) return { success: false, error: "الصورة فارغة تماماً" };
    if (!area.hasTransparency) {
      return { success: false, error: "الصورة بلا خلفية شفافة. استخدم صورة PNG بعد إزالة الخلفية." };
    }

    let outWidth = Math.min(MAX_WIDTH, area.width);
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = draw(img, area.x, area.y, area.width, area.height, outWidth);
      let image = canvas.toDataURL("image/webp", 0.9);
      if (!image.startsWith("data:image/webp")) image = canvas.toDataURL("image/png");
      if (image.length <= MAX_IMAGE_CHARS) return { success: true, image };
      outWidth = Math.round(outWidth * 0.75);
    }
    return { success: false, error: "حجم الصورة كبير جداً حتى بعد التصغير" };
  } catch (error) {
    return { success: false, error: error.message || "تعذّر معالجة الصورة" };
  }
}
