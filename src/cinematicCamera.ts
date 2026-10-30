import * as THREE from 'three';
import { TrackFrame } from './mobiusTrack';

export interface CinematicCameraOptions {
  camera: THREE.PerspectiveCamera;
}

export class CinematicCamera {
  public camera: THREE.PerspectiveCamera;

  // Camera targets for smooth damping
  public currentPos = new THREE.Vector3(2.5, 3.8, 9.2);
  public targetPos = new THREE.Vector3(2.5, 3.8, 9.2);

  public currentLookAt = new THREE.Vector3(0, 0.1, 0);
  public targetLookAt = new THREE.Vector3(0, 0.1, 0);

  public currentUp = new THREE.Vector3(0, 1, 0);
  public targetUp = new THREE.Vector3(0, 1, 0);

  public targetFov = 38.0;
  public baseFov = 38.0;

  // Interactive mouse parallax
  public mouseOffset = new THREE.Vector2(0, 0);
  public targetMouseOffset = new THREE.Vector2(0, 0);

  constructor(options: CinematicCameraOptions) {
    this.camera = options.camera;
    this.camera.position.copy(this.currentPos);
    this.camera.up.copy(this.currentUp);
    this.camera.lookAt(this.currentLookAt);

    // Setup subtle mouse move listener for parallax depth
    window.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.targetMouseOffset.set(nx * 0.35, ny * 0.22);
    });
  }

  /**
   * Evaluates camera position and orientation according to scroll progress (0.0 to 1.0)
   * seamlessly moving across Cameras A, B, C, D, E, and F.
   */
  public updateChoreography(
    scrollProgress: number,
    scrollVelocity: number,
    carFrame: TrackFrame,
    driftIntensity: number,
    driftYaw: number,
    time: number
  ): void {
    const sp = THREE.MathUtils.clamp(scrollProgress, 0, 1);
    const carPos = carFrame.position;
    const carTan = carFrame.tangent;
    const carNorm = carFrame.normal;
    const carBinorm = carFrame.binormal;

    // Mouse parallax damping
    this.mouseOffset.lerp(this.targetMouseOffset, 0.05);

    // -------------------------------------------------------------
    // CAMERA A: EPIC ESTABLISHING SHOT (0.00 <= sp < 0.18)
    // Elevated 3/4 orbital angle revealing the entire Möbius track
    // suspended high above the glowing cyberpunk megacity.
    // -------------------------------------------------------------
    if (sp < 0.18) {
      const t = sp / 0.18; // 0 to 1
      const orbitAngle = time * 0.12;
      const orbitX = Math.sin(orbitAngle) * 1.2;
      const orbitZ = Math.cos(orbitAngle) * 0.8;

      // Elevated vantage point looking down and across at the circuit
      const startPos = new THREE.Vector3(2.8 + orbitX, 3.6, 9.4 + orbitZ);
      // Moves closer toward the track as scroll begins
      const approachPos = new THREE.Vector3(1.8, 2.4, 6.2);

      this.targetPos.lerpVectors(startPos, approachPos, t);
      this.targetLookAt.set(
        THREE.MathUtils.lerp(0.0, carPos.x * 0.3, t),
        THREE.MathUtils.lerp(0.15, carPos.y * 0.3, t),
        THREE.MathUtils.lerp(0.0, carPos.z * 0.3, t)
      );

      this.targetUp.set(0, 1, 0);
      this.baseFov = THREE.MathUtils.lerp(38.0, 36.0, t);
    }
    // -------------------------------------------------------------
    // CAMERA B: LOW-ANGLE HERO SHOT (0.18 <= sp < 0.36)
    // Low, aggressive wide-angle shot hugging the front quarter panel.
    // Captures headlights, hood reflections, and track curving into the sky.
    // -------------------------------------------------------------
    else if (sp < 0.36) {
      const t = (sp - 0.18) / 0.18;

      // Position in front of the vehicle, low to track surface
      const heroDist = THREE.MathUtils.lerp(1.25, 0.88, t);
      const heroHeight = THREE.MathUtils.lerp(0.32, 0.18, t);
      const heroFlank = THREE.MathUtils.lerp(0.48, 0.35, t);

      const frontHeroPos = carPos.clone()
        .addScaledVector(carTan, heroDist)
        .addScaledVector(carNorm, heroHeight)
        .addScaledVector(carBinorm, heroFlank);

      // Look back at vehicle headlights and cabin
      const frontHeroLook = carPos.clone()
        .addScaledVector(carNorm, 0.08)
        .addScaledVector(carTan, -0.15);

      const stageAExit = new THREE.Vector3(1.8, 2.4, 6.2);
      this.targetPos.lerpVectors(stageAExit, frontHeroPos, t);
      this.targetLookAt.lerpVectors(new THREE.Vector3(0, 0.15, 0), frontHeroLook, t);

      // Heroic camera roll following road banking
      const heroRoll = driftYaw * 0.25 + (carNorm.x * 0.12);
      this.targetUp.set(Math.sin(heroRoll), Math.cos(heroRoll), 0);
      this.baseFov = 37.0;
    }
    // -------------------------------------------------------------
    // CAMERA C: HIGH-SPEED REAR CHASE (0.36 <= sp < 0.58)
    // Over-the-shoulder chase cam trailing low behind the vehicle.
    // Track rushes ahead into the city skyline. Speed emphasis.
    // -------------------------------------------------------------
    else if (sp < 0.58) {
      const t = (sp - 0.36) / 0.22;

      // Dynamic close follow cam
      const followDist = THREE.MathUtils.lerp(-1.42, -1.15, t);
      const followHeight = THREE.MathUtils.lerp(0.42, 0.26, t);
      const followFlank = THREE.MathUtils.lerp(0.15, -0.2 * Math.sign(driftYaw || 1), t);

      const chaseCamPos = carPos.clone()
        .addScaledVector(carTan, followDist)
        .addScaledVector(carNorm, followHeight)
        .addScaledVector(carBinorm, followFlank);

      // Look ahead over hood into the road curve
      const chaseLook = carPos.clone()
        .addScaledVector(carTan, 0.75)
        .addScaledVector(carNorm, 0.12);

      // Smooth transition from front hero into rear chase
      const prevHeroExit = carPos.clone()
        .addScaledVector(carTan, 0.88)
        .addScaledVector(carNorm, 0.18)
        .addScaledVector(carBinorm, 0.35);

      this.targetPos.lerpVectors(prevHeroExit, chaseCamPos, Math.min(t * 1.4, 1.0));
      this.targetLookAt.lerpVectors(carPos, chaseLook, t);

      // Dynamic banking tilt
      const bankRoll = driftYaw * -0.32 - (carNorm.x * 0.15);
      this.targetUp.set(Math.sin(bankRoll), Math.cos(bankRoll), 0);
      this.baseFov = THREE.MathUtils.lerp(38.0, 42.0, t); // Wider FOV for high-speed rush
    }
    // -------------------------------------------------------------
    // CAMERA D: SIDE DRIFT CINEMATIC (0.58 <= sp < 0.74)
    // Side profile tracking alongside the vehicle during drift curves.
    // Shows counter-steering, tire smoke, and Möbius twist in background.
    // -------------------------------------------------------------
    else if (sp < 0.74) {
      const t = (sp - 0.58) / 0.16;

      const sideDist = THREE.MathUtils.lerp(1.55, 1.85, t);
      const sideHeight = THREE.MathUtils.lerp(0.35, 0.48, t);
      const sideFore = THREE.MathUtils.lerp(0.12, -0.22, t);

      const sideCamPos = carPos.clone()
        .addScaledVector(carBinorm, sideDist)
        .addScaledVector(carNorm, sideHeight)
        .addScaledVector(carTan, sideFore);

      const sideLook = carPos.clone().addScaledVector(carNorm, 0.08);

      this.targetPos.copy(sideCamPos);
      this.targetLookAt.copy(sideLook);

      // Controlled Dutch angle for visceral drift action
      const dutchTilt = driftYaw * 0.45 + Math.sin(time * 2.0) * 0.04;
      this.targetUp.set(Math.sin(dutchTilt), Math.cos(dutchTilt), 0);
      this.baseFov = 35.0;
    }
    // -------------------------------------------------------------
    // CAMERA E: MÖBIUS TWIST CROSSING (0.74 <= sp < 0.86)
    // Signature topological sequence! Orbiting around car as it navigates
    // the half-twist crossing. Reveals the 180° inverted surface orientation.
    // -------------------------------------------------------------
    else if (sp < 0.86) {
      const t = (sp - 0.74) / 0.12;

      // Elevated helical orbit around the crossing center
      const twistOrbitRadius = THREE.MathUtils.lerp(2.2, 3.4, t);
      const twistHeight = THREE.MathUtils.lerp(0.65, 1.85, t);
      const orbitRot = t * Math.PI * 1.5;

      const twistCamPos = carPos.clone()
        .addScaledVector(carBinorm, Math.sin(orbitRot) * twistOrbitRadius)
        .addScaledVector(carTan, Math.cos(orbitRot) * twistOrbitRadius * 0.8)
        .addScaledVector(carNorm, twistHeight);

      // Target vehicle center and the twisted track axis
      const crossingCenter = new THREE.Vector3(0, 0, 0);
      const twistLook = new THREE.Vector3().lerpVectors(carPos, crossingCenter, 0.35);

      this.targetPos.copy(twistCamPos);
      this.targetLookAt.copy(twistLook);

      // Dynamic inversion roll capturing the half-twist
      const twistRoll = THREE.MathUtils.lerp(0.0, Math.PI * 0.35, Math.sin(t * Math.PI));
      this.targetUp.set(Math.sin(twistRoll), Math.cos(twistRoll), 0);
      this.baseFov = THREE.MathUtils.lerp(36.0, 39.0, t);
    }
    // -------------------------------------------------------------
    // CAMERA F: EPIC FINAL REVEAL (0.86 <= sp <= 1.00)
    // Pulls camera far away to reveal the entire illuminated Möbius
    // circuit suspended above the futuristic metropolis.
    // -------------------------------------------------------------
    else {
      const t = (sp - 0.86) / 0.14;

      const grandOrbitX = Math.sin(time * 0.15) * 0.8;
      const revealPos = new THREE.Vector3(
        grandOrbitX,
        THREE.MathUtils.lerp(2.4, 4.2, t),
        THREE.MathUtils.lerp(6.8, 10.8, t)
      );

      const revealLook = new THREE.Vector3(
        THREE.MathUtils.lerp(carPos.x * 0.2, 0.0, t),
        THREE.MathUtils.lerp(0.12, 0.25, t),
        THREE.MathUtils.lerp(carPos.z * 0.2, 0.0, t)
      );

      this.targetPos.copy(revealPos);
      this.targetLookAt.copy(revealLook);
      this.targetUp.set(0, 1, 0);
      this.baseFov = THREE.MathUtils.lerp(37.0, 35.0, t);
    }

    // High-speed / Drift camera micro-shake
    const shakeIntensity = (driftIntensity * 0.018) + Math.min(Math.abs(scrollVelocity) * 0.025, 0.03);
    const shakeX = (Math.sin(time * 42.0) * 0.6 + Math.cos(time * 58.0) * 0.4) * shakeIntensity;
    const shakeY = (Math.cos(time * 48.0) * 0.6 + Math.sin(time * 66.0) * 0.4) * shakeIntensity;

    this.targetPos.x += shakeX + this.mouseOffset.x;
    this.targetPos.y += shakeY + this.mouseOffset.y;
    this.targetLookAt.x += this.mouseOffset.x * 0.3;
    this.targetLookAt.y += this.mouseOffset.y * 0.3;

    // Dynamic FOV calculation
    const fovBoost = (driftIntensity * 4.2) + Math.min(Math.abs(scrollVelocity) * 14.0, 5.0);
    this.targetFov = this.baseFov + fovBoost;
  }

  /**
   * Applies smooth damping to camera position, orientation, and FOV
   */
  public update(delta: number): void {
    const posLerp = Math.min(delta * 5.2, 0.95);
    const lookLerp = Math.min(delta * 5.8, 0.95);
    const upLerp = Math.min(delta * 4.8, 0.95);
    const fovLerp = Math.min(delta * 4.2, 0.95);

    this.currentPos.lerp(this.targetPos, posLerp);
    this.currentLookAt.lerp(this.targetLookAt, lookLerp);
    this.currentUp.lerp(this.targetUp, upLerp);

    this.camera.position.copy(this.currentPos);
    this.camera.up.copy(this.currentUp);
    this.camera.lookAt(this.currentLookAt);

    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, fovLerp);
    this.camera.updateProjectionMatrix();
  }
}

