import * as THREE from "three";
import { OccluderManager } from "./OccluderManager.js";
import { PoseFilter } from "./PoseFilter.js";

/**
 * ARScene manages the Three.js WebGL rendering pipeline,
 * camera calibration, studio lighting, occluder depth mask,
 * and the smoothed 3D product anchor group.
 */
export class ARScene {
  constructor(canvasElement) {
    this.canvas = canvasElement;

    // 1. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 2. Three.js Scene
    this.scene = new THREE.Scene();

    // 3. Perspective Camera (Matches standard mobile/webcam FOV)
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.camera);

    // 4. Studio Lighting Rig for realistic PBR materials
    this.setupLighting();

    // 5. Head Occluder (Z-Buffer Depth Mask)
    this.occluderManager = new OccluderManager();
    this.scene.add(this.occluderManager.getMesh());

    // 6. Smoothed 3D Pose Filter
    this.poseFilter = new PoseFilter();

    // 7. Product Anchor Group (receives head position + rotation)
    this.faceAnchorGroup = new THREE.Group();
    this.faceAnchorGroup.name = "FaceAnchorGroup";
    this.scene.add(this.faceAnchorGroup);

    // 8. Calibration Pivot (receives manual user offsets)
    this.calibrationPivot = new THREE.Group();
    this.calibrationPivot.name = "CalibrationPivot";
    this.faceAnchorGroup.add(this.calibrationPivot);

    this.currentProductMesh = null;
    this.calibration = {
      positionOffset: { x: 0, y: 0, z: 0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      scale: 1.0,
    };

    this.isTracking = false;
  }

  setupLighting() {
    // Soft ambient illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    // Key Light (warm studio softbox from upper front-right)
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.2);
    keyLight.position.set(0.6, 1.2, 0.8);
    this.scene.add(keyLight);

    // Fill Light (cool fill from upper front-left)
    const fillLight = new THREE.DirectionalLight(0xdce7ff, 1.2);
    fillLight.position.set(-0.7, 0.8, 0.6);
    this.scene.add(fillLight);

    // Rim / Backlight for crisp edges and specular highlights
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
    rimLight.position.set(0, -0.8, -0.6);
    this.scene.add(rimLight);
  }

  resize(width, height) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setProductMesh(mesh, defaultOffset = {}, defaultRotation = {}, defaultScale = 1.0) {
    if (this.currentProductMesh) {
      this.calibrationPivot.remove(this.currentProductMesh);
      this.currentProductMesh = null;
    }

    if (mesh) {
      this.currentProductMesh = mesh;
      this.currentProductMesh.renderOrder = 1; // Renders after the occluder
      this.calibrationPivot.add(this.currentProductMesh);

      // Set initial defaults
      this.calibration = {
        positionOffset: { x: defaultOffset.x || 0, y: defaultOffset.y || 0, z: defaultOffset.z || 0 },
        rotationOffset: { x: defaultRotation.x || 0, y: defaultRotation.y || 0, z: defaultRotation.z || 0 },
        scale: defaultScale || 1.0,
      };
      this.applyCalibration();
    }
  }

  updateCalibration(patch) {
    if (patch.positionOffset) Object.assign(this.calibration.positionOffset, patch.positionOffset);
    if (patch.rotationOffset) Object.assign(this.calibration.rotationOffset, patch.rotationOffset);
    if (patch.scale !== undefined) this.calibration.scale = patch.scale;
    this.applyCalibration();
  }

  applyCalibration() {
    const { positionOffset, rotationOffset, scale } = this.calibration;
    this.calibrationPivot.position.set(positionOffset.x, positionOffset.y, positionOffset.z);
    this.calibrationPivot.rotation.set(rotationOffset.x, rotationOffset.y, rotationOffset.z);
    this.calibrationPivot.scale.set(scale, scale, scale);
  }

  setOcclusionEnabled(enabled) {
    this.occluderManager.setVisible(enabled);
  }

  updatePose(poseData) {
    if (!poseData) {
      this.isTracking = false;
      this.faceAnchorGroup.visible = false;
      this.occluderManager.setVisible(false);
      this.poseFilter.reset();
      return;
    }

    this.isTracking = true;
    this.faceAnchorGroup.visible = true;

    // Apply smoothing filter (Quaternion SLERP + Vector3 LERP)
    const smoothed = this.poseFilter.update(poseData);

    // Apply smoothed transform to both the face anchor and head occluder
    this.faceAnchorGroup.position.copy(smoothed.position);
    this.faceAnchorGroup.quaternion.copy(smoothed.quaternion);

    // Update head occluder so it matches head movements and depth
    this.occluderManager.update({
      position: smoothed.position,
      quaternion: smoothed.quaternion,
      scale: smoothed.scale,
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Captures high-res photo combining video canvas and WebGL 3D render
   */
  captureCombinedPhoto(videoElement) {
    const w = videoElement.videoWidth || 1280;
    const h = videoElement.videoHeight || 720;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ctx = exportCanvas.getContext("2d");

    // 1. Draw mirrored video frame
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, w, h);
    ctx.restore();

    // 2. Draw WebGL 3D render layer
    this.render();
    ctx.drawImage(this.canvas, 0, 0, w, h);

    return exportCanvas.toDataURL("image/png");
  }

  dispose() {
    this.renderer.dispose();
  }
}
