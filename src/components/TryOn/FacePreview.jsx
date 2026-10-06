import { TRYON_TYPES, typeOf } from "../../utils/tryOnTypes.js";

// Reference face for the preview: temples 124 apart. The anchor points mirror the landmarks that
// public/storefront/tryon.js uses (ears, forehead, chin, mouth), so what you see is what shoppers get.
const VB = { width: 200, height: 300 };
const FACE = { eyeY: 105, eyeDist: 80, templeDist: 124, earX: 64, earY: 140, foreheadY: 34, chinY: 212, mouthY: 178 };

/**
 * Where each piece of an image product sits on the reference face, in preview units.
 * Same formulas as `layout` in tryon.js.
 */
export function previewParts(item) {
  const type = typeOf(item);
  const W = FACE.templeDist;
  const fit = item.fit ?? 1;
  const ox = (item.offsetX ?? 0) * W;
  const oy = (item.offsetY ?? 0) * W;
  const k = TRYON_TYPES[type].factors;

  if (type === "earrings") {
    return [-1, 1].map((side) => ({
      key: `ear${side}`,
      x: 100 + side * (FACE.earX + k.outward * W + ox),
      y: FACE.earY + k.drop * W + oy,
      width: k.width * W * fit,
      anchor: "top",
      flip: side === 1 && item.mirror !== false,
    }));
  }
  if (type === "hat") {
    return [{ key: "hat", x: 100 + ox, y: FACE.foreheadY + k.sink * W + oy, width: k.width * W * fit, anchor: "bottom" }];
  }
  if (type === "necklace") {
    return [{ key: "necklace", x: 100 + ox, y: FACE.chinY + k.drop * W + oy, width: k.width * W * fit, anchor: "top" }];
  }
  return [
    { key: "glasses", x: 100, y: FACE.eyeY + (item.offsetY ?? 0) * FACE.eyeDist, width: W * fit, anchor: "center" },
  ];
}

const ANCHOR_Y = { top: "0%", center: "-50%", bottom: "-100%" };
const pct = (value, total) => `${(value / total) * 100}%`;

export default function FacePreview({ item }) {
  const type = typeOf(item);
  const lip = FACE.mouthY;
  return (
    <div className="tryon-preview-stage">
      <div className="tryon-preview-badge">
        <span>معاينة المحاكاة الذكية</span>
      </div>
      <div className="tryon-preview-frame">
        <div className="tryon-preview" role="img" aria-label="معاينة موضع المنتج على الوجه">
          <svg viewBox={`0 0 ${VB.width} ${VB.height}`} aria-hidden="true">
            <path d="M80 205 L80 250 Q80 268 36 282 L6 300 M120 205 L120 250 Q120 268 164 282 L194 300" fill="none" stroke="var(--border-color)" strokeWidth="2" />
            <ellipse cx="100" cy="120" rx="68" ry="92" fill="var(--bg-tertiary)" stroke="var(--border-color)" strokeWidth="2" />
            <circle cx="60" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
            <circle cx="140" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
            <path d="M100 118 L92 150 L108 150" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
            {type === "lipstick" ? (
              <>
                <path
                  d={`M78 ${lip} Q100 ${lip - 12} 122 ${lip} Q100 ${lip + 16} 78 ${lip} Z`}
                  fill={item.color}
                  opacity={item.opacity}
                />
                {item.finish === "gloss" && <ellipse cx="100" cy={lip + 3} rx="12" ry="3.5" fill="#fff" opacity="0.6" />}
              </>
            ) : (
              <path d={`M78 ${lip} Q100 ${lip + 14} 122 ${lip}`} fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
            )}
          </svg>
          {type !== "lipstick" &&
            item.image &&
            previewParts(item).map((part) => (
              <img
                key={part.key}
                src={item.image}
                alt=""
                className="tryon-preview-overlay"
                style={{
                  left: pct(part.x, VB.width),
                  top: pct(part.y, VB.height),
                  width: pct(part.width, VB.width),
                  transform: `translate(-50%, ${ANCHOR_Y[part.anchor]})${part.flip ? " scaleX(-1)" : ""}`,
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
