import * as THREE from "three";

/**
 * PoseFilter provides 3D pose smoothing using:
 * - Quaternion Spherical Linear Interpolation (SLERP) for rotations, preventing gimbal lock and jitter.
 * - Vector3 Linear Interpolation (LERP) for 3D camera-space positions.
 * - Adaptive smoothing coefficient based on motion velocity.
 */
export class PoseFilter {
  constructor({ posAlpha = 0.28, rotAlpha = 0.24, scaleAlpha = 0.22 } = {}) {
    this.posAlpha = posAlpha;
    this.rotAlpha = rotAlpha;
    this.scaleAlpha = scaleAlpha;

    this.currentPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();

    this.currentQuaternion = new THREE.Quaternion();
    this.targetQuaternion = new THREE.Quaternion();

    this.currentScale = new THREE.Vector3(1, 1, 1);
    this.targetScale = new THREE.Vector3(1, 1, 1);

    this.initialized = false;
  }

  reset() {
    this.initialized = false;
  }

  update({ position, quaternion, scale }) {
    if (!position || !quaternion) return { position: this.currentPosition, quaternion: this.currentQuaternion, scale: this.currentScale };

    this.targetPosition.copy(position);
    this.targetQuaternion.copy(quaternion);
    if (scale) this.targetScale.copy(scale);

    if (!this.initialized) {
      this.currentPosition.copy(this.targetPosition);
      this.currentQuaternion.copy(this.targetQuaternion);
      this.currentScale.copy(this.targetScale);
      this.initialized = true;
      return {
        position: this.currentPosition.clone(),
        quaternion: this.currentQuaternion.clone(),
        scale: this.currentScale.clone(),
      };
    }

    // Adaptive smoothing: if user moves very quickly, increase alpha to avoid perceived lag
    const posDist = this.currentPosition.distanceTo(this.targetPosition);
    const adaptivePosAlpha = Math.min(0.85, Math.max(this.posAlpha, posDist * 0.08));

    // Lerp position
    this.currentPosition.lerp(this.targetPosition, adaptivePosAlpha);

    // Slerp quaternion
    const angleDiff = this.currentQuaternion.angleTo(this.targetQuaternion);
    const adaptiveRotAlpha = Math.min(0.82, Math.max(this.rotAlpha, angleDiff * 0.35));
    this.currentQuaternion.slerp(this.targetQuaternion, adaptiveRotAlpha);

    // Lerp scale
    this.currentScale.lerp(this.targetScale, this.scaleAlpha);

    return {
      position: this.currentPosition.clone(),
      quaternion: this.currentQuaternion.clone(),
      scale: this.currentScale.clone(),
    };
  }
}
