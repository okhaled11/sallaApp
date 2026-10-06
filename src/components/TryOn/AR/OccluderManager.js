import * as THREE from "three";

/**
 * OccluderManager builds a 3D head/face occluder mesh.
 * It writes directly to the WebGL depth buffer (Z-buffer) with color writing disabled:
 *   colorWrite: false, depthWrite: true
 *
 * This ensures that when the user rotates their head, parts of the 3D product
 * (such as sunglasses temple arms, cap back, or earring studs) that move behind
 * the skull or ears are naturally hidden (occluded) by the user's real head in the video.
 */
export class OccluderManager {
  constructor() {
    this.mesh = this.buildHeadOccluder();
  }

  buildHeadOccluder() {
    const group = new THREE.Group();
    group.name = "HeadOccluderGroup";

    // Depth-mask material: invisible on screen, but writes to the Z-buffer
    const occluderMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });

    // 1. Cranial Head Sphere / Ellipsoid (Skull, temples, ears, neck)
    // Canonical human head is approximately 15.5cm wide, 21.5cm high, 19cm deep
    const headGeom = new THREE.SphereGeometry(1, 32, 24);
    headGeom.scale(0.082, 0.115, 0.098); // In meters (Three.js metric units)
    const headMesh = new THREE.Mesh(headGeom, occluderMaterial);
    headMesh.position.set(0, -0.015, -0.045); // Offset so origin aligns with nose bridge
    headMesh.renderOrder = 0;
    group.add(headMesh);

    // 2. Frontal Facial Mask (Cheekbones, nose bridge, jawline)
    const faceMaskGeom = new THREE.CylinderGeometry(0.076, 0.065, 0.14, 24, 1, false, 0, Math.PI);
    faceMaskGeom.rotateY(-Math.PI / 2);
    const faceMaskMesh = new THREE.Mesh(faceMaskGeom, occluderMaterial);
    faceMaskMesh.position.set(0, -0.03, -0.01);
    faceMaskMesh.renderOrder = 0;
    group.add(faceMaskMesh);

    // 3. Nose Bridge Ridge (ensures glasses bridge rests properly on the nose)
    const noseGeom = new THREE.ConeGeometry(0.018, 0.045, 12);
    noseGeom.rotateX(Math.PI / 3);
    const noseMesh = new THREE.Mesh(noseGeom, occluderMaterial);
    noseMesh.position.set(0, -0.018, 0.016);
    noseMesh.renderOrder = 0;
    group.add(noseMesh);

    return group;
  }

  getMesh() {
    return this.mesh;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  update({ position, quaternion, scale }) {
    if (position) this.mesh.position.copy(position);
    if (quaternion) this.mesh.quaternion.copy(quaternion);
    if (scale) this.mesh.scale.copy(scale);
  }
}
