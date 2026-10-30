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

    // 5. Electric Cyan Luminous Pinstripes, Front Grille, & Skirt Details (Minimal Clean Accent)
    const cyanPinstripeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x008da6),
      emissive: new THREE.Color(0x006b80),
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.3,
    });

    // 6. Sleek Dark Tinted Headlight Housing (Headlights Removed / Off)
    headlightMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111620),
      roughness: 0.2,
      metalness: 0.9,
    });

    // 7. Subtle Clean Taillights & Rear Details
    taillightMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x880020),
      emissive: new THREE.Color(0xaa002a),
      emissiveIntensity: 0.75,
      roughness: 0.25,
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
  // Studio Lighting on Vehicle (Minimal & Restrained)
  // -------------------------------------------------------------
  // Soft ambient magenta rim on rear aerodynamics
  const rearMagentaLight = new THREE.PointLight(0xff36d1, 0.55, 1.2);
  rearMagentaLight.position.set(0, 0.08, -0.28);
  innerModelGroup.add(rearMagentaLight);

  // Minimal underbody ambient
  const underbodyLight = new THREE.PointLight(0x00a3cc, 0.35, 0.9);
  underbodyLight.position.set(0, 0.02, 0);
  innerModelGroup.add(underbodyLight);

  // -------------------------------------------------------------
  // Minimal Plasma Thruster Exhaust Plumes (Subtle Rear Jets)
  // -------------------------------------------------------------
  const thrusterGeo = new THREE.ConeGeometry(0.035, 0.26, 12, 1, true);
  thrusterGeo.translate(0, -0.13, 0);
  thrusterGeo.rotateX(-Math.PI / 2); // Point backwards along -Z

  const thrusterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uBoost: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uBoost;
      varying vec3 vLocalPos;

      void main() {
        float zNorm = -vLocalPos.z / 0.26;
        float flameFlicker = sin(uTime * 35.0 + zNorm * 12.0) * 0.1 + 0.9;
        float alpha = (1.0 - zNorm) * flameFlicker * (0.22 + uBoost * 0.25);

        vec3 cyanCore = vec3(0.0, 0.7, 0.9) * 1.2;
        vec3 violetRim = vec3(0.65, 0.1, 0.6) * 0.9;
        vec3 color = mix(cyanCore, violetRim, zNorm);

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const leftThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
  leftThruster.position.copy(leftThrusterLocal);
  innerModelGroup.add(leftThruster);

  const rightThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
  rightThruster.position.copy(rightThrusterLocal);
  innerModelGroup.add(rightThruster);

  function update(
    delta: number,
    time: number,
    speed: number,
    driftYaw: number,
    roll: number,
    suspension: number,
    isBoosting: boolean
  ): void {
    // Apply dynamic chassis yaw, roll, and suspension
    innerModelGroup.rotation.y = driftYaw;
    innerModelGroup.rotation.z = roll;
    innerModelGroup.position.y = suspension;

    // Modulate subtle lighting
    rearMagentaLight.intensity = 0.55 + (isBoosting ? 0.3 : 0.0);

    // Thruster scale & intensity
    thrusterMat.uniforms.uTime.value = time;
    const targetBoost = isBoosting ? 1.0 : 0.0;
    thrusterMat.uniforms.uBoost.value = THREE.MathUtils.lerp(
      thrusterMat.uniforms.uBoost.value,
      targetBoost,
      delta * 6.0
    );

    const boostScale = 1.0 + (isBoosting ? 0.4 : 0.0);
    leftThruster.scale.set(boostScale, boostScale, boostScale * 1.15);
    rightThruster.scale.set(boostScale, boostScale, boostScale * 1.15);
  }

  function setTaillightIntensity(intensity: number): void {
    if (taillightMaterial) {
      taillightMaterial.emissiveIntensity = 0.75 * intensity;
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
