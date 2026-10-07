/**
 * MediaPipe FaceLandmarker for static images.
 * Detects 478 biometric landmarks on any uploaded photo or image URL,
 * extracting anatomical points for cosmetics (lips, blush, eyeshadow, eyeliner)
 * and wearables (hat, glasses, earrings, necklace).
 */

const MEDIAPIPE_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerInstance = null;
let landmarkerPromise = null;

export async function getImageLandmarker() {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
  ) {
    return null;
  }
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    try {
      const visionModule = await import(/* @vite-ignore */ `${MEDIAPIPE_VISION_URL}/vision_bundle.mjs`);
      const { FilesetResolver, FaceLandmarker } = visionModule;
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_URL);
      try {
        landmarkerInstance = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate: "GPU" },
          runningMode: "IMAGE",
          numFaces: 1,
        });
      } catch (gpuErr) {
        console.warn("GPU failed for image landmarker, using CPU fallback:", gpuErr);
        landmarkerInstance = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate: "CPU" },
          runningMode: "IMAGE",
          numFaces: 1,
        });
      }
      return landmarkerInstance;
    } catch (e) {
      console.error("Failed to initialize image FaceLandmarker:", e);
      return null;
    } finally {
      landmarkerPromise = null;
    }
  })();

  return landmarkerPromise;
}

// MediaPipe landmark indices
export const LANDMARK_INDICES = {
  // Eyes
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  noseBridge: 168,
  forehead: 10,
  chin: 152,
  leftEar: 234,
  rightEar: 454,
  leftTemple: 127,
  rightTemple: 356,
  leftCheek: 50,
  rightCheek: 280,
  // Lips
  lipsOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
  lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  // Eyeshadow (eyelid crease)
  leftEyelid: [33, 160, 159, 158, 157, 173, 133, 243, 224, 223, 222],
  rightEyelid: [263, 387, 386, 385, 384, 398, 362, 463, 444, 443, 442],
  // Eyeliner (upper lash margin)
  leftEyeliner: [133, 173, 157, 158, 159, 160, 161, 246, 33, 130],
  rightEyeliner: [362, 398, 384, 385, 386, 387, 388, 466, 263, 359],
};

function dist(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Extracts normalized and pixel facial measurements from raw 478 landmarks.
 */
export function extractFaceData(rawLandmarks, width, height) {
  if (!rawLandmarks || rawLandmarks.length === 0) return null;

  const toPx = (lm) => ({ x: lm.x * width, y: lm.y * height, z: lm.z });
  const getPt = (idx) => toPx(rawLandmarks[idx]);

  const leftEye = getPt(LANDMARK_INDICES.leftEyeOuter);
  const rightEye = getPt(LANDMARK_INDICES.rightEyeOuter);
  const leftInner = getPt(LANDMARK_INDICES.leftEyeInner);
  const rightInner = getPt(LANDMARK_INDICES.rightEyeInner);
  const eyeCenter = { x: (leftInner.x + rightInner.x) / 2, y: (leftInner.y + rightInner.y) / 2 };
  const eyeDist = dist(leftEye, rightEye);

  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

  const templeDist = dist(getPt(LANDMARK_INDICES.leftTemple), getPt(LANDMARK_INDICES.rightTemple));
  const cranialWidth = templeDist > eyeDist ? templeDist : eyeDist * 2.1;

  const forehead = getPt(LANDMARK_INDICES.forehead);
  const chin = getPt(LANDMARK_INDICES.chin);
  const leftEar = getPt(LANDMARK_INDICES.leftEar);
  const rightEar = getPt(LANDMARK_INDICES.rightEar);
  const leftCheek = getPt(LANDMARK_INDICES.leftCheek);
  const rightCheek = getPt(LANDMARK_INDICES.rightCheek);

  const lipsOuter = LANDMARK_INDICES.lipsOuter.map(getPt);
  const lipsInner = LANDMARK_INDICES.lipsInner.map(getPt);
  const lipsCenter = getPt(17); // Center of bottom lip edge

  const leftEyelid = LANDMARK_INDICES.leftEyelid.map(getPt);
  const rightEyelid = LANDMARK_INDICES.rightEyelid.map(getPt);
  const leftEyeliner = LANDMARK_INDICES.leftEyeliner.map(getPt);
  const rightEyeliner = LANDMARK_INDICES.rightEyeliner.map(getPt);

  return {
    raw: rawLandmarks,
    width,
    height,
    eyeCenter,
    eyeDist,
    angle,
    cranialWidth,
    forehead,
    chin,
    leftEar,
    rightEar,
    leftCheek,
    rightCheek,
    lipsCenter,
    lipsOuter,
    lipsInner,
    leftEyelid,
    rightEyelid,
    leftEyeliner,
    rightEyeliner,
  };
}

/**
 * Loads an image (URL or blob) and detects facial landmarks.
 */
export async function detectFaceInImage(imageSource) {
  if (typeof window === "undefined" || !imageSource) {
    return { found: false, error: "Environment or image source missing" };
  }

  const landmarker = await getImageLandmarker();
  if (!landmarker) {
    return { found: false, error: "Face detector unavailable" };
  }

  let imgEl = null;
  if (typeof imageSource === "string") {
    imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      imgEl.onload = resolve;
      imgEl.onerror = () => reject(new Error("Failed to load image"));
      imgEl.src = imageSource;
    });
  } else if (imageSource instanceof HTMLImageElement) {
    imgEl = imageSource;
    if (!imgEl.complete) {
      await new Promise((resolve) => {
        imgEl.onload = resolve;
      });
    }
  } else {
    imgEl = imageSource;
  }

  const width = imgEl.naturalWidth || imgEl.videoWidth || imgEl.width || 640;
  const height = imgEl.naturalHeight || imgEl.videoHeight || imgEl.height || 480;

  try {
    const result = landmarker.detect(imgEl);
    if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
      return { found: false, width, height, message: "No face detected in image" };
    }

    const faceData = extractFaceData(result.faceLandmarks[0], width, height);
    return {
      found: true,
      width,
      height,
      faceData,
      facesCount: result.faceLandmarks.length,
    };
  } catch (err) {
    console.warn("Detection error on image:", err);
    return { found: false, width, height, error: err.message };
  }
}
