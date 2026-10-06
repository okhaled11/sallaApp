import { useEffect, useRef, useState } from "react";
import Icon from "../../Icon.jsx";
import { ARScene } from "./ARScene.js";
import { AR_PRODUCT_CATALOG, create3DAssetFrom2DImage } from "./AssetFactory.js";
import { FaceTracker } from "./FaceTracker.js";

/**
 * Snapchat-Style 3D AR Face Try-On System
 * Features:
 * - Real 3D WebGL / Three.js scene with physical geometry and PBR materials
 * - 478-point MediaPipe face tracking with head yaw/pitch/roll & cranial scale
 * - Depth-buffer Face Occlusion (temple arms & hat backs disappear behind the head)
 * - 3D Pose smoothing with Quaternion SLERP & Vector3 LERP (Zero jitter)
 * - Parametric 2D-to-3D Extrusion Engine for uploaded flat product images
 * - Live Calibration System (Position X/Y/Z, Rotation X/Y/Z, Scale)
 * - High-Res Snapshot Capture & MediaRecorder Video Capture
 */
export default function ARTryOnModal({ isOpen, onClose, initialItem = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const sceneRef = useRef(null);
  const trackerRef = useRef(null);
  const rafRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [trackingActive, setTrackingActive] = useState(false);
  const [arEnabled, setArEnabled] = useState(true);
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [showCalibration, setShowCalibration] = useState(false);
  const [recording, setRecording] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(AR_PRODUCT_CATALOG[0].id);

  // Live HUD metrics
  const [hud, setHud] = useState({
    fps: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    distanceCm: 0,
    detected: false,
  });

  // Calibration state
  const [calibration, setCalibration] = useState({
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1.0,
  });

  // Snapshot preview modal state
  const [snapshotUrl, setSnapshotUrl] = useState(null);

  // Custom user-uploaded products
  const [customProducts, setCustomProducts] = useState([]);

  const allProducts = [...AR_PRODUCT_CATALOG, ...customProducts];
  const activeProduct = allProducts.find((p) => p.id === selectedProductId) || allProducts[0];

  // 1. Initialize Camera and WebGL Scene
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let stream = null;
    let lastTime = performance.now();
    let frameCount = 0;

    async function initAR() {
      setLoading(true);

      // Start front-facing camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve) => {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play();
              resolve();
            };
          });
        }
      } catch (err) {
        console.error("Failed to access camera:", err);
      }

      if (!isMounted) return;

      // Initialize Three.js AR Scene
      if (canvasRef.current && !sceneRef.current) {
        const arScene = new ARScene(canvasRef.current);
        sceneRef.current = arScene;
      }

      // Initialize Face Tracker
      const tracker = new FaceTracker();
      trackerRef.current = tracker;
      await tracker.initialize();

      // Load initial product
      loadProductModel(activeProduct);

      setLoading(false);
      startRenderLoop();
    }

    function startRenderLoop() {
      function loop() {
        if (!isMounted) return;

        const video = videoRef.current;
        const arScene = sceneRef.current;
        const tracker = trackerRef.current;

        if (video && arScene && tracker && video.readyState >= 2) {
          // Resize viewport to match video container
          const rect = video.getBoundingClientRect();
          if (rect.width && rect.height) {
            arScene.resize(rect.width, rect.height);
          }

          if (arEnabled) {
            // Detect face in video frame
            const pose = tracker.detect(video, arScene.camera);
            arScene.updatePose(pose);

            // Update live HUD
            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 500) {
              const currentFps = Math.round((frameCount * 1000) / (now - lastTime));
              frameCount = 0;
              lastTime = now;

              if (pose) {
                setTrackingActive(true);
                setHud({
                  fps: currentFps,
                  yaw: Math.round(pose.angles.yaw),
                  pitch: Math.round(pose.angles.pitch),
                  roll: Math.round(pose.angles.roll),
                  distanceCm: Math.round(pose.distance * 100),
                  detected: true,
                });
              } else {
                setTrackingActive(false);
                setHud((prev) => ({ ...prev, fps: currentFps, detected: false }));
              }
            }
          } else {
            arScene.updatePose(null);
          }

          // Render 3D WebGL frame
          arScene.render();
        }

        rafRef.current = requestAnimationFrame(loop);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    initAR();

    return () => {
      isMounted = false;
      cancelAnimationFrame(rafRef.current);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [isOpen, arEnabled]);

  // 2. Switch Product 3D Model
  const loadProductModel = (prod) => {
    if (!sceneRef.current || !prod) return;

    let mesh = null;
    if (prod.factory) {
      mesh = prod.factory();
    } else if (prod.customImage) {
      mesh = create3DAssetFrom2DImage(prod.customImage, prod.type);
    }

    const defOffset = prod.defaultOffset || { x: 0, y: 0, z: 0 };
    const defRot = prod.defaultRotation || { x: 0, y: 0, z: 0 };
    const defScale = prod.defaultScale || 1.0;

    sceneRef.current.setProductMesh(mesh, defOffset, defRot, defScale);

    setCalibration({
      posX: defOffset.x,
      posY: defOffset.y,
      posZ: defOffset.z,
      rotX: defRot.x,
      rotY: defRot.y,
      rotZ: defRot.z,
      scale: defScale,
    });
  };

  const handleSelectProduct = (prod) => {
    setSelectedProductId(prod.id);
    loadProductModel(prod);
  };

  // 3. Update Calibration
  const updateOffset = (key, value) => {
    const next = { ...calibration, [key]: Number(value) };
    setCalibration(next);

    if (sceneRef.current) {
      sceneRef.current.updateCalibration({
        positionOffset: { x: next.posX, y: next.posY, z: next.posZ },
        rotationOffset: { x: next.rotX, y: next.rotY, z: next.rotZ },
        scale: next.scale,
      });
    }
  };

  const handleResetCalibration = () => {
    const defOffset = activeProduct?.defaultOffset || { x: 0, y: 0, z: 0 };
    const defRot = activeProduct?.defaultRotation || { x: 0, y: 0, z: 0 };
    const defScale = activeProduct?.defaultScale || 1.0;

    const reset = {
      posX: defOffset.x,
      posY: defOffset.y,
      posZ: defOffset.z,
      rotX: defRot.x,
      rotY: defRot.y,
      rotZ: defRot.z,
      scale: defScale,
    };
    setCalibration(reset);

    if (sceneRef.current) {
      sceneRef.current.updateCalibration({
        positionOffset: defOffset,
        rotationOffset: defRot,
        scale: defScale,
      });
    }
  };

  const handleToggleOcclusion = () => {
    const next = !occlusionEnabled;
    setOcclusionEnabled(next);
    if (sceneRef.current) {
      sceneRef.current.setOcclusionEnabled(next);
    }
  };

  // 4. Handle 2D Image Upload -> 3D Asset Creation
  const handleUploadImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const customProd = {
        id: "custom-" + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        type: "glasses",
        anchor: "nose_bridge",
        customImage: dataUrl,
        defaultScale: 1.0,
        defaultOffset: { x: 0, y: 0.008, z: 0.012 },
        defaultRotation: { x: 0, y: 0, z: 0 },
      };

      setCustomProducts((prev) => [customProd, ...prev]);
      handleSelectProduct(customProd);
    };
    reader.readAsDataURL(file);
  };

  // 5. Capture High-Res Snapshot
  const handleCapturePhoto = () => {
    if (!sceneRef.current || !videoRef.current) return;
    const photoUrl = sceneRef.current.captureCombinedPhoto(videoRef.current);
    setSnapshotUrl(photoUrl);
  };

  // 6. Record Video
  const handleToggleRecord = () => {
    if (recording) {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setRecording(false);
    } else {
      // Start recording
      const canvas = document.createElement("canvas");
      const video = videoRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");

      let active = true;
      function recordFrame() {
        if (!active) return;
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        if (canvasRef.current) {
          ctx.drawImage(canvasRef.current, 0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(recordFrame);
      }
      recordFrame();

      const stream = canvas.captureStream(30);
      recordedChunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        active = false;
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `salla-ar-recording-${Date.now()}.webm`;
        a.click();
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ar-modal-backdrop" role="dialog" aria-modal="true" aria-label="تجربة الواقع المعزز ثلاثية الأبعاد">
      <div className="ar-modal-container">
        {/* Top Header */}
        <div className="ar-modal-header">
          <div className="ar-brand-badge">
            <Icon name="aiSparkles" size={18} />
            <span>تجربة الواقع المعزز 3D (Snapchat Engine)</span>
          </div>

          <div className="ar-header-actions">
            <button
              type="button"
              className={`ar-btn-icon ${occlusionEnabled ? "active" : ""}`}
              onClick={handleToggleOcclusion}
              title="تفعيل/تعطيل إخفاء الأجزاء خلف الرأس (Occlusion Mask)"
            >
              <Icon name="view" size={18} />
              <span>{occlusionEnabled ? "العزل 3D مفعّل" : "بدون عزل"}</span>
            </button>

            <button
              type="button"
              className={`ar-btn-icon ${showCalibration ? "active" : ""}`}
              onClick={() => setShowCalibration(!showCalibration)}
              title="لوحة المعايرة ثلاثية الأبعاد"
            >
              <Icon name="filter" size={18} />
              <span>المعايرة</span>
            </button>

            <button type="button" className="ar-btn-close" onClick={onClose} aria-label="إغلاق">
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        {/* Live AR Camera Viewport */}
        <div className="ar-viewport-stage">
          {loading && (
            <div className="ar-loading-overlay">
              <div className="ar-spinner" />
              <span>جارٍ تحميل محرك 3D وتتبع الوجه بالذكاء الاصطناعي...</span>
            </div>
          )}

          {/* Mirrored Selfie Video (Snapchat Style) */}
          <video ref={videoRef} playsInline muted autoPlay className="ar-camera-feed" />

          {/* Three.js WebGL 3D Canvas Layer */}
          <canvas ref={canvasRef} className="ar-three-canvas" />

          {/* Live 3D Head Tracking HUD */}
          <div className="ar-hud-panel">
            <div className={`ar-status-dot ${hud.detected ? "tracking" : "searching"}`} />
            <div className="ar-hud-stats">
              <span>{hud.detected ? "تتبع 3D نشط" : "ابحث عن وجهك أمام الكاميرا..."}</span>
              {hud.detected && (
                <span className="ar-hud-angles">
                  Yaw: {hud.yaw}° | Pitch: {hud.pitch}° | Roll: {hud.roll}° | {hud.distanceCm} cm | {hud.fps} FPS
                </span>
              )}
            </div>
          </div>

          {/* Calibration Drawer (Sliders for 3D X, Y, Z Offsets) */}
          {showCalibration && (
            <div className="ar-calibration-drawer">
              <div className="ar-calib-header">
                <strong>معايرة الموضع ثلاثي الأبعاد (3D Calibration)</strong>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetCalibration}>
                  إعادة تعيين
                </button>
              </div>

              <div className="ar-calib-grid">
                <label>
                  <span>الموضع الأفقي X ({calibration.posX.toFixed(3)}m)</span>
                  <input
                    type="range"
                    min="-0.08"
                    max="0.08"
                    step="0.002"
                    value={calibration.posX}
                    onChange={(e) => updateOffset("posX", e.target.value)}
                  />
                </label>

                <label>
                  <span>الارتفاع الرأسي Y ({calibration.posY.toFixed(3)}m)</span>
                  <input
                    type="range"
                    min="-0.08"
                    max="0.08"
                    step="0.002"
                    value={calibration.posY}
                    onChange={(e) => updateOffset("posY", e.target.value)}
                  />
                </label>

                <label>
                  <span>العمق للأمام/الخلف Z ({calibration.posZ.toFixed(3)}m)</span>
                  <input
                    type="range"
                    min="-0.08"
                    max="0.08"
                    step="0.002"
                    value={calibration.posZ}
                    onChange={(e) => updateOffset("posZ", e.target.value)}
                  />
                </label>

                <label>
                  <span>الحجم ثلاثي الأبعاد ({Math.round(calibration.scale * 100)}%)</span>
                  <input
                    type="range"
                    min="0.5"
                    max="1.6"
                    step="0.02"
                    value={calibration.scale}
                    onChange={(e) => updateOffset("scale", e.target.value)}
                  />
                </label>

                <label>
                  <span>الميلان الرأسي Pitch ({calibration.rotX.toFixed(2)})</span>
                  <input
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.02"
                    value={calibration.rotX}
                    onChange={(e) => updateOffset("rotX", e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Action Floating Buttons */}
          <div className="ar-floating-controls">
            <button
              type="button"
              className={`ar-capture-btn ${recording ? "recording" : ""}`}
              onClick={handleCapturePhoto}
              title="التقاط صورة تذكارية"
            >
              <Icon name="camera" size={26} />
            </button>

            <button
              type="button"
              className={`ar-record-btn ${recording ? "active" : ""}`}
              onClick={handleToggleRecord}
              title={recording ? "إيقاف التسجيل" : "بدء تسجيل فيديو"}
            >
              <div className="record-circle" />
            </button>
          </div>
        </div>

        {/* Bottom Product Selector Carousel */}
        <div className="ar-modal-footer">
          <div className="ar-carousel-row">
            <button
              type="button"
              className="ar-upload-box"
              onClick={() => fileInputRef.current?.click()}
              title="رفع صورة فلات لتحويلها إلى مجسم 3D"
            >
              <Icon name="image" size={20} />
              <span>رفع 2D ➔ 3D</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/webp" hidden onChange={handleUploadImage} />

            <div className="ar-products-scroll">
              {allProducts.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  className={`ar-product-pill ${prod.id === selectedProductId ? "selected" : ""}`}
                  onClick={() => handleSelectProduct(prod)}
                >
                  <Icon name={prod.type === "hat" ? "gift" : prod.type === "earrings" ? "sparkles" : "camera"} size={16} />
                  <span>{prod.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Snapshot Modal Preview */}
        {snapshotUrl && (
          <div className="ar-snapshot-modal">
            <div className="ar-snapshot-card">
              <h4>تم التقاط الصورة بنجاح!</h4>
              <img src={snapshotUrl} alt="AR Snapshot" className="ar-snapshot-img" />
              <div className="ar-snapshot-actions">
                <a href={snapshotUrl} download={`salla-ar-${Date.now()}.png`} className="btn btn-primary">
                  <Icon name="download" size={16} />
                  <span>تحميل الصورة</span>
                </a>
                <button type="button" className="btn btn-secondary" onClick={() => setSnapshotUrl(null)}>
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
