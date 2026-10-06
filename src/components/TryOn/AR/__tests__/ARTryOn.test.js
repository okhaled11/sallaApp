import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PoseFilter } from "../PoseFilter.js";
import { OccluderManager } from "../OccluderManager.js";
import {
  createWayfarerSunglasses,
  createAviatorSunglasses,
  createCapHat,
  createEarrings,
  createFaceMask,
  AR_PRODUCT_CATALOG,
} from "../AssetFactory.js";

describe("PoseFilter (3D Pose Smoothing)", () => {
  it("initializes on first update and returns initial position and quaternion", () => {
    const filter = new PoseFilter();
    const pos = new THREE.Vector3(0, 0, -0.5);
    const quat = new THREE.Quaternion(0, 0, 0, 1);

    const res = filter.update({ position: pos, quaternion: quat });
    expect(res.position.x).toBe(0);
    expect(res.position.z).toBe(-0.5);
    expect(res.quaternion.w).toBe(1);
  });

  it("smooths position changes using Lerp without sudden jumps", () => {
    const filter = new PoseFilter({ posAlpha: 0.5 });
    filter.update({ position: new THREE.Vector3(0, 0, 0), quaternion: new THREE.Quaternion() });

    const smoothed = filter.update({ position: new THREE.Vector3(10, 0, 0), quaternion: new THREE.Quaternion() });
    // Should be smoothly interpolated between 0 and 10
    expect(smoothed.position.x).toBeGreaterThan(0);
    expect(smoothed.position.x).toBeLessThan(10);
  });

  it("smooths 3D rotation changes using Quaternion SLERP", () => {
    const filter = new PoseFilter({ rotAlpha: 0.5 });
    const q1 = new THREE.Quaternion();
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    filter.update({ position: new THREE.Vector3(), quaternion: q1 });
    const smoothed = filter.update({ position: new THREE.Vector3(), quaternion: q2 });

    expect(smoothed.quaternion.y).toBeGreaterThan(0);
    expect(smoothed.quaternion.y).toBeLessThan(q2.y);
  });
});

describe("OccluderManager (Head Depth Mask Occlusion)", () => {
  it("builds an anatomical 3D head occluder with colorWrite=false and depthWrite=true", () => {
    const manager = new OccluderManager();
    const group = manager.getMesh();

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThanOrEqual(2);

    // Verify all child meshes use depth-masking
    group.traverse((child) => {
      if (child.isMesh) {
        expect(child.material.colorWrite).toBe(false);
        expect(child.material.depthWrite).toBe(true);
        expect(child.renderOrder).toBe(0); // Must render before product
      }
    });
  });

  it("updates occluder position and rotation with head movements", () => {
    const manager = new OccluderManager();
    const newPos = new THREE.Vector3(0.05, -0.02, -0.45);
    const newQuat = new THREE.Quaternion(0, 0.707, 0, 0.707);

    manager.update({ position: newPos, quaternion: newQuat });
    expect(manager.getMesh().position.x).toBe(0.05);
    expect(manager.getMesh().quaternion.y).toBeCloseTo(0.707);
  });
});

describe("AssetFactory (3D AR Models)", () => {
  it("creates Wayfarer sunglasses with front frame, lenses, and temple arms extending along -Z", () => {
    const sunglasses = createWayfarerSunglasses();
    expect(sunglasses).toBeInstanceOf(THREE.Group);

    // Should contain lenses, rims, bridge, hinges, and 2 temple arms
    expect(sunglasses.children.length).toBeGreaterThanOrEqual(6);

    let hasNegativeZDepth = false;
    sunglasses.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        const bbox = child.geometry.boundingBox;
        if (bbox && bbox.min.z < -0.05) {
          hasNegativeZDepth = true;
        }
      }
    });
    expect(hasNegativeZDepth).toBe(true);
  });

  it("creates Aviator sunglasses with PBR wire materials", () => {
    const aviator = createAviatorSunglasses();
    expect(aviator).toBeInstanceOf(THREE.Group);
    expect(aviator.children.length).toBeGreaterThanOrEqual(4);
  });

  it("creates Baseball Cap with forward-projecting 3D brim", () => {
    const cap = createCapHat();
    expect(cap).toBeInstanceOf(THREE.Group);
    expect(cap.children.length).toBeGreaterThanOrEqual(2);
  });

  it("creates Luxury Earrings with left and right anchored pairs", () => {
    const earrings = createEarrings();
    expect(earrings).toBeInstanceOf(THREE.Group);
    expect(earrings.children.length).toBe(2);
  });

  it("creates Face Mask following facial contours", () => {
    const mask = createFaceMask();
    expect(mask).toBeInstanceOf(THREE.Group);
    expect(mask.children.length).toBe(1);
  });

  it("provides calibrated default anchors for all catalog products", () => {
    for (const prod of AR_PRODUCT_CATALOG) {
      expect(prod.id).toBeDefined();
      expect(prod.anchor).toBeDefined();
      expect(prod.defaultOffset).toBeDefined();
      expect(typeof prod.defaultScale).toBe("number");
      expect(typeof prod.factory).toBe("function");
    }
  });
});
