import * as THREE from 'three';

export interface TrackFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  curvature: number;
}

export class MobiusTrack {
  public static readonly SAMPLES = 960;
  public static readonly A = 3.3;
  public static readonly B = 1.85;
  public static readonly C = 0.88;
  public static readonly WIDTH = 0.62;
  public static readonly THICKNESS = 0.082;

  public frames: TrackFrame[] = [];
  public totalLength = 0;
  public distances: number[] = [];

  constructor() {
    this.init();
  }

  public getCenterline(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(
      MobiusTrack.A * Math.sin(u),
      MobiusTrack.B * Math.sin(2.0 * u) * 0.5,
      MobiusTrack.C * Math.cos(u)
    );
    return out;
  }

  public getCarFrame(progress: number) {
    return this.getFrame(progress);
  }

  private getTangent(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    const eps = 1e-4;
    const p1 = this.getCenterline(u - eps);
    const p2 = this.getCenterline(u + eps);
    return out.subVectors(p2, p1).normalize();
  }

  private init(): void {
    const N = MobiusTrack.SAMPLES;
    const halfN = N / 2;

    // 1. Compute tangents for full 2 circuits (u from 0 to 4*PI)
    const tangents: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * Math.PI * 4.0;
      tangents.push(this.getTangent(u));
    }

    // 2. Parallel transport along the 2 circuits
    const initT = tangents[0];
    let initN = new THREE.Vector3(0, 0, 1).cross(initT);
    if (initN.lengthSq() < 1e-5) {
      initN = new THREE.Vector3(0, 1, 0).cross(initT);
    }
    initN.normalize();

    const refN: THREE.Vector3[] = [initN.clone()];
    const refB: THREE.Vector3[] = [new THREE.Vector3().crossVectors(initT, initN).normalize()];

    for (let i = 0; i < N; i++) {
      const ta = tangents[i];
      const tb = tangents[i + 1];
      const na = refN[i];
      const axis = new THREE.Vector3().crossVectors(ta, tb);
      const len = axis.length();
      let nb = na.clone();

      if (len > 1e-7) {
        axis.divideScalar(len);
        const dot = THREE.MathUtils.clamp(ta.dot(tb), -1, 1);
        nb.applyAxisAngle(axis, Math.acos(dot));
      }

      nb.sub(tb.clone().multiplyScalar(tb.dot(nb))).normalize();
      refN.push(nb);
      refB.push(new THREE.Vector3().crossVectors(tb, nb).normalize());
    }

    // 3. Exact Möbius holonomy compensation
    // Halfway (i = halfN = 1 circuit = 2*PI), normal must flip by exactly PI (180 deg)
    // Full circuit (i = N = 2 circuits = 4*PI), normal returns to exactly initial normal (+1.0 dot)
    const holoHalf = Math.atan2(refB[0].dot(refN[halfN]), refN[0].dot(refN[halfN]));
    const twistRate = Math.PI - holoHalf;
    const totalTwist = twistRate * 2.0;

    // 4. Build discrete track frames
    this.frames = [];
    this.distances = [0];
    let accumDist = 0;

    const halfThickness = MobiusTrack.THICKNESS * 0.5;

    for (let i = 0; i < N; i++) {
      const frac = i / N;
      const u = frac * Math.PI * 4.0;
      const center = this.getCenterline(u);
      const tangent = tangents[i];

      const theta = frac * totalTwist;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Ribbon surface normal
      const normal = refN[i].clone().multiplyScalar(cosT).addScaledVector(refB[i], sinT).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

      // Top driving surface position
      const surfacePos = center.clone().addScaledVector(normal, halfThickness);

      // Curvature approximation
      const nextCenter = this.getCenterline(u + 0.05);
      const prevCenter = this.getCenterline(u - 0.05);
      const curv = (nextCenter.distanceTo(center) + prevCenter.distanceTo(center)) * 0.5;

      this.frames.push({
        position: surfacePos,
        tangent,
        normal,
        binormal,
        curvature: Math.abs(Math.sin(u)),
      });

      if (i > 0) {
        accumDist += surfacePos.distanceTo(this.frames[i - 1].position);
        this.distances.push(accumDist);
      }
    }

    this.totalLength = accumDist;
  }

  /**
   * Returns interpolated position, tangent, normal, and orientation matrix
   * along the full 2-circuit Möbius racetrack for normalized progress [0, 1].
   */
  public getFrame(
    progress: number,
    lateralOffset = 0,
    verticalOffset = 0,
    yawOffset = 0,
    rollOffset = 0
  ): {
    position: THREE.Vector3;
    tangent: THREE.Vector3;
    normal: THREE.Vector3;
    binormal: THREE.Vector3;
    matrix: THREE.Matrix4;
    quaternion: THREE.Quaternion;
  } {
    const N = this.frames.length;
    // Wrap normalized progress strictly into [0, 1)
    const p = ((progress % 1.0) + 1.0) % 1.0;
    const indexFloat = p * N;
    const idx0 = Math.floor(indexFloat) % N;
    const idx1 = (idx0 + 1) % N;
    const frac = indexFloat - Math.floor(indexFloat);

    const f0 = this.frames[idx0];
    const f1 = this.frames[idx1];

    // Smoothly interpolate position, tangent, and normal
    const pos = f0.position.clone().lerp(f1.position, frac);
    const tangent = f0.tangent.clone().lerp(f1.tangent, frac).normalize();
    const normal = f0.normal.clone().lerp(f1.normal, frac).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    // Offset position across track width (lateral) and track normal (suspension/vertical)
    if (lateralOffset !== 0) {
      pos.addScaledVector(binormal, lateralOffset);
    }
    if (verticalOffset !== 0) {
      pos.addScaledVector(normal, verticalOffset);
    }

    // Apply drift yaw rotation around local normal
    let forward = tangent.clone();
    if (yawOffset !== 0) {
      forward.applyAxisAngle(normal, yawOffset);
    }

    // Apply body roll around local forward axis
    let up = normal.clone();
    if (rollOffset !== 0) {
      up.applyAxisAngle(forward, rollOffset);
    }

    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up = new THREE.Vector3().crossVectors(right, forward).normalize();

    // Build transformation matrix for the car
    const matrix = new THREE.Matrix4();
    matrix.makeBasis(right, up, forward.clone().negate()); // In Three.js, model forward is typically -Z or +Z
    matrix.setPosition(pos);

    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

    return {
      position: pos,
      tangent,
      normal,
      binormal,
      matrix,
      quaternion,
    };
  }
}
