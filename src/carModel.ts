import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface CarController {
  group: THREE.Group;
  update: (
    delta: number,
    time: number,
    speed: number,
    driftYaw: number,
    roll: number,
    suspension: number,
    isBoosting: boolean
  ) => void;
  setTaillightIntensity: (intensity: number) => void;
  getLeftRearTirePosition: (out?: THREE.Vector3) => THREE.Vector3;
  getRightRearTirePosition: (out?: THREE.Vector3) => THREE.Vector3;
  getLeftTaillightPosition: (out?: THREE.Vector3) => THREE.Vector3;
  getRightTaillightPosition: (out?: THREE.Vector3) => THREE.Vector3;
  getThrusterPositions: () => { left: THREE.Vector3; right: THREE.Vector3 };
}

/**
 * Loads the original 3D car model, preserving its exact geometry, silhouette,
 * proportions, body panels, wheels, tires, windows, headlights, and all details intact.
 * Applies a premium Cyberpunk look-development:
 * - Glossy obsidian black base coat with deep metallic violet undertones
 * - Electric cyan highlights on front grille, side skirts, and luminous pinstripes
 * - Restrained magenta accents on aerodynamic edges and dark chrome rims
 * - Smoked glass, realistic metallic flake, and physically accurate reflections.
 */
export async function loadCyberpunkCar(): Promise<CarController> {
  const rootGroup = new THREE.Group();
  const innerModelGroup = new THREE.Group();
  rootGroup.add(innerModelGroup);

  let taillightMaterial: THREE.MeshStandardMaterial | null = null;
  let headlightMaterial: THREE.MeshStandardMaterial | null = null;

  // Local anchor points on the car body
  const leftTireLocal = new THREE.Vector3(-0.09, 0.02, -0.15);
  const rightTireLocal = new THREE.Vector3(0.09, 0.02, -0.15);
  const leftTaillightLocal = new THREE.Vector3(-0.07, 0.06, -0.23);
  const rightTaillightLocal = new THREE.Vector3(0.07, 0.06, -0.23);
  const leftThrusterLocal = new THREE.Vector3(-0.05, 0.045, -0.235);
  const rightThrusterLocal = new THREE.Vector3(0.05, 0.045, -0.235);

  const loader = new GLTFLoader();

  try {
    const gltf = await loader.loadAsync('/models/car/scene.gltf');
    const model = gltf.scene;

    // -------------------------------------------------------------
    // Cyberpunk Look Development Materials
    // -------------------------------------------------------------

    // 1. Glossy Obsidian Black with Deep Metallic Violet Undertones (Main Body Panels)
    const obsidianVioletPaint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x06070a), // Glossy obsidian black base coat
      roughness: 0.12,                  // High-gloss mirror finish
      metalness: 0.95,                  // Realistic metallic flake
      clearcoat: 1.0,                   // Wet automotive clearcoat
      clearcoatRoughness: 0.04,
      sheen: 1.0,
      sheenColor: new THREE.Color(0x560e82), // Deep metallic violet undertone sheen
      sheenRoughness: 0.22,
      reflectivity: 0.96,
      envMapIntensity: 2.2,
    });

    // 2. Aerodynamic Edges with Restrained Neon Magenta Sheen
    const aeroEdgePaint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x08060c),
      roughness: 0.14,
      metalness: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      sheen: 1.0,
      sheenColor: new THREE.Color(0xa80064), // Restrained magenta edge sheen
      sheenRoughness: 0.25,
      reflectivity: 0.92,
      envMapIntensity: 2.0,
    });

    // 3. Smoked Obsidian Glass with Controlled Reflections
    const smokedGlassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x040609),
      roughness: 0.04,
      metalness: 0.08,
      transparent: true,
      opacity: 0.65,
      transmission: 0.82,
      ior: 1.54,
    });

    // 4. Polished Dark Chrome Trim & Metallic Hardware (Rims)
    const darkChromeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x323846), // Polished dark chrome
      roughness: 0.15,
      metalness: 0.98,
      envMapIntensity: 2.4,
    });

    const darkChromeRimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x282c36), // Polished dark chrome with restrained magenta rim accents
      roughness: 0.16,
      metalness: 0.98,
      envMapIntensity: 2.2,
    });

    // 5. Electric Cyan Luminous Pinstripes, Front Grille, & Skirt Details
    const cyanPinstripeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00f5ff),
      emissive: new THREE.Color(0x00f5ff),
      emissiveIntensity: 3.8,
      roughness: 0.18,
      metalness: 0.2,
    });

    // 6. Detailed Cyan-White Headlight LEDs (ON)
    headlightMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff),
      emissive: new THREE.Color(0x00f5ff),
      emissiveIntensity: 4.8,
      roughness: 0.08,
    });

    // 7. Vivid Neon Red/Magenta Taillights & Rear Details
    taillightMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xff0044),
      emissive: new THREE.Color(0xff0055),
      emissiveIntensity: 3.8,
      roughness: 0.15,
    });

    // 8. Original Rubber Tires (Preserving exact geometry & textures)
    const tireMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x131518),
      roughness: 0.82,
      metalness: 0.06,
    });

    // 9. Dark Matte Trim & Undercarriage Composite
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0c0e12),
      roughness: 0.65,
      metalness: 0.15,
    });

    // Apply materials precisely to original meshes while preserving original textures
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const origMat = mesh.material as THREE.MeshStandardMaterial;
        const matName = origMat?.name || '';

        // Preserve original textures where available
        const originalMap = origMat?.map || null;
        const originalNormalMap = origMat?.normalMap || null;
        const originalRoughnessMap = origMat?.roughnessMap || null;
        const originalMetalnessMap = origMat?.metalnessMap || null;

        // 1. Main body panels (Glossy obsidian black with deep metallic violet undertones)
        if (matName.includes('lack_haupt')) {
          const matInstance = obsidianVioletPaint.clone();
          if (originalMap) matInstance.map = originalMap;
          if (originalNormalMap) matInstance.normalMap = originalNormalMap;
          if (originalRoughnessMap) matInstance.roughnessMap = originalRoughnessMap;
          if (originalMetalnessMap) matInstance.metalnessMap = originalMetalnessMap;
          mesh.material = matInstance;
        }
        // 2. Aerodynamic edges & secondary panels (Restrained magenta edge accents)
        else if (matName.includes('lack_zwei')) {
          const matInstance = aeroEdgePaint.clone();
          if (originalMap) matInstance.map = originalMap;
          if (originalNormalMap) matInstance.normalMap = originalNormalMap;
          mesh.material = matInstance;
        }
        // 3. Smoked glass
        else if (matName.includes('glass')) {
          const matInstance = smokedGlassMat.clone();
          if (originalMap) matInstance.map = originalMap;
          mesh.material = matInstance;
        }
        // 4. Polished dark chrome trim & hardware
        else if (matName.includes('metal_002')) {
          const matInstance = darkChromeRimMat.clone();
          if (originalMap) matInstance.map = originalMap;
          if (originalNormalMap) matInstance.normalMap = originalNormalMap;
          mesh.material = matInstance;
        } else if (matName.includes('metal')) {
          const matInstance = darkChromeMat.clone();
          if (originalMap) matInstance.map = originalMap;
          if (originalNormalMap) matInstance.normalMap = originalNormalMap;
          mesh.material = matInstance;
        }
        // 5. Electric cyan luminous pinstripes & details
        else if (matName.includes('Led_color_2') || matName.includes('secound_color')) {
          mesh.material = cyanPinstripeMat;
        }
        // 6. Cyan-white headlights (ON)
        else if (matName.includes('led_white')) {
          mesh.material = headlightMaterial;
        }
        // 7. Taillights & indicators
        else if (matName.includes('LED_RED') || matName.includes('indicator')) {
          mesh.material = taillightMaterial;
        }
        // 8. Rubber tires (Original geometry & textures preserved exactly)
        else if (matName.includes('tire')) {
          const matInstance = tireMat.clone();
          if (originalMap) matInstance.map = originalMap;
          if (originalNormalMap) matInstance.normalMap = originalNormalMap;
          mesh.material = matInstance;
          mesh.visible = true;
        }
        // 9. Matte trim & composite
        else if (matName.includes('plastic') || matName.includes('hide')) {
          const matInstance = darkTrimMat.clone();
          if (originalMap) matInstance.map = originalMap;
          mesh.material = matInstance;
        }
      }
    });

    // -------------------------------------------------------------
    // Exact Geometry Alignment (Preserving 100% Original Mesh)
    // -------------------------------------------------------------
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Scale proportionally to fit track width
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = 0.52 / maxDim;
    model.scale.setScalar(targetScale);

    // Center model precisely at origin and ground level (tires at Y = 0)
    model.position.set(-center.x * targetScale, -box.min.y * targetScale, -center.z * targetScale);

    // Forward orientation container
    const carContainer = new THREE.Group();
    carContainer.add(model);
    carContainer.rotation.y = Math.PI;

    innerModelGroup.add(carContainer);
  } catch (err) {
    console.warn('Could not load car GLTF:', err);
  }

  // -------------------------------------------------------------
  // Studio Lighting on Vehicle (Cyan Key & Magenta Rim)
  // -------------------------------------------------------------
  // Soft cyan light highlighting front grille and bodywork
  const frontCyanLight = new THREE.PointLight(0x00f5ff, 1.8, 1.6);
  frontCyanLight.position.set(0, 0.08, 0.28);
  innerModelGroup.add(frontCyanLight);

  // Soft magenta rim light highlighting rear aerodynamic curves
  const rearMagentaLight = new THREE.PointLight(0xff36d1, 1.8, 1.6);
  rearMagentaLight.position.set(0, 0.08, -0.28);
  innerModelGroup.add(rearMagentaLight);

  // Subtle underbody illumination (Electric Cyan)
  const underbodyLight = new THREE.PointLight(0x00f5ff, 1.4, 1.2);
  underbodyLight.position.set(0, 0.02, 0);
  innerModelGroup.add(underbodyLight);

  function update(
    delta: number,
    time: number,
    speed: number,
    driftYaw: number,
    roll: number,
    suspension: number,
    isBoosting: boolean
  ): void {
    // Preserve original geometry: apply chassis yaw, roll, and suspension
    innerModelGroup.rotation.y = driftYaw;
    innerModelGroup.rotation.z = roll;
    innerModelGroup.position.y = suspension;

    // Dynamic light modulation
    const pulse = 1.0 + Math.sin(time * 4.0) * 0.12;
    frontCyanLight.intensity = (1.8 + (isBoosting ? 0.8 : 0.0)) * pulse;
    rearMagentaLight.intensity = (1.8 + (isBoosting ? 0.8 : 0.0)) * pulse;
  }

  function setTaillightIntensity(intensity: number): void {
    if (taillightMaterial) {
      taillightMaterial.emissiveIntensity = 3.8 * intensity;
    }
  }

  function getLeftRearTirePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return leftTireLocal.clone().applyMatrix4(rootGroup.matrixWorld);
  }

  function getRightRearTirePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return rightTireLocal.clone().applyMatrix4(rootGroup.matrixWorld);
  }

  function getLeftTaillightPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return leftTaillightLocal.clone().applyMatrix4(rootGroup.matrixWorld);
  }

  function getRightTaillightPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return rightTaillightLocal.clone().applyMatrix4(rootGroup.matrixWorld);
  }

  function getThrusterPositions(): { left: THREE.Vector3; right: THREE.Vector3 } {
    return {
      left: leftThrusterLocal.clone().applyMatrix4(rootGroup.matrixWorld),
      right: rightThrusterLocal.clone().applyMatrix4(rootGroup.matrixWorld),
    };
  }

  return {
    group: rootGroup,
    update,
    setTaillightIntensity,
    getLeftRearTirePosition,
    getRightRearTirePosition,
    getLeftTaillightPosition,
    getRightTaillightPosition,
    getThrusterPositions,
  };
}
