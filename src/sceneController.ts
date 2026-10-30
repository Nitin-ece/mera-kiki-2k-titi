import * as THREE from 'three';
import { MobiusTrack, TrackFrame } from './mobiusTrack';
import { loadCyberpunkCar, CarController } from './carModel';
import { DriftEffects } from './driftEffects';
import { createMobiusStripGeometry } from './mobiusGeometry';
import { createMobiusShaderMaterial } from './mobiusShader';
import { CyberpunkEnvironment } from './cyberpunkEnvironment';
import { CinematicCamera } from './cinematicCamera';

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
  public environment: CyberpunkEnvironment;
  public cinematicCamera: CinematicCamera;

  public trackMesh: THREE.Mesh;
  public trackMaterial: THREE.ShaderMaterial;

  // Direct lighting references (also managed via environment)
  public keyLight: THREE.DirectionalLight;
  public rimCyanLight: THREE.DirectionalLight;
  public rimMagentaLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;

  // Scroll state & narrative animation
  public scrollProgress = 0; // 0.0 to 1.0 (from ScrollTrigger)
  public scrollVelocity = 0;
  public carProgress = 0; // Continuous track progress [0, 1)
  public carSpeed = 0.048; // Base automatic driving speed

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
    this.trackMesh.castShadow = true;
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);

    // 3. Initialize drift effects (tire smoke, sparks, taillight trails)
    this.driftEffects = new DriftEffects();
    this.scene.add(this.driftEffects.smokeMesh);
    this.scene.add(this.driftEffects.trailMesh);

    // 4. Initialize Cyberpunk Megacity Environment & Atmospherics
    this.environment = new CyberpunkEnvironment(this.scene, this.renderer);
    this.scene.add(this.environment.group);

    // Bind light references
    this.keyLight = this.environment.keyDirectional;
    this.rimCyanLight = this.environment.rimCyanLight;
    this.rimMagentaLight = this.environment.rimMagentaLight;
    this.ambientLight = new THREE.AmbientLight(0x060914, 0.85);
    this.scene.add(this.ambientLight);

    // 5. Initialize Choreographed Cinematic Camera System
    this.cinematicCamera = new CinematicCamera({ camera: this.camera });

    // 6. Load the 3D Cyberpunk car asynchronously
    this.initCar();
  }

  private async initCar(): Promise<void> {
    this.car = await loadCyberpunkCar();
    this.scene.add(this.car.group);
  }

  /**
   * Evaluates drift intensity and yaw based on normalized car track progress.
   */
  private evaluateDrift(progress: number): { intensity: number; yaw: number; roll: number; lateral: number } {
    const p = ((progress % 1.0) + 1.0) % 1.0;

    // Define 3 curved drift zones along the 2-circuit route
    const zones = [
      { start: 0.16, end: 0.28, direction: 1.0 },  // Zone 1: High-speed sweep
      { start: 0.44, end: 0.56, direction: -1.0 }, // Zone 2: Crossing twist transition
      { start: 0.70, end: 0.82, direction: 1.0 },  // Zone 3: Apex banking
    ];

    let intensity = 0;
    let dir = 1.0;

    for (const z of zones) {
      if (p >= z.start && p <= z.end) {
        const t = (p - z.start) / (z.end - z.start); // 0 to 1
        intensity = Math.sin(t * Math.PI);
        dir = z.direction;
        break;
      }
    }

    return {
      intensity,
      yaw: dir * intensity * 0.24,     // ~13.7 deg yaw slip
      roll: -dir * intensity * 0.10,   // chassis body roll into curve
      lateral: dir * intensity * 0.045,// tire slip offset across lane
    };
  }

  /**
   * Updates camera choreography based on normalized scroll progress (0.0 to 1.0).
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
    const speedKmh = Math.round((this.carSpeed * 3400) + Math.abs(this.scrollVelocity) * 140 + drift.intensity * 45);
    const driftDeg = (drift.yaw * (180 / Math.PI)).toFixed(1);
    const lateralG = (0.28 + Math.abs(drift.yaw) * 4.8 + drift.intensity * 1.4).toFixed(2);
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
    // 1. Evaluate drift dynamics
    const drift = this.evaluateDrift(this.carProgress);

    // Möbius Crossing acceleration boost surge (~carProgress 0.48-0.54 or scrollStage 3)
    const isCrossingZone = Math.abs(this.carProgress - 0.5) < 0.05;
    const crossingBoost = isCrossingZone ? 0.035 : 0.0;

    // Advance car along Möbius track
    const currentSpeed = this.carSpeed + Math.min(Math.abs(this.scrollVelocity) * 0.08, 0.16) + crossingBoost;
    this.carProgress = (this.carProgress + currentSpeed * delta) % 1.0;

    // 2. Compute exact track frame & attach car to track surface
    const suspension = Math.sin(time * 14.0) * 0.003; // Micro suspension vibration
    const trackTransform: TrackFrame = this.track.getFrame(
      this.carProgress,
      drift.lateral,
      0.0, // surface contact
      drift.yaw,
      drift.roll
    );

    if (this.car) {
      this.car.group.position.copy(trackTransform.position);
      this.car.group.quaternion.copy(trackTransform.quaternion);

      // Check if thruster boost is active (during acceleration, scroll velocity, drift, or crossing)
      const isBoosting = drift.intensity > 0.12 ||
                         Math.abs(this.scrollVelocity) > 0.03 ||
                         isCrossingZone ||
                         (this.scrollProgress > 0.22 && this.scrollProgress < 0.52);

      // Update car internal controllers (wheels, roll, headlights, plasma thrusters)
      this.car.update(delta, time, currentSpeed, drift.yaw, drift.roll, suspension, isBoosting);

      // Taillights intensify subtly during drift/braking
      this.car.setTaillightIntensity(1.0 + drift.intensity * 0.5 + (isBoosting ? 0.25 : 0.0));

      // 3. Emit drift smoke & taillight trails (minimal, clean)
      const leftTire = this.car.getLeftRearTirePosition();
      const rightTire = this.car.getRightRearTirePosition();
      const leftTail = this.car.getLeftTaillightPosition();
      const rightTail = this.car.getRightTaillightPosition();

      this.driftEffects.emitDriftParticles(leftTire, rightTire, drift.intensity * 0.7);
      this.driftEffects.addTrailPoint(leftTail, rightTail, 0.25 + drift.intensity * 0.3);
    }

    this.driftEffects.update(delta);

    // 4. Update Track Shaders & Activation Pulses
    this.trackMaterial.uniforms.uTime.value = time;
    if (this.scrollProgress > 0.75) {
      this.trackMaterial.uniforms.uActivationPulse.value = (time * 1.8) % 1.2;
    } else {
      this.trackMaterial.uniforms.uActivationPulse.value = -1.0;
    }

    // 5. Update Cyberpunk Megacity Environment
    this.environment.update(delta, time);

    // 6. Update Cinematic Camera Choreography & Smooth Damping
    this.cinematicCamera.updateChoreography(
      this.scrollProgress,
      this.scrollVelocity,
      trackTransform,
      drift.intensity,
      drift.yaw,
      time
    );
    this.cinematicCamera.update(delta);
  }

  public dispose(): void {
    this.environment.dispose();
    this.trackMesh.geometry.dispose();
    this.trackMaterial.dispose();
  }
}
