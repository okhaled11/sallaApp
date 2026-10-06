import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import FacePreview, { previewParts } from "../FacePreview.jsx";

const base = { image: "data:image/png;base64,AAAA", fit: 1, offsetX: 0, offsetY: 0, mirror: true };

describe("previewParts", () => {
  it("puts glasses on the eye line", () => {
    const [g] = previewParts({ ...base, type: "glasses" });
    expect(g).toMatchObject({ x: 100, y: 105, width: 124, anchor: "center" });
  });

  it("places two earrings symmetrically and flips only the right one", () => {
    const [left, right] = previewParts({ ...base, type: "earrings" });
    expect(left.x + right.x).toBeCloseTo(200, 5);
    expect([left.flip, right.flip]).toEqual([false, true]);
    expect(left.anchor).toBe("top");
  });

  it("rests a hat on the forehead and hangs a necklace under the chin", () => {
    const [hat] = previewParts({ ...base, type: "hat" });
    const [necklace] = previewParts({ ...base, type: "necklace" });
    expect(hat.anchor).toBe("bottom");
    expect(hat.y).toBeLessThan(105);
    expect(necklace.anchor).toBe("top");
    expect(necklace.y).toBeGreaterThan(212);
  });

  it("applies fit and offsets", () => {
    const [n] = previewParts({ ...base, type: "necklace", fit: 2, offsetY: 0.1 });
    const [plain] = previewParts({ ...base, type: "necklace" });
    expect(n.width).toBeCloseTo(plain.width * 2, 5);
    expect(n.y).toBeCloseTo(plain.y + 12.4, 5);
  });
});

describe("FacePreview", () => {
  it("renders one overlay per piece for image types", () => {
    const { container } = render(<FacePreview item={{ ...base, type: "earrings" }} />);
    expect(container.querySelectorAll("img.tryon-preview-overlay")).toHaveLength(2);
  });

  it("paints the lips with the chosen colour instead of using an image", () => {
    const { container } = render(
      <FacePreview item={{ type: "lipstick", image: "", color: "#aa1155", opacity: 0.8, finish: "gloss" }} />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector('path[fill="#aa1155"]')).not.toBeNull();
    expect(container.querySelector("ellipse[opacity='0.6']")).not.toBeNull();
  });
});
