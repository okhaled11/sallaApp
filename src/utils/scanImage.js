/**
 * Downscale a photo from the phone camera to a JPEG data URL small enough to
 * upload quickly (phone photos are often 4-10 MB).
 */
export async function fileToScanDataUrl(file, maxSide = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
