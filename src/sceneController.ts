import * as THREE from 'three';
import { MobiusTrack } from './mobiusTrack';
import { loadCyberpunkCar, CarController } from './carModel';
import { DriftEffects } from './driftEffects';
import { createMobiusStripGeometry } from './mobiusGeometry';
import { createMobiusShaderMaterial } from './mobiusShader';

export interface SceneControllerOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export class SceneController {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public track: MobiusTrack;
  public car: CarController | null = null;
  public driftEffects: DriftEffects;

  public trackMesh: THREE.Mesh;
  public trackMaterial: THREE.ShaderMaterial;

  // Cinematic Lighting
  public keyLight: THREE.DirectionalLight;
  public rimCyanLight: THREE.DirectionalLight;
  public rimMagentaLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;

  // Scroll state & narrative animation
  public scrollProgress = 0; // 0.0 to 1.0 (from ScrollTrigger)
  public carProgress = 0; // Continuous track progress [0, 1)
  public carSpeed = 0.045; // Base automatic driving speed

  // Camera interpolation targets
  private targetCameraPos = new THREE.Vector3(0, 1.8, 8.2);
  private targetCameraLookAt = new THREE.Vector3(0, 0, 0);
  private currentCameraLookAt = new THREE.Vector3(0, 0, 0);
  private targetCameraUp = new THREE.Vector3(0, 1, 0);
  private currentCameraUp = new THREE.Vector3(0, 1, 0);

  constructor(options: SceneControllerOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.renderer = options.renderer;

    // 1. Initialize mathematical Möbius racetrack trajectory
    this.track = new MobiusTrack();

    // 2. Build visible 3D racetrack ribbon mesh
    const trackGeometry = createMobiusStripGeometry({
      uSegments: 480,
      vSegments: 32,
      width: MobiusTrack.WIDTH,
      thickness: MobiusTrack.THICKNESS,
      a: MobiusTrack.A,
      b: MobiusTrack.B,
      c: MobiusTrack.C,
    });
    this.trackMaterial = createMobiusShaderMaterial();
    // In racetrack mode, progress is 1.0 (fully formed)
    this.trackMaterial.uniforms.uProgress.value = 1.0;
    this.trackMesh = new THREE.Mesh(trackGeometry, this.trackMaterial);
    this.scene.add(this.trackMesh);

    // 3. Initialize drift effects (tire smoke, sparks, taillight trails)
    this.driftEffects = new DriftEffects();
    this.scene.add(this.driftEffects.smokeMesh);
    this.scene.add(this.driftEffects.trailMesh);

    // 4. Cinematic Lighting Setup
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.keyLight.position.set(5, 7, 6);
    this.scene.add(this.keyLight);

    this.rimCyanLight = new THREE.DirectionalLight(0x00f5ff, 1.6);
    this.rimCyanLight.position.set(-6, 2, -4);
    this.scene.add(this.rimCyanLight);

    this.rimMagentaLight = new THREE.DirectionalLight(0xff0088, 1.4);
    this.rimMagentaLight.position.set(4, -3, 3);
    this.scene.add(this.rimMagentaLight);

    this.ambientLight = new THREE.AmbientLight(0x060912, 0.8);
    this.scene.add(this.ambientLight);

    // Subtle atmospheric stars / cyber dust
    this.createAtmosphericParticles();

    // 5. Load the actual 3D Cyberpunk car asynchronously
    this.initCar();
  }

  private async initCar(): Promise<void> {
    this.car = await loadCyberpunkCar();
    this.scene.add(this.car.group);
  }

  private createAtmosphericParticles(): void {
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 22;

      // Subtle cyan or violet dust motes
      if (Math.random() < 0.6) {
        colors[i * 3 + 0] = 0.0;
        colors[i * 3 + 1] = 0.8;
        colors[i * 3 + 2] = 1.0;
      } else {
        colors[i * 3 + 0] = 0.7;
        colors[i * 3 + 1] = 0.2;
        colors[i * 3 + 2] = 0.9;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geo, mat);
    this.scene.add(particles);
  }

  /**
   * Evaluates drift intensity and yaw based on normalized car track progress.
   */
  private evaluateDrift(progress: number): { intensity: number; yaw: number; roll: number; lateral: number } {
    const p = ((progress % 1.0) + 1.0) % 1.0;

    // Define 3 curved drift zones along the 2-circuit route
    const zones = [
      { start: 0.16, end: 0.28, direction: 1.0 },  // Zone 1
      { start: 0.44, end: 0.56, direction: -1.0 }, // Zone 2 (crossing twist)
      { start: 0.70, end: 0.82, direction: 1.0 },  // Zone 3
    ];

    let intensity = 0;
    let dir = 1.0;

    for (const z of zones) {
      if (p >= z.start && p <= z.end) {
        const t = (p - z.start) / (z.end - z.start); // 0 to 1
        // Smooth sine bell curve for drift
        intensity = Math.sin(t * Math.PI);
        dir = z.direction;
        break;
      }
    }

    return {
      intensity,
      yaw: dir * intensity * 0.22,      // ~12.5 deg yaw slip
      roll: -dir * intensity * 0.08,    // body roll into curve
      lateral: dir * intensity * 0.04,  // tire slip offset across lane
    };
  }

  /**
   * Updates camera choreography based on normalized scroll progress (0.0 to 1.0).
   * Seamlessly transitions across Camera A, B, C, D, and E.
   */
  public scrollVelocity = 0;

  /**
   * Updates camera choreography based on normalized scroll progress (0.0 to 1.0).
   * Seamlessly transitions across Camera A, B, C, D, and E.
   */
  public updateScroll(progress: number, velocity = 0): void {
    this.scrollProgress = THREE.MathUtils.clamp(progress, 0, 1);
    this.scrollVelocity = velocity;
  }

  /**
   * Telemetry stats for live HUD and HUD audio
   */
  public getTelemetry() {
    const drift = this.evaluateDrift(this.carProgress);
    const speedKmh = Math.round((this.carSpeed * 3400) + Math.abs(this.scrollVelocity) * 120 + drift.intensity * 40);
    const driftDeg = (drift.yaw * (180 / Math.PI)).toFixed(1);
    const lateralG = (0.24 + Math.abs(drift.yaw) * 4.5 + drift.intensity * 1.2).toFixed(2);
    const trackPct = Math.round(this.carProgress * 100);
    const scrollPct = Math.round(this.scrollProgress * 100);

    let stageName = 'STAGE 01 — FULL CIRCUIT';
    if (this.scrollProgress > 0.75) stageName = 'STAGE 04 — FINAL REVEAL';
    else if (this.scrollProgress > 0.5) stageName = 'STAGE 03 — CYBER REALM';
    else if (this.scrollProgress > 0.25) stageName = 'STAGE 02 — DRIFT ACTION';

    return {
      speedKmh,
      driftDeg,
      lateralG,
      trackPct,
      scrollPct,
      stageName,
      isDrifting: drift.intensity > 0.15,
      driftIntensity: drift.intensity,
    };
  }

  public update(delta: number, time: number): void {
    // 1. Advance car along Möbius track
    // Base speed + responsive scroll velocity boost
    const currentSpeed = this.carSpeed + Math.min(Math.abs(this.scrollVelocity) * 0.08, 0.15);
    this.carProgress = (this.carProgress + currentSpeed * delta) % 1.0;

    // Evaluate drift dynamics
    const drift = this.evaluateDrift(this.carProgress);

    // 2. Compute exact track frame & attach car to track surface
    const suspension = Math.sin(time * 12.0) * 0.003; // Micro suspension vibration
    const trackTransform = this.track.getFrame(
      this.carProgress,
      drift.lateral,
      0.0, // surface contact
      drift.yaw,
      drift.roll
    );

    if (this.car) {
      this.car.group.position.copy(trackTransform.position);
      this.car.group.quaternion.copy(trackTransform.quaternion);

      // Check if thruster boost is active (during acceleration, scroll velocity, or drift)
      const isBoosting = drift.intensity > 0.12 || Math.abs(this.scrollVelocity) > 0.03 || (this.scrollProgress > 0.22 && this.scrollProgress < 0.52);

      // Update car internal controllers (wheels, roll, headlights, plasma thrusters)
      this.car.update(delta, time, currentSpeed, drift.yaw, drift.roll, suspension, isBoosting);

      // Taillights intensify during drift/braking
      this.car.setTaillightIntensity(1.0 + drift.intensity * 1.5 + (isBoosting ? 0.8 : 0.0));

      // 3. Emit drift smoke & taillight trails
      const leftTire = this.car.getLeftRearTirePosition();
      const rightTire = this.car.getRightRearTirePosition();
      const leftTail = this.car.getLeftTaillightPosition();
      const rightTail = this.car.getRightTaillightPosition();

      this.driftEffects.emitDriftParticles(leftTire, rightTire, drift.intensity);
      this.driftEffects.addTrailPoint(leftTail, rightTail, 0.4 + drift.intensity * 0.6);
    }

    this.driftEffects.update(delta);

    // 4. Update Shader Uniforms
    this.trackMaterial.uniforms.uTime.value = time;

    // 5. Cinematic Camera Choreography across the 4 Scroll Stages
    const sp = this.scrollProgress;
    const carPos = trackTransform.position;
    const carTan = trackTransform.tangent;
    const carNorm = trackTransform.normal;
    const carBinorm = trackTransform.binormal;

    if (sp <= 0.25) {
      // -------------------------------------------------------------
      // STAGE 01 (0.0 to 0.25): HERO OPENING -> LOW-SLUNG INCLINE
      // -------------------------------------------------------------
      const t = sp / 0.25; // 0 to 1
      // Smooth breathing hero tracking
      const heroOrbitX = Math.sin(time * 0.22) * 0.35;
      const heroOrbitY = Math.cos(time * 0.18) * 0.12;

      // Moves from iconic wide loop framing down into a dramatic 3/4 front approach
      this.targetCameraPos.set(
        THREE.MathUtils.lerp(0.1 + heroOrbitX, 1.25, t),
        THREE.MathUtils.lerp(1.45 + heroOrbitY, 1.15, t),
        THREE.MathUtils.lerp(7.6, 4.8, t)
      );
      this.targetCameraLookAt.set(
        THREE.MathUtils.lerp(0.0, carPos.x * 0.5, t),
        THREE.MathUtils.lerp(0.05, carPos.y * 0.5 + 0.05, t),
        THREE.MathUtils.lerp(0.0, carPos.z * 0.5, t)
      );

      // Subtle heroic roll
      this.targetCameraUp.set(Math.sin(t * 0.04), Math.cos(t * 0.04), 0);

      // Lighting: Cool cyan dominant
      this.rimCyanLight.intensity = THREE.MathUtils.lerp(1.6, 2.2, t);
      this.rimMagentaLight.intensity = THREE.MathUtils.lerp(1.0, 1.5, t);
    } else if (sp <= 0.5) {
      // -------------------------------------------------------------
      // STAGE 02 (0.25 to 0.5): AGGRESSIVE CLOSE-UP CHASE & DRIFT POV
      // -------------------------------------------------------------
      const t = (sp - 0.25) / 0.25; // 0 to 1

      // Dynamic close-up follow cam: sits tight behind rear quarter panel & low to track surface
      const flankDir = drift.yaw >= 0 ? -1.0 : 1.0;
      const followDist = THREE.MathUtils.lerp(-1.35, -0.96, t); // Tighter proximity
      const followHeight = THREE.MathUtils.lerp(0.48, 0.28, t); // Low ground-skimming perspective
      const followFlank = THREE.MathUtils.lerp(0.38, 0.32 * flankDir + drift.lateral * 0.5, t);

      const followCamPos = carPos.clone()
        .addScaledVector(carTan, followDist)
        .addScaledVector(carNorm, followHeight)
        .addScaledVector(carBinorm, followFlank);

      // Look ahead through windshield along road curve
      const lookTarget = carPos.clone()
        .addScaledVector(carTan, 0.42)
        .addScaledVector(carNorm, 0.06);

      // Transition smoothly from stage 1 approach into tight chase
      const stage1Exit = new THREE.Vector3(1.25, 1.15, 4.8);
      this.targetCameraPos.lerpVectors(stage1Exit, followCamPos, t);
      this.targetCameraLookAt.lerpVectors(
        new THREE.Vector3(carPos.x * 0.5, carPos.y * 0.5 + 0.05, carPos.z * 0.5),
        lookTarget,
        t
      );

      // Dutch angle / banking tilt into drift curve
      const bankRoll = drift.yaw * -0.22 - (carNorm.x * 0.08);
      this.targetCameraUp.set(Math.sin(bankRoll), Math.cos(bankRoll), 0);

      // Lighting: Accentuate metallic flake & drift reflections
      this.rimCyanLight.intensity = 2.6;
      this.rimMagentaLight.intensity = 2.4;
    } else if (sp <= 0.75) {
      // -------------------------------------------------------------
      // STAGE 03 (0.5 to 0.75): CINEMATIC SIDE-ORBIT & CROSSING POV
      // -------------------------------------------------------------
      const t = (sp - 0.5) / 0.25; // 0 to 1

      // Edgy low-angle side profile tracking car as it cuts across the Möbius twist
      const sideCamPos = carPos.clone()
        .addScaledVector(carBinorm, THREE.MathUtils.lerp(1.4, 1.85, t))
        .addScaledVector(carNorm, THREE.MathUtils.lerp(0.32, 0.55, t))
        .addScaledVector(carTan, THREE.MathUtils.lerp(0.1, -0.25, t));

      const twistOrbitCam = new THREE.Vector3(
        -2.1 * Math.sin(time * 0.22),
        1.65,
        5.2
      );

      this.targetCameraPos.lerpVectors(sideCamPos, twistOrbitCam, t);
      this.targetCameraLookAt.lerpVectors(
        carPos.clone().addScaledVector(carNorm, 0.05),
        new THREE.Vector3(0, 0.1, 0),
        t * 0.55
      );

      // Dynamic tilt responding to track banking
      const sideTilt = Math.sin(time * 0.3) * 0.06;
      this.targetCameraUp.set(Math.sin(sideTilt), Math.cos(sideTilt), 0);

      // Lighting: Rich violet & neon cyan contrast
      this.rimCyanLight.intensity = 2.2;
      this.rimMagentaLight.intensity = 2.6;
    } else {
      // -------------------------------------------------------------
      // STAGE 04 (0.75 to 1.0): ELEVATED HERO APEX & EPIC HORIZON REVEAL
      // -------------------------------------------------------------
      const t = (sp - 0.75) / 0.25; // 0 to 1

      // Dramatic elevated isometric boom view framing the entire infinite racetrack
      const boomX = Math.sin(time * 0.16) * 0.5;
      this.targetCameraPos.set(
        boomX,
        THREE.MathUtils.lerp(1.9, 2.75, t),
        THREE.MathUtils.lerp(5.6, 8.8, t)
      );
      this.targetCameraLookAt.set(
        THREE.MathUtils.lerp(carPos.x * 0.15, 0.0, t),
        THREE.MathUtils.lerp(0.12, 0.18, t),
        THREE.MathUtils.lerp(carPos.z * 0.15, 0.0, t)
      );

      // Upright framing
      this.targetCameraUp.set(0, 1, 0);

      // Track energy activation
      this.trackMaterial.uniforms.uActivationPulse.value = (time * 1.6) % 1.2;
      this.rimCyanLight.intensity = 2.2;
      this.rimMagentaLight.intensity = 1.8;
    }

    // High-speed / Drift camera micro-shake (visceral action camera feel)
    const shakeIntensity = (drift.intensity * 0.016) + Math.min(Math.abs(this.scrollVelocity) * 0.02, 0.025);
    const shakeX = (Math.sin(time * 38.0) * 0.6 + Math.cos(time * 52.0) * 0.4) * shakeIntensity;
    const shakeY = (Math.cos(time * 44.0) * 0.6 + Math.sin(time * 61.0) * 0.4) * shakeIntensity;
    this.targetCameraPos.x += shakeX;
    this.targetCameraPos.y += shakeY;

    // Dynamic FOV (punching during drift / boost)
    const baseFov = 36.0;
    const targetFov = baseFov + (drift.intensity * 3.8) + Math.min(Math.abs(this.scrollVelocity) * 12.0, 4.5);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 3.5);
    this.camera.updateProjectionMatrix();

    // Smoothly damp camera position, look-at, and up orientation
    this.camera.position.lerp(this.targetCameraPos, Math.min(delta * 5.5, 0.95));
    this.currentCameraLookAt.lerp(this.targetCameraLookAt, Math.min(delta * 6.0, 0.95));
    this.currentCameraUp.lerp(this.targetCameraUp, Math.min(delta * 5.0, 0.95));
    this.camera.up.copy(this.currentCameraUp);
    this.camera.lookAt(this.currentCameraLookAt);
  }
}