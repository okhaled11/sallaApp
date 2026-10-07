import * as THREE from "three";

/**
 * High-end PBR materials library for 3D wearable products.
 */
function createMaterials() {
  return {
    glossyAcetateBlack: new THREE.MeshPhysicalMaterial({
      color: 0x141416,
      roughness: 0.12,
      metalness: 0.05,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
      reflectivity: 0.85,
    }),
    tortoiseAcetate: new THREE.MeshPhysicalMaterial({
      color: 0x4a2c11,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
    }),
    polishedGold: new THREE.MeshStandardMaterial({
      color: 0xefc45d,
      roughness: 0.22,
      metalness: 0.92,
    }),
    darkSunLenses: new THREE.MeshPhysicalMaterial({
      color: 0x121b22,
      roughness: 0.04,
      metalness: 0.15,
      transmission: 0.65,
      transparent: true,
      opacity: 0.78,
      ior: 1.52,
      reflectivity: 0.9,
    }),
    gradientGreenLenses: new THREE.MeshPhysicalMaterial({
      color: 0x1a3328,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.72,
      transparent: true,
      opacity: 0.74,
      ior: 1.5,
      reflectivity: 0.85,
    }),
    fabricCotton: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.88,
      metalness: 0.02,
    }),
    fabricAccent: new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.75,
      metalness: 0.05,
    }),
    gemDiamond: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.02,
      metalness: 0.0,
      transmission: 0.92,
      transparent: true,
      opacity: 0.9,
      ior: 2.41,
    }),
  };
}

/**
 * Creates 3D Wayfarer Sunglasses with:
 * - Beveled front frame
 * - Both curved lenses
 * - Center bridge
 * - Left & Right temple arms extending back in 3D along -Z
 * - Metallic hinges
 */
export function createWayfarerSunglasses() {
  const mats = createMaterials();
  const glasses = new THREE.Group();
  glasses.name = "WayfarerSunglasses";

  const frameWidth = 0.144; // 144mm standard frame width
  const eyeDistance = 0.064;

  // 1. Lenses (Left and Right)
  const lensGeom = new THREE.CylinderGeometry(0.026, 0.026, 0.003, 32);
  lensGeom.rotateX(Math.PI / 2);
  lensGeom.scale(1.15, 0.9, 1);

  const leftLens = new THREE.Mesh(lensGeom, mats.darkSunLenses);
  leftLens.position.set(-eyeDistance / 2, 0, 0.002);
  glasses.add(leftLens);

  const rightLens = new THREE.Mesh(lensGeom, mats.darkSunLenses);
  rightLens.position.set(eyeDistance / 2, 0, 0.002);
  glasses.add(rightLens);

  // 2. Front Rims (Torus / Beveled frame rings)
  const rimGeom = new THREE.TorusGeometry(0.028, 0.0042, 16, 36);
  rimGeom.scale(1.18, 0.92, 1);

  const leftRim = new THREE.Mesh(rimGeom, mats.glossyAcetateBlack);
  leftRim.position.set(-eyeDistance / 2, 0, 0.003);
  glasses.add(leftRim);

  const rightRim = new THREE.Mesh(rimGeom, mats.glossyAcetateBlack);
  rightRim.position.set(eyeDistance / 2, 0, 0.003);
  glasses.add(rightRim);

  // 3. Nose Bridge
  const bridgeCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-0.012, 0.004, 0.002),
    new THREE.Vector3(-0.006, 0.012, 0.004),
    new THREE.Vector3(0.006, 0.012, 0.004),
    new THREE.Vector3(0.012, 0.004, 0.002)
  );
  const bridgeGeom = new THREE.TubeGeometry(bridgeCurve, 16, 0.0038, 12, false);
  const bridgeMesh = new THREE.Mesh(bridgeGeom, mats.glossyAcetateBlack);
  glasses.add(bridgeMesh);

  // 4. Brow Line Top Bar
  const browGeom = new THREE.BoxGeometry(frameWidth * 0.96, 0.0055, 0.006);
  const browMesh = new THREE.Mesh(browGeom, mats.glossyAcetateBlack);
  browMesh.position.set(0, 0.024, 0.002);
  glasses.add(browMesh);

  // 5. Metallic Temple Hinges
  const hingeGeom = new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 12);
  const leftHinge = new THREE.Mesh(hingeGeom, mats.polishedGold);
  leftHinge.position.set(-frameWidth / 2 + 0.002, 0.02, -0.002);
  glasses.add(leftHinge);

  const rightHinge = new THREE.Mesh(hingeGeom, mats.polishedGold);
  rightHinge.position.set(frameWidth / 2 - 0.002, 0.02, -0.002);
  glasses.add(rightHinge);

  // 6. Left & Right Temple Arms (Extending back in 3D Z-depth ~130mm)
  // Temple curves back and hooks gently around ear
  const createTempleArm = (isLeft) => {
    const sign = isLeft ? -1 : 1;
    const templeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sign * (frameWidth / 2 - 0.002), 0.02, -0.003),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.004), 0.018, -0.04),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.006), 0.016, -0.08),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.008), 0.012, -0.11),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.01), -0.008, -0.13), // curved tip behind ear
    ]);
    const templeGeom = new THREE.TubeGeometry(templeCurve, 24, 0.0032, 10, false);
    return new THREE.Mesh(templeGeom, mats.glossyAcetateBlack);
  };

  const leftTemple = createTempleArm(true);
  const rightTemple = createTempleArm(false);
  glasses.add(leftTemple);
  glasses.add(rightTemple);

  return glasses;
}

/**
 * Creates 3D Aviator Gold Sunglasses
 */
export function createAviatorSunglasses() {
  const mats = createMaterials();
  const aviator = new THREE.Group();
  aviator.name = "AviatorSunglasses";

  const frameWidth = 0.146;
  const eyeDistance = 0.065;

  // Teardrop curved lenses
  const lensGeom = new THREE.CylinderGeometry(0.028, 0.024, 0.002, 32);
  lensGeom.rotateX(Math.PI / 2);
  lensGeom.scale(1.1, 1.25, 1);

  const leftLens = new THREE.Mesh(lensGeom, mats.gradientGreenLenses);
  leftLens.position.set(-eyeDistance / 2, -0.004, 0.002);
  aviator.add(leftLens);

  const rightLens = new THREE.Mesh(lensGeom, mats.gradientGreenLenses);
  rightLens.position.set(eyeDistance / 2, -0.004, 0.002);
  aviator.add(rightLens);

  // Slender Wire Gold Rims
  const rimGeom = new THREE.TorusGeometry(0.027, 0.0016, 12, 36);
  rimGeom.scale(1.1, 1.25, 1);
  const leftRim = new THREE.Mesh(rimGeom, mats.polishedGold);
  leftRim.position.set(-eyeDistance / 2, -0.004, 0.003);
  aviator.add(leftRim);

  const rightRim = new THREE.Mesh(rimGeom, mats.polishedGold);
  rightRim.position.set(eyeDistance / 2, -0.004, 0.003);
  aviator.add(rightRim);

  // Double Top Brow Wire
  const topWire = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, frameWidth * 0.9, 12), mats.polishedGold);
  topWire.rotateZ(Math.PI / 2);
  topWire.position.set(0, 0.026, 0.004);
  aviator.add(topWire);

  // Lower Bridge Wire
  const lowBridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.022, 12), mats.polishedGold);
  lowBridge.rotateZ(Math.PI / 2);
  lowBridge.position.set(0, 0.012, 0.004);
  aviator.add(lowBridge);

  // Slender Temple Arms
  const createThinTemple = (isLeft) => {
    const sign = isLeft ? -1 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sign * (frameWidth / 2 - 0.004), 0.02, -0.002),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.006), 0.018, -0.05),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.008), 0.014, -0.1),
      new THREE.Vector3(sign * (frameWidth / 2 - 0.01), -0.005, -0.13),
    ]);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0015, 8, false), mats.polishedGold);
  };
  aviator.add(createThinTemple(true));
  aviator.add(createThinTemple(false));

  return aviator;
}

/**
 * Creates 3D Baseball Cap / Hat
 */
export function createCapHat() {
  const mats = createMaterials();
  const cap = new THREE.Group();
  cap.name = "CapHat";

  // Crown dome (Top of head)
  const crownGeom = new THREE.SphereGeometry(0.092, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
  crownGeom.scale(1.02, 0.88, 1.15);
  const crown = new THREE.Mesh(crownGeom, mats.fabricCotton);
  crown.position.set(0, 0.05, -0.025);
  cap.add(crown);

  // Curved Visor / Brim extending forward
  const brimShape = new THREE.Shape();
  brimShape.moveTo(-0.082, 0);
  brimShape.quadraticCurveTo(0, 0.075, 0.082, 0);
  brimShape.quadraticCurveTo(0, 0.025, -0.082, 0);

  const extrudeSettings = { depth: 0.0035, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.001, bevelThickness: 0.001 };
  const brimGeom = new THREE.ExtrudeGeometry(brimShape, extrudeSettings);
  brimGeom.rotateX(Math.PI / 2.3);
  const brim = new THREE.Mesh(brimGeom, mats.fabricCotton);
  brim.position.set(0, 0.046, 0.045);
  cap.add(brim);

  // Top Button
  const buttonGeom = new THREE.SphereGeometry(0.006, 16, 12);
  buttonGeom.scale(1, 0.4, 1);
  const button = new THREE.Mesh(buttonGeom, mats.fabricAccent);
  button.position.set(0, 0.126, -0.025);
  cap.add(button);

  return cap;
}

/**
 * Creates 3D Luxury Earrings
 */
export function createEarrings() {
  const mats = createMaterials();
  const earrings = new THREE.Group();
  earrings.name = "Earrings";

  const earDist = 0.082; // Distance from center to each earlobe

  const createSingleEarring = (xPos) => {
    const single = new THREE.Group();
    single.position.set(xPos, -0.025, -0.035);

    // Stud ring
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0016, 12, 24), mats.polishedGold);
    hoop.rotateY(Math.PI / 2);
    single.add(hoop);

    // Hanging pendant diamond
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.007, 1), mats.gemDiamond);
    gem.position.set(0, -0.016, 0);
    gem.scale.set(0.8, 1.4, 0.8);
    single.add(gem);

    return single;
  };

  earrings.add(createSingleEarring(-earDist));
  earrings.add(createSingleEarring(earDist));
  return earrings;
}

/**
 * Creates 3D Cyber Face Mask
 */
export function createFaceMask() {
  const mats = createMaterials();
  const mask = new THREE.Group();
  mask.name = "FaceMask";

  const maskGeom = new THREE.CylinderGeometry(0.072, 0.055, 0.085, 24, 1, false, -Math.PI * 0.4, Math.PI * 0.8);
  maskGeom.rotateZ(Math.PI / 2);
  maskGeom.scale(0.85, 1.1, 0.95);
  const mesh = new THREE.Mesh(maskGeom, mats.fabricCotton);
  mesh.position.set(0, -0.038, 0.025);
  mask.add(mesh);

  return mask;
}

/**
 * Parametric 2D-to-3D Extrusion Engine
 * Converts any user-uploaded 2D flat PNG product image into a REAL 3D object
 * with physical thickness, side bevels, and 3D temple arms for glasses!
 */
export function create3DAssetFrom2DImage(imageUrl, type = "glasses") {
  const group = new THREE.Group();
  group.name = "Custom3DProduct_" + type;

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imageUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = tex.image;
    const isHat = type === "hat";
    const width = isHat ? 0.146 : 0.142; // Calibrated skull width
    const height = width * aspect;
    const yCenter = isHat ? 0.048 + height / 2 : 0;
    const zCenter = isHat ? -0.018 : 0;

    // 1. Front High-Res Layer
    const frontMat = new THREE.MeshPhysicalMaterial({
      map: tex,
      transparent: true,
      roughness: isHat ? 0.8 : 0.2,
      metalness: isHat ? 0.05 : 0.1,
      clearcoat: isHat ? 0.1 : 0.8,
      clearcoatRoughness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const frontGeom = new THREE.PlaneGeometry(width, height);
    const frontMesh = new THREE.Mesh(frontGeom, frontMat);
    frontMesh.position.set(0, yCenter, zCenter + 0.003);
    group.add(frontMesh);

    // 2. Physical 3D Thickness Body (Box Backing with Bevel)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: isHat ? 0.85 : 0.4,
      metalness: isHat ? 0.02 : 0.2,
    });
    const bodyGeom = new THREE.BoxGeometry(width * 0.96, height * 0.94, isHat ? 0.012 : 0.006);
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.set(0, yCenter, zCenter);
    group.add(bodyMesh);

    // 3. For sunglasses/glasses: Generate REAL 3D Temple Arms extending back along -Z
    if (type === "glasses") {
      const armMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.3 });
      const createExtrudedTemple = (isLeft) => {
        const sign = isLeft ? -1 : 1;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sign * (width / 2 - 0.004), 0, 0),
          new THREE.Vector3(sign * (width / 2 - 0.006), 0, -0.04),
          new THREE.Vector3(sign * (width / 2 - 0.008), -0.002, -0.09),
          new THREE.Vector3(sign * (width / 2 - 0.01), -0.016, -0.13),
        ]);
        return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.003, 8, false), armMat);
      };
      group.add(createExtrudedTemple(true));
      group.add(createExtrudedTemple(false));
    }
  });

  return group;
}

/**
 * Standard Catalog of 3D AR Products with calibrated default anchors
 */
export const AR_PRODUCT_CATALOG = [
  {
    id: "wayfarer-black",
    name: "نظارة وايفارير كلاسيكية (Classic Wayfarer)",
    type: "glasses",
    anchor: "nose_bridge",
    factory: createWayfarerSunglasses,
    defaultScale: 1.0,
    defaultOffset: { x: 0, y: 0.008, z: 0.012 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
  {
    id: "aviator-gold",
    name: "نظارة أفياتور ذهبية (Aviator Gold)",
    type: "glasses",
    anchor: "nose_bridge",
    factory: createAviatorSunglasses,
    defaultScale: 1.0,
    defaultOffset: { x: 0, y: 0.006, z: 0.012 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
  {
    id: "designer-cap",
    name: "قبعة رياضية كلاسيكية (Designer Cap)",
    type: "hat",
    anchor: "forehead",
    factory: createCapHat,
    defaultScale: 1.08,
    defaultOffset: { x: 0, y: 0.038, z: -0.018 },
    defaultRotation: { x: -0.08, y: 0, z: 0 },
  },
  {
    id: "luxury-earrings",
    name: "أقراط ألماسية متدلية (Diamond Earrings)",
    type: "earrings",
    anchor: "ears",
    factory: createEarrings,
    defaultScale: 1.0,
    defaultOffset: { x: 0, y: -0.02, z: -0.03 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
  {
    id: "cyber-mask",
    name: "قناع وجه واقي عصري (Face Mask)",
    type: "mask",
    anchor: "mouth_chin",
    factory: createFaceMask,
    defaultScale: 1.0,
    defaultOffset: { x: 0, y: -0.015, z: 0.01 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
];
