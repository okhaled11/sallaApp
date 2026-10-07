import * as THREE from "three";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

const WASM_SOURCES = [
  "/wasm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  "https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm",
];

const MODEL_SOURCES = [
  "/models/face_landmarker.task",
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
];

async function getVisionFileset() {
  for (const src of WASM_SOURCES) {
    try {
      return await FilesetResolver.forVisionTasks(src);
    } catch (e) {
      console.warn(`FilesetResolver failed for ${src}, trying next source...`, e);
    }
  }
  throw new Error("Unable to resolve MediaPipe vision fileset from any source");
}

/**
 * Production-grade Face Tracker using MediaPipe FaceLandmarker.
 * Converts 478 facial landmarks into full 3D camera-space transforms:
 * - Position Vector3 (x, y, z in meters)
 * - Orientation Quaternion (Yaw, Pitch, Roll)
 * - Cranial Scale Factor
 * - Metric Face Anchors (nose bridge, forehead, ears, chin)
 */
export class FaceTracker {
  constructor() {
    this.landmarker = null;
    this.loading = false;
    this.lastVideoTime = -1;
  }

  async initialize() {
    if (this.landmarker) return this.landmarker;
    if (this.loading) {
      while (this.loading) await new Promise((r) => setTimeout(r, 50));
      return this.landmarker;
    }

    this.loading = true;
    try {
      const fileset = await getVisionFileset();
      const modelAssetPath = MODEL_SOURCES[0];

      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      } catch (gpuErr) {
        console.warn("Falling back to CPU vision delegate for FaceLandmarker:", gpuErr);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
    } catch (err) {
      console.error("Failed to load FaceLandmarker:", err);
      // Attempt remote model fallback if local model failed
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_SOURCES[1]);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_SOURCES[1], delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch (fallbackErr) {
        console.error("All FaceLandmarker fallbacks failed:", fallbackErr);
      }
    } finally {
      this.loading = false;
    }
    return this.landmarker;
  }

  /**
   * Process a video frame and extract 3D pose data
   */
  detect(video, camera) {
    if (!this.landmarker || !video || video.readyState < 2) return null;

    const now = performance.now();
    let result = null;
    try {
      if (video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime;
        result = this.landmarker.detectForVideo(video, now);
      }
    } catch (e) {
      return null;
    }

    if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }

    const lm = result.faceLandmarks[0];
    const W = video.videoWidth || 640;
    const H = video.videoHeight || 480;

    // Key anatomical landmarks (MediaPipe index):
    // 168: Nose bridge / between eyes
    // 1: Nose tip
    // 33: Outer left eye corner
    // 263: Outer right eye corner
    // 133: Inner left eye
    // 362: Inner right eye
    // 127, 356: Temples
    // 10: Forehead top
    // 152: Chin bottom
    // 234: Left ear tragus
    // 454: Right ear tragus

    const pLeftEye = lm[33];
    const pRightEye = lm[263];
    const pNoseBridge = lm[168] || lm[6] || lm[1];
    const pNoseTip = lm[1];
    const pForehead = lm[10];
    const pChin = lm[152];
    const pLeftEar = lm[234];
    const pRightEar = lm[454];

    // Inter-pupillary pixel distance (approx 63mm in reality)
    const dx = (pRightEye.x - pLeftEye.x) * W;
    const dy = (pRightEye.y - pLeftEye.y) * H;
    const eyeDistPx = Math.sqrt(dx * dx + dy * dy);
    if (eyeDistPx < 5) return null;

    // Approximate camera focal length from vertical FOV
    const fovRad = (camera.fov * Math.PI) / 180;
    const f = (H / 2) / Math.tan(fovRad / 2);

    // Compute metric depth (Z) based on canonical human inter-ocular distance (0.063m)
    const REAL_EYE_DIST_M = 0.064;
    const zDepth = (f * REAL_EYE_DIST_M) / eyeDistPx;

    // Compute 3D Camera-Space X and Y for the nose bridge
    // Note: Video is mirrored (Snapchat selfie style), so X is inverted in display
    const bridgePixelX = (1.0 - pNoseBridge.x) * W; // Inverted for mirror
    const bridgePixelY = pNoseBridge.y * H;

    const xPos = ((bridgePixelX - W / 2) * zDepth) / f;
    const yPos = -((bridgePixelY - H / 2) * zDepth) / f;

    const facePosition = new THREE.Vector3(xPos, yPos, -zDepth);

    // Compute 3D Orientation Basis (X, Y, Z axes of the face)
    // 1. Right vector (from left eye to right eye in mirrored coordinate space)
    const vRight = new THREE.Vector3(
      -(pRightEye.x - pLeftEye.x),
      -(pRightEye.y - pLeftEye.y),
      (pRightEye.z - pLeftEye.z) * 1.5
    ).normalize();

    // 2. Up vector (from chin to forehead)
    const vUp = new THREE.Vector3(
      -(pForehead.x - pChin.x),
      -(pForehead.y - pChin.y),
      (pForehead.z - pChin.z) * 1.5
    ).normalize();

    // 3. Normal / Forward vector (pointing out from face)
    const vForward = new THREE.Vector3().crossVectors(vRight, vUp).normalize();
    // Re-orthogonalize Up
    vUp.crossVectors(vForward, vRight).normalize();

    // Form 3D rotation matrix
    const rotMatrix = new THREE.Matrix4().makeBasis(vRight, vUp, vForward);
    const faceQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Compute Euler angles for HUD / Debugging (in degrees)
    const euler = new THREE.Euler().setFromQuaternion(faceQuaternion, "YXZ");
    const yawDeg = THREE.MathUtils.radToDeg(euler.y);
    const pitchDeg = THREE.MathUtils.radToDeg(euler.x);
    const rollDeg = THREE.MathUtils.radToDeg(euler.z);

    // Biometric Cranial & Temple Analysis (Snapchat-style biometric head scaling):
    // Analyze physical skull width across temples (127 & 356) and ears (234 & 454)
    const pLeftTemple = lm[127] || pLeftEar;
    const pRightTemple = lm[356] || pRightEar;
    const templeDx = (pRightTemple.x - pLeftTemple.x) * W;
    const templeDy = (pRightTemple.y - pLeftTemple.y) * H;
    const templeDistPx = Math.sqrt(templeDx * templeDx + templeDy * templeDy);

    // Metric skull width at distance zDepth using camera focal length f:
    // Average adult human cranial width across temples is ~140mm (0.140m)
    const measuredHeadWidthM = (templeDistPx * zDepth) / f;
    const cranialScaleFactor = Math.max(0.75, Math.min(1.4, measuredHeadWidthM / 0.140));
    const headWidthCm = Math.round(measuredHeadWidthM * 100);

    return {
      position: facePosition,
      quaternion: faceQuaternion,
      scale: new THREE.Vector3(cranialScaleFactor, cranialScaleFactor, cranialScaleFactor),
      angles: {
        yaw: yawDeg,
        pitch: pitchDeg,
        roll: rollDeg,
      },
      distance: zDepth,
      headWidthCm: headWidthCm,
      landmarks: {
        noseBridge: pNoseBridge,
        noseTip: pNoseTip,
        forehead: pForehead,
        chin: pChin,
        leftEar: pLeftEar,
        rightEar: pRightEar,
      },
    };
  }
}
