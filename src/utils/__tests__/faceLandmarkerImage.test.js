import { describe, it, expect } from "vitest";
import {
  extractFaceData,
  detectFaceInImage,
  LANDMARK_INDICES,
} from "../faceLandmarkerImage.js";

describe("faceLandmarkerImage", () => {
  describe("LANDMARK_INDICES", () => {
    it("defines essential landmark indices for AR makeup and wearables", () => {
      expect(LANDMARK_INDICES.leftCheek).toBe(50);
      expect(LANDMARK_INDICES.rightCheek).toBe(280);
      expect(LANDMARK_INDICES.forehead).toBe(10);
      expect(LANDMARK_INDICES.chin).toBe(152);
      expect(LANDMARK_INDICES.lipsOuter.length).toBeGreaterThan(15);
      expect(LANDMARK_INDICES.lipsInner.length).toBeGreaterThan(15);
      expect(LANDMARK_INDICES.leftEyelid.length).toBeGreaterThan(5);
      expect(LANDMARK_INDICES.rightEyelid.length).toBeGreaterThan(5);
      expect(LANDMARK_INDICES.leftEyeliner.length).toBeGreaterThan(5);
      expect(LANDMARK_INDICES.rightEyeliner.length).toBeGreaterThan(5);
    });
  });

  describe("extractFaceData", () => {
    it("returns null for empty or missing landmarks", () => {
      expect(extractFaceData(null, 500, 500)).toBeNull();
      expect(extractFaceData([], 500, 500)).toBeNull();
    });

    it("accurately converts normalized 478 points into pixel coordinates", () => {
      // Mock 478 landmarks with dummy positions
      const mockLandmarks = Array.from({ length: 478 }, (_, i) => ({
        x: 0.5 + (i % 10) * 0.01,
        y: 0.4 + (i % 10) * 0.01,
        z: 0,
      }));

      // Set distinct positions for key landmarks
      mockLandmarks[LANDMARK_INDICES.leftEyeOuter] = { x: 0.35, y: 0.38, z: 0 };
      mockLandmarks[LANDMARK_INDICES.rightEyeOuter] = { x: 0.65, y: 0.38, z: 0 };
      mockLandmarks[LANDMARK_INDICES.leftEyeInner] = { x: 0.45, y: 0.38, z: 0 };
      mockLandmarks[LANDMARK_INDICES.rightEyeInner] = { x: 0.55, y: 0.38, z: 0 };
      mockLandmarks[LANDMARK_INDICES.forehead] = { x: 0.5, y: 0.15, z: 0 };
      mockLandmarks[LANDMARK_INDICES.chin] = { x: 0.5, y: 0.85, z: 0 };
      mockLandmarks[LANDMARK_INDICES.leftCheek] = { x: 0.32, y: 0.5, z: 0 };
      mockLandmarks[LANDMARK_INDICES.rightCheek] = { x: 0.68, y: 0.5, z: 0 };
      mockLandmarks[LANDMARK_INDICES.leftTemple] = { x: 0.25, y: 0.38, z: 0 };
      mockLandmarks[LANDMARK_INDICES.rightTemple] = { x: 0.75, y: 0.38, z: 0 };

      const width = 1000;
      const height = 1200;
      const data = extractFaceData(mockLandmarks, width, height);

      expect(data).not.toBeNull();
      expect(data.width).toBe(1000);
      expect(data.height).toBe(1200);

      // Eye center should be midway between eyes
      expect(data.eyeCenter.x).toBeCloseTo(500, 1);
      expect(data.eyeCenter.y).toBeCloseTo(0.38 * 1200, 1);

      // Eye distance should be 0.30 * 1000 = 300
      expect(data.eyeDist).toBeCloseTo(300, 1);

      // Angle should be horizontal (0 rad)
      expect(data.angle).toBeCloseTo(0, 2);

      // Cranial width from temples: 0.50 * 1000 = 500
      expect(data.cranialWidth).toBeCloseTo(500, 1);

      // Cheeks
      expect(data.leftCheek.x).toBeCloseTo(320, 1);
      expect(data.rightCheek.x).toBeCloseTo(680, 1);

      // Forehead & chin
      expect(data.forehead.y).toBeCloseTo(180, 1);
      expect(data.chin.y).toBeCloseTo(1020, 1);

      // Lips loops
      expect(data.lipsOuter.length).toBe(LANDMARK_INDICES.lipsOuter.length);
      expect(data.lipsInner.length).toBe(LANDMARK_INDICES.lipsInner.length);
    });
  });

  describe("detectFaceInImage", () => {
    it("safely returns found: false when running in node test environment without browser APIs", async () => {
      const res = await detectFaceInImage("https://example.com/photo.jpg");
      expect(res.found).toBe(false);
    });

    it("returns found: false when image source is null or empty", async () => {
      const res = await detectFaceInImage(null);
      expect(res.found).toBe(false);
    });
  });
});
