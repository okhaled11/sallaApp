import * as THREE from "three";

const MEDIAPIPE_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

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
      if (!window.FaceLandmarker) {
        const visionModule = await import(/* @vite-ignore */ `${MEDIAPIPE_VISION_URL}/vision_bundle.mjs`);
        const { FilesetResolver, FaceLandmarker } = visionModule;
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_URL);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      }
    } catch (err) {
      console.warn("Falling back to CPU vision delegate for FaceLandmarker:", err);
      try {
        const visionModule = await import(/* @vite-ignore */ `${MEDIAPIPE_VISION_URL}/vision_bundle.mjs`);
        const { FilesetResolver, FaceLandmarker } = visionModule;
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_URL);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch (e2) {
        console.error("Failed to load FaceLandmarker:", e2);
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

    // Compute cranial scale multiplier based on temple distance
    const templeDist = Math.abs(pRightEar.x - pLeftEar.x);
    const scaleFactor = (templeDist / 0.42); // Normalizes against reference proportion

    return {
      position: facePosition,
      quaternion: faceQuaternion,
      scale: new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
      angles: {
        yaw: yawDeg,
        pitch: pitchDeg,
        roll: rollDeg,
      },
      distance: zDepth,
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
