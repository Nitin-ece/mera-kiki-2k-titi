import * as THREE from 'three';

export interface MobiusGeometryOptions {
  uSegments?: number;
  vSegments?: number;
  width?: number;
  thickness?: number;
  a?: number; // X amplitude (width)
  b?: number; // Y amplitude (height)
  c?: number; // Z depth arch (crossing clearance)
}

/**
 * Creates a genuine, single-sided, mathematically precise 3D Möbius strip ribbon
 * with continuous thickness, rounded edge bevels, and rotation-minimizing transport frame.
 */
export function createMobiusStripGeometry(options: MobiusGeometryOptions = {}): THREE.BufferGeometry {
  const Nu = options.uSegments ?? 480;
  const Nv = (options.vSegments ?? 32) % 2 === 0 ? (options.vSegments ?? 32) : 32;
  const width = options.width ?? 0.62;
  const thickness = options.thickness ?? 0.082;
  const a = options.a ?? 3.3;
  const b = options.b ?? 1.85;
  const c = options.c ?? 0.88;

  // 1. Centerline parametric curve
  function getCenterline(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(
      a * Math.sin(u),
      b * Math.sin(2.0 * u) * 0.5,
      c * Math.cos(u)
    );
    return out;
  }

  // Tangent derivative
  function getTangent(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    const eps = 1e-4;
    const p1 = getCenterline(u - eps);
    const p2 = getCenterline(u + eps);
    return out.subVectors(p2, p1).normalize();
  }

  // 2. Precompute tangents and centers
  const tangents: THREE.Vector3[] = [];
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= Nu; i++) {
    const u = (i / Nu) * Math.PI * 2.0;
    centers.push(getCenterline(u));
    tangents.push(getTangent(u));
  }

  // 3. Bishop Frame (Parallel Transport)
  const refNormals: THREE.Vector3[] = new Array(Nu + 1);
  const refBinormals: THREE.Vector3[] = new Array(Nu + 1);

  const initT = tangents[0];
  let initN = new THREE.Vector3(0, 0, 1).cross(initT);
  if (initN.lengthSq() < 1e-5) {
    initN = new THREE.Vector3(0, 1, 0).cross(initT);
  }
  initN.normalize();
  refNormals[0] = initN.clone();
  refBinormals[0] = new THREE.Vector3().crossVectors(initT, initN).normalize();

  for (let i = 0; i < Nu; i++) {
    const t0 = tangents[i];
    const t1 = tangents[i + 1];
    const n0 = refNormals[i];

    const axis = new THREE.Vector3().crossVectors(t0, t1);
    const axisLen = axis.length();
    let n1 = n0.clone();

    if (axisLen > 1e-7) {
      axis.divideScalar(axisLen);
      const dot = THREE.MathUtils.clamp(t0.dot(t1), -1, 1);
      n1.applyAxisAngle(axis, Math.acos(dot));
    }

    n1.sub(t1.clone().multiplyScalar(t1.dot(n1))).normalize();
    const b1 = new THREE.Vector3().crossVectors(t1, n1).normalize();

    refNormals[i + 1] = n1;
    refBinormals[i + 1] = b1;
  }

  // Holonomy angle
  const nEnd = refNormals[Nu];
  const b0 = refBinormals[0];
  const n0 = refNormals[0];
  const holonomyAngle = Math.atan2(b0.dot(nEnd), n0.dot(nEnd));
  const totalTwist = Math.PI - holonomyAngle;

  // 4. Symmetric Pill Cross-Section
  const halfW = width * 0.5;
  const halfH = thickness * 0.5;
  const radius = halfH;
  const wFlat = Math.max(0.01, halfW - radius);

  const csPoints: { x: number; y: number; nx: number; ny: number; isEdge: number; faceSide: number }[] = [];
  const halfNv = Nv / 2;

  for (let j = 0; j < Nv; j++) {
    if (j < halfNv) {
      const frac = j / (halfNv - 1);
      if (frac < 0.35) {
        // Top flat region
        const t = frac / 0.35;
        const x = t * wFlat;
        const y = halfH;
        csPoints.push({ x, y, nx: 0, ny: 1, isEdge: 0.0, faceSide: 1.0 });
      } else if (frac < 0.65) {
        // Right rounded cap (outer edge)
        const t = (frac - 0.35) / 0.3;
        const angle = Math.PI * 0.5 - t * Math.PI;
        const x = wFlat + radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        csPoints.push({ x, y, nx, ny, isEdge: 1.0, faceSide: 0.0 });
      } else {
        // Bottom flat region
        const t = (frac - 0.65) / 0.35;
        const x = (1.0 - t) * wFlat;
        const y = -halfH;
        csPoints.push({ x, y, nx: 0, ny: -1, isEdge: 0.0, faceSide: -1.0 });
      }
    } else {
      // Antipodal symmetry
      const mirror = csPoints[j - halfNv];
      csPoints.push({
        x: -mirror.x,
        y: -mirror.y,
        nx: -mirror.nx,
        ny: -mirror.ny,
        isEdge: mirror.isEdge,
        faceSide: -mirror.faceSide
      });
    }
  }

  // 5. Generate Vertex Buffer
  const totalRings = Nu + 1;
  const numVerts = totalRings * Nv;

  const positions = new Float32Array(numVerts * 3);
  const normals = new Float32Array(numVerts * 3);
  const uvs = new Float32Array(numVerts * 2);
  const edgeFactors = new Float32Array(numVerts);
  const progressCoords = new Float32Array(numVerts);
  const twistIntensities = new Float32Array(numVerts);
  const faceSides = new Float32Array(numVerts);

  let vIdx = 0;
  for (let i = 0; i <= Nu; i++) {
    const s = i / Nu;
    const u = s * Math.PI * 2.0;
    const center = centers[i];
    const rNorm = refNormals[i];
    const rBinorm = refBinormals[i];

    const theta = s * totalTwist;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const mNorm = new THREE.Vector3()
      .copy(rNorm).multiplyScalar(cosT)
      .addScaledVector(rBinorm, sinT)
      .normalize();

    const mBinorm = new THREE.Vector3()
      .copy(rNorm).multiplyScalar(-sinT)
      .addScaledVector(rBinorm, cosT)
      .normalize();

    // Curvature & twist factor for magenta concentration
    const twistFactor = Math.abs(Math.sin(u * 2.0)) * 0.75 + 0.25;

    for (let j = 0; j < Nv; j++) {
      const cp = csPoints[j];

      positions[vIdx * 3 + 0] = center.x + cp.x * mBinorm.x + cp.y * mNorm.x;
      positions[vIdx * 3 + 1] = center.y + cp.x * mBinorm.y + cp.y * mNorm.y;
      positions[vIdx * 3 + 2] = center.z + cp.x * mBinorm.z + cp.y * mNorm.z;

      normals[vIdx * 3 + 0] = cp.nx * mBinorm.x + cp.ny * mNorm.x;
      normals[vIdx * 3 + 1] = cp.nx * mBinorm.y + cp.ny * mNorm.y;
      normals[vIdx * 3 + 2] = cp.nx * mBinorm.z + cp.ny * mNorm.z;

      uvs[vIdx * 2 + 0] = s;
      uvs[vIdx * 2 + 1] = j / Nv;

      edgeFactors[vIdx] = cp.isEdge;
      progressCoords[vIdx] = s;
      twistIntensities[vIdx] = twistFactor;
      faceSides[vIdx] = cp.faceSide;

      vIdx++;
    }
  }

  // 6. Connect Triangles
  const indices: number[] = [];
  for (let i = 0; i < Nu; i++) {
    const ringA = i * Nv;
    const ringB = (i + 1) * Nv;

    for (let j = 0; j < Nv; j++) {
      const nextJ = (j + 1) % Nv;

      const a0 = ringA + j;
      const a1 = ringA + nextJ;
      const b0 = ringB + j;
      const b1 = ringB + nextJ;

      indices.push(a0, a1, b1);
      indices.push(a0, b1, b0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aEdgeFactor', new THREE.BufferAttribute(edgeFactors, 1));
  geometry.setAttribute('aProgressCoord', new THREE.BufferAttribute(progressCoords, 1));
  geometry.setAttribute('aTwistIntensity', new THREE.BufferAttribute(twistIntensities, 1));
  geometry.setAttribute('aFaceSide', new THREE.BufferAttribute(faceSides, 1));
  geometry.setIndex(indices);

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}
