import { useState, useEffect, useId } from "react";
import { TRYON_TYPES, isMakeupType, typeOf } from "../../utils/tryOnTypes.js";
import { detectFaceInImage } from "../../utils/faceLandmarkerImage.js";
import Icon from "../Icon.jsx";

// Canonical reference face for schematic mode and initial offline/test fallback:
// temples 124 apart. The anchor points mirror the landmarks that
// public/storefront/tryon.js uses (ears, forehead, chin, mouth).
const VB = { width: 200, height: 300 };
const FACE = { eyeY: 105, eyeDist: 80, templeDist: 124, earX: 64, earY: 140, foreheadY: 34, chinY: 212, mouthY: 178 };

/**
 * Where each piece of an image product sits on the reference face, in preview units.
 * Same formulas as `layout` in tryon.js.
 */
export function previewParts(item, customFace = FACE, bounds = VB) {
  const type = typeOf(item);
  if (isMakeupType(type)) return [];
  const W = customFace.templeDist ?? customFace.cranialWidth ?? FACE.templeDist;
  const fit = item.fit ?? 1;
  const ox = (item.offsetX ?? 0) * W;
  const oy = (item.offsetY ?? 0) * W;
  const k = TRYON_TYPES[type].factors;
  const eyeDist = customFace.eyeDist ?? FACE.eyeDist;
  const eyeY = customFace.eyeY ?? (customFace.eyeCenter ? customFace.eyeCenter.y : FACE.eyeY);
  const cx = bounds.width / 2;

  if (type === "earrings") {
    return [-1, 1].map((side) => ({
      key: `ear${side}`,
      x: cx + side * (customFace.earX ?? (FACE.earX + k.outward * W + ox)),
      y: (customFace.earY ?? FACE.earY) + k.drop * W + oy,
      width: k.width * W * fit,
      anchor: "top",
      flip: side === 1 && item.mirror !== false,
    }));
  }
  if (type === "hat") {
    return [
      {
        key: "hat",
        x: cx + ox,
        y: (customFace.foreheadY ?? FACE.foreheadY) + k.sink * W + oy,
        width: k.width * W * fit,
        anchor: "bottom",
      },
    ];
  }
  if (type === "necklace") {
    return [
      {
        key: "necklace",
        x: cx + ox,
        y: (customFace.chinY ?? FACE.chinY) + k.drop * W + oy,
        width: k.width * W * fit,
        anchor: "top",
      },
    ];
  }
  return [
    {
      key: "glasses",
      x: cx,
      y: eyeY + (item.offsetY ?? 0) * eyeDist,
      width: W * fit,
      anchor: "center",
    },
  ];
}

const ANCHOR_Y = { top: "0%", center: "-50%", bottom: "-100%" };
const pct = (value, total) => `${(value / total) * 100}%`;

function pathToD(points, close = true) {
  if (!points || points.length === 0) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return close ? `${d} Z` : d;
}

export default function FacePreview({ item }) {
  const [viewMode, setViewMode] = useState("model"); // "model" or "schematic"
  const [customModelUrl, setCustomModelUrl] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedFace, setDetectedFace] = useState(null);
  const [detectionError, setDetectionError] = useState(null);
  const blushGradId = useId();

  const type = typeOf(item);
  const lip = FACE.mouthY;
  const isMakeup = isMakeupType(type);

  const activeModelUrl = customModelUrl || "/images/model-face.jpg";

  // Run AI facial detection whenever viewMode or photo changes
  useEffect(() => {
    let isCancelled = false;
    if (viewMode !== "model") {
      setDetectedFace(null);
      setIsDetecting(false);
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    detectFaceInImage(activeModelUrl)
      .then((res) => {
        if (isCancelled) return;
        setIsDetecting(false);
        if (res && res.found && res.faceData) {
          setDetectedFace(res.faceData);
          setDetectionError(null);
        } else {
          setDetectedFace(null);
          if (customModelUrl) {
            setDetectionError("لم يتم العثور على ملامح وجه واضحة في الصورة المرفوعة");
          }
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setIsDetecting(false);
        console.warn("Face detection error:", err);
        if (customModelUrl) {
          setDetectionError("تعذر تحليل الصورة المرفوعة بالذكاء الاصطناعي");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeModelUrl, viewMode, customModelUrl]);

  const handleCustomPhoto = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomModelUrl(url);
      setViewMode("model");
      setDetectedFace(null);
    }
  };

  const handleResetDefault = () => {
    setCustomModelUrl(null);
    setDetectedFace(null);
    setDetectionError(null);
    setViewMode("model");
  };

  // Dimensions of SVG coordinate space
  const viewW = detectedFace ? detectedFace.width : VB.width;
  const viewH = detectedFace ? detectedFace.height : VB.height;

  // Compute wearable pieces dynamically on detected face or canonical face
  const wearableParts = (() => {
    if (isMakeup || !item.image) return [];
    if (!detectedFace) {
      return previewParts(item).map((p) => ({
        ...p,
        pctX: pct(p.x, VB.width),
        pctY: pct(p.y, VB.height),
        pctWidth: pct(p.width, VB.width),
        angleDeg: 0,
      }));
    }

    const f = detectedFace;
    const W = f.cranialWidth;
    const fit = item.fit ?? 1;
    const ox = (item.offsetX ?? 0) * W;
    const oy = (item.offsetY ?? 0) * W;
    const k = TRYON_TYPES[type].factors;
    const angleDeg = (f.angle * 180) / Math.PI;

    if (type === "earrings") {
      return [
        {
          key: "ear-1",
          x: f.leftEar.x - k.outward * W - ox,
          y: f.leftEar.y + k.drop * W + oy,
          width: k.width * W * fit,
          anchor: "top",
          flip: false,
          angleDeg,
        },
        {
          key: "ear1",
          x: f.rightEar.x + k.outward * W + ox,
          y: f.rightEar.y + k.drop * W + oy,
          width: k.width * W * fit,
          anchor: "top",
          flip: item.mirror !== false,
          angleDeg,
        },
      ].map((p) => ({
        ...p,
        pctX: pct(p.x, viewW),
        pctY: pct(p.y, viewH),
        pctWidth: pct(p.width, viewW),
      }));
    }

    if (type === "hat") {
      return [
        {
          key: "hat",
          x: f.forehead.x + ox * Math.cos(f.angle) - oy * Math.sin(f.angle),
          y: f.forehead.y + k.sink * W * Math.cos(f.angle) + ox * Math.sin(f.angle) + oy,
          width: k.width * W * fit,
          anchor: "bottom",
          angleDeg,
          pctX: pct(f.forehead.x + ox, viewW),
          pctY: pct(f.forehead.y + k.sink * W + oy, viewH),
          pctWidth: pct(k.width * W * fit, viewW),
        },
      ];
    }

    if (type === "necklace") {
      return [
        {
          key: "necklace",
          x: f.chin.x + ox,
          y: f.chin.y + k.drop * W + oy,
          width: k.width * W * fit,
          anchor: "top",
          angleDeg,
          pctX: pct(f.chin.x + ox, viewW),
          pctY: pct(f.chin.y + k.drop * W + oy, viewH),
          pctWidth: pct(k.width * W * fit, viewW),
        },
      ];
    }

    // Default: Glasses
    return [
      {
        key: "glasses",
        x: f.eyeCenter.x + ox,
        y: f.eyeCenter.y + (item.offsetY ?? 0) * f.eyeDist + oy,
        width: W * fit,
        anchor: "center",
        angleDeg,
        pctX: pct(f.eyeCenter.x + ox, viewW),
        pctY: pct(f.eyeCenter.y + (item.offsetY ?? 0) * f.eyeDist + oy, viewH),
        pctWidth: pct(W * fit, viewW),
      },
    ];
  })();

  // Makeup shapes
  const lipstickPath = detectedFace
    ? `${pathToD(detectedFace.lipsOuter)} ${pathToD(detectedFace.lipsInner)}`
    : `M78 ${lip} Q100 ${lip - 12} 122 ${lip} Q100 ${lip + 16} 78 ${lip} Z`;

  const blushL = detectedFace ? detectedFace.leftCheek : { x: 62, y: 142 };
  const blushR = detectedFace ? detectedFace.rightCheek : { x: 138, y: 142 };
  const blushRx = detectedFace ? detectedFace.cranialWidth * 0.12 : 20;
  const blushRy = detectedFace ? detectedFace.cranialWidth * 0.08 : 14;

  return (
    <div className="tryon-preview-stage">
      <div className="tryon-preview-tabs-wrap">
        <div className="studio-tabs-bar tryon-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "model" && !customModelUrl}
            className={`studio-tab-btn ${viewMode === "model" && !customModelUrl ? "active" : ""}`}
            onClick={() => setViewMode("model")}
          >
            <Icon name="user" size={14} />
            <span>عارضة أزياء</span>
          </button>

          <label
            role="tab"
            aria-selected={Boolean(customModelUrl)}
            className={`studio-tab-btn ${customModelUrl ? "active" : ""}`}
            style={{ cursor: "pointer" }}
          >
            <Icon name="camera" size={14} />
            <span>{customModelUrl ? "صورتك" : "رفع صورة"}</span>
            <input type="file" accept="image/*" hidden onChange={handleCustomPhoto} />
          </label>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "schematic"}
            className={`studio-tab-btn ${viewMode === "schematic" ? "active" : ""}`}
            onClick={() => setViewMode("schematic")}
          >
            <Icon name="layout" size={14} />
            <span>تخطيطي</span>
          </button>
        </div>

        {customModelUrl && (
          <div className="tryon-custom-photo-actions">
            <span className="salla-metric-badge salla-badge-good">
              <Icon name="image" size={11} />
              <span>صورة مخصصة</span>
            </span>
            <button
              type="button"
              className="salla-card-action-pill"
              onClick={handleResetDefault}
              title="الرجوع للعارضة الافتراضية"
              style={{ color: "var(--danger-color, #ef4444)" }}
            >
              <Icon name="close" size={11} />
              <span>إعادة تعيين</span>
            </button>
          </div>
        )}
      </div>

      {/* Detection status pill matching Salla alerts */}
      {viewMode === "model" && (
        <div className="tryon-status-row">
          {isDetecting && (
            <div className="tryon-status-badge detecting">
              <Icon name="aiSparkles" size={13} />
              <span>جارٍ مسح وتحديد ملامح الوجه بالذكاء الاصطناعي...</span>
            </div>
          )}
          {!isDetecting && detectedFace && (
            <div className="tryon-status-badge detected">
              <Icon name="checkCircle" size={13} />
              <span>تم رصد ملامح الوجه وتطبيق المنتج بدقة (478 نقطة)</span>
            </div>
          )}
          {!isDetecting && !detectedFace && detectionError && (
            <div className="tryon-status-badge error">
              <Icon name="alert" size={13} />
              <span>{detectionError}</span>
            </div>
          )}
        </div>
      )}

      <div
        className="tryon-preview-frame"
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "14px",
          border: "1px solid var(--border-color)",
          background: "#111827",
          aspectRatio: `${viewW} / ${viewH}`,
          width: "100%",
          maxWidth: "240px",
          margin: "0 auto",
        }}
      >
        <div className="tryon-preview" role="img" aria-label="معاينة موضع المنتج على الوجه" style={{ position: "relative", width: "100%", height: "100%", zIndex: 2 }}>
          <svg viewBox={`0 0 ${viewW} ${viewH}`} style={{ width: "100%", height: "100%", display: "block" }} aria-hidden="true">
            <defs>
              <radialGradient id={`${blushGradId}-blushL`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={item.color || "#e57373"} stopOpacity={item.opacity ?? 0.5} />
                <stop offset="100%" stopColor={item.color || "#e57373"} stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${blushGradId}-blushR`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={item.color || "#e57373"} stopOpacity={item.opacity ?? 0.5} />
                <stop offset="100%" stopColor={item.color || "#e57373"} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Model Photo inside SVG - perfectly synchronized coordinate grid */}
            {viewMode === "model" && (
              <image
                href={activeModelUrl}
                x="0"
                y="0"
                width={viewW}
                height={viewH}
                preserveAspectRatio="none"
              />
            )}

            {/* Schematic Face Fallback */}
            {viewMode === "schematic" && (
              <>
                <path d="M80 205 L80 250 Q80 268 36 282 L6 300 M120 205 L120 250 Q120 268 164 282 L194 300" fill="none" stroke="var(--border-color)" strokeWidth="2" />
                <ellipse cx="100" cy="120" rx="68" ry="92" fill="var(--bg-tertiary)" stroke="var(--border-color)" strokeWidth="2" />
                <circle cx="60" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
                <circle cx="140" cy={FACE.eyeY} r="5" fill="var(--text-tertiary)" />
                <path d="M100 118 L92 150 L108 150" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
              </>
            )}

            {/* Blush / أحمر الخدود */}
            {type === "blush" && (
              <>
                <ellipse cx={blushL.x} cy={blushL.y} rx={blushRx} ry={blushRy} fill={`url(#${blushGradId}-blushL)`} />
                <ellipse cx={blushR.x} cy={blushR.y} rx={blushRx} ry={blushRy} fill={`url(#${blushGradId}-blushR)`} />
              </>
            )}

            {/* Eyeshadow / ظلال العيون */}
            {type === "eyeshadow" && (
              <>
                {detectedFace ? (
                  <>
                    <path
                      d={pathToD(detectedFace.leftEyelid)}
                      fill={item.color || "#8d6e63"}
                      opacity={item.opacity ?? 0.6}
                    />
                    <path
                      d={pathToD(detectedFace.rightEyelid)}
                      fill={item.color || "#8d6e63"}
                      opacity={item.opacity ?? 0.6}
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M46 103 Q60 88 74 103 Q60 97 46 103 Z"
                      fill={item.color || "#8d6e63"}
                      opacity={item.opacity ?? 0.6}
                    />
                    <path
                      d="M126 103 Q140 88 154 103 Q140 97 126 103 Z"
                      fill={item.color || "#8d6e63"}
                      opacity={item.opacity ?? 0.6}
                    />
                  </>
                )}
                {item.finish === "shimmer" && (
                  <>
                    <ellipse
                      cx={detectedFace ? detectedFace.leftEyelid[2]?.x : 60}
                      cy={detectedFace ? detectedFace.leftEyelid[2]?.y : 96}
                      rx={detectedFace ? detectedFace.eyeDist * 0.08 : 5}
                      ry={detectedFace ? detectedFace.eyeDist * 0.03 : 2}
                      fill="#fff"
                      opacity="0.45"
                    />
                    <ellipse
                      cx={detectedFace ? detectedFace.rightEyelid[2]?.x : 140}
                      cy={detectedFace ? detectedFace.rightEyelid[2]?.y : 96}
                      rx={detectedFace ? detectedFace.eyeDist * 0.08 : 5}
                      ry={detectedFace ? detectedFace.eyeDist * 0.03 : 2}
                      fill="#fff"
                      opacity="0.45"
                    />
                  </>
                )}
              </>
            )}

            {/* Eyeliner / الآيلاينر */}
            {type === "eyeliner" && (
              <>
                {detectedFace ? (
                  <>
                    <path
                      d={pathToD(detectedFace.leftEyeliner, false)}
                      fill="none"
                      stroke={item.color || "#1a1a1a"}
                      strokeWidth={Math.max(2, detectedFace.eyeDist * 0.02)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={item.opacity ?? 0.9}
                    />
                    <path
                      d={pathToD(detectedFace.rightEyeliner, false)}
                      fill="none"
                      stroke={item.color || "#1a1a1a"}
                      strokeWidth={Math.max(2, detectedFace.eyeDist * 0.02)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={item.opacity ?? 0.9}
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M48 105 Q60 98 72 105 Q78 101 82 98"
                      fill="none"
                      stroke={item.color || "#1a1a1a"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      opacity={item.opacity ?? 0.9}
                    />
                    <path
                      d="M152 105 Q140 98 128 105 Q122 101 118 98"
                      fill="none"
                      stroke={item.color || "#1a1a1a"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      opacity={item.opacity ?? 0.9}
                    />
                  </>
                )}
              </>
            )}

            {/* Lipstick / أحمر الشفاه */}
            {type === "lipstick" ? (
              <>
                <path
                  d={lipstickPath}
                  fill={item.color}
                  fillRule="evenodd"
                  opacity={item.opacity}
                />
                {item.finish === "gloss" && (
                  <ellipse
                    cx={detectedFace ? detectedFace.lipsCenter.x : 100}
                    cy={detectedFace ? detectedFace.lipsCenter.y : lip + 3}
                    rx={detectedFace ? detectedFace.eyeDist * 0.14 : 12}
                    ry={detectedFace ? detectedFace.eyeDist * 0.04 : 3.5}
                    fill="#fff"
                    opacity="0.6"
                  />
                )}
              </>
            ) : viewMode === "schematic" ? (
              <path d={`M78 ${lip} Q100 ${lip + 14} 122 ${lip}`} fill="none" stroke="var(--text-tertiary)" strokeWidth="2" />
            ) : null}
          </svg>

          {/* Wearables (Glasses, Hat, Earrings, Necklace) */}
          {!isMakeup &&
            item.image &&
            wearableParts.map((part) => (
              <img
                key={part.key}
                src={item.image}
                alt=""
                className="tryon-preview-overlay"
                style={{
                  left: part.pctX,
                  top: part.pctY,
                  width: part.pctWidth,
                  transform: `translate(-50%, ${ANCHOR_Y[part.anchor]})${part.angleDeg ? ` rotate(${part.angleDeg}deg)` : ""}${part.flip ? " scaleX(-1)" : ""}`,
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
