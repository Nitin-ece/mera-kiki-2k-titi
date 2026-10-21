import * as THREE from 'three';

export class DriftEffects {
  public smokeMesh: THREE.Points;
  public trailMesh: THREE.LineSegments;

  private smokeCount = 180;
  private smokePositions: Float32Array;
  private smokeLifetimes: Float32Array;
  private smokeMaxLifetimes: Float32Array;
  private smokeSizes: Float32Array;
  private smokeColors: Float32Array;
  private smokeGeometry: THREE.BufferGeometry;

  private maxTrailPoints = 80;
  private trailPositions: Float32Array;
  private trailColors: Float32Array;
  private trailGeometry: THREE.BufferGeometry;
  private trailHistory: { left: THREE.Vector3; right: THREE.Vector3; alpha: number }[] = [];

  private themeTransition = 0.0;
  private glitchIntensity = 0.0;

  constructor() {
    // -------------------------------------------------------------
    // 1. Tire Smoke & Spark Particles
    // -------------------------------------------------------------
    this.smokePositions = new Float32Array(this.smokeCount * 3);
    this.smokeLifetimes = new Float32Array(this.smokeCount);
    this.smokeMaxLifetimes = new Float32Array(this.smokeCount);
    this.smokeSizes = new Float32Array(this.smokeCount);
    this.smokeColors = new Float32Array(this.smokeCount * 3);

    for (let i = 0; i < this.smokeCount; i++) {
      this.smokeLifetimes[i] = -1.0;
      this.smokeMaxLifetimes[i] = 0.5;
      this.smokePositions[i * 3 + 2] = -9999.0;
    }

    this.smokeGeometry = new THREE.BufferGeometry();
    this.smokeGeometry.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    this.smokeGeometry.setAttribute('aLifetime', new THREE.BufferAttribute(this.smokeLifetimes, 1));
    this.smokeGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.smokeSizes, 1));
    this.smokeGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.smokeColors, 3));

    const smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uThemeTransition: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        attribute float aLifetime;
        attribute float aSize;
        attribute vec3 aColor;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          if (aLifetime < 0.0) {
            gl_Position = vec4(0.0, 0.0, -9999.0, 1.0);
            gl_PointSize = 0.0;
            return;
          }
          vAlpha = 1.0 - aLifetime;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * vAlpha * (40.0 / max(1.0, -mvPosition.z));
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uThemeTransition;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          if (vAlpha <= 0.0) discard;
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;
          float falloff = smoothstep(0.5, 0.0, dist);

          vec4 cyberColor = vec4(vColor, falloff * vAlpha * 0.7);

          // Manga comic action smoke puff (crisp black ink border + white puff center)
          float inkBorder = smoothstep(0.48, 0.38, dist) - smoothstep(0.38, 0.28, dist);
          float whitePuff = smoothstep(0.38, 0.0, dist);
          vec3 mangaCol = mix(vec3(0.96, 0.96, 0.98), vec3(0.04, 0.04, 0.05), inkBorder);
          vec4 mangaColor = vec4(mangaCol, (whitePuff + inkBorder * 1.5) * vAlpha * 0.95);

          gl_FragColor = mix(cyberColor, mangaColor, uThemeTransition);
        }
      `,
    });

    this.smokeMesh = new THREE.Points(this.smokeGeometry, smokeMat);
    this.smokeMesh.frustumCulled = false;

    // -------------------------------------------------------------
    // 2. Taillight Neon Trails / Manga Calligraphy Brush Streaks
    // -------------------------------------------------------------
    this.trailPositions = new Float32Array(this.maxTrailPoints * 6);
    this.trailColors = new Float32Array(this.maxTrailPoints * 6);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));

    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });

    this.trailMesh = new THREE.LineSegments(this.trailGeometry, trailMat);
    this.trailMesh.frustumCulled = false;
  }

  public setThemeTransition(transition: number, glitchIntensity: number): void {
    this.themeTransition = transition;
    this.glitchIntensity = glitchIntensity;
    if (this.smokeMesh && this.smokeMesh.material) {
      const mat = this.smokeMesh.material as THREE.ShaderMaterial;
      if (mat.uniforms && mat.uniforms.uThemeTransition) {
        mat.uniforms.uThemeTransition.value = transition;
      }
    }
  }

  public emitDriftParticles(leftTire: THREE.Vector3, rightTire: THREE.Vector3, intensity: number): void {
    if (intensity <= 0.05) return;
    const countToEmit = Math.floor(intensity * 3);

    for (let c = 0; c < countToEmit; c++) {
      const origin = c % 2 === 0 ? leftTire : rightTire;
      for (let i = 0; i < this.smokeCount; i++) {
        if (this.smokeLifetimes[i] < 0.0) {
          this.smokePositions[i * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.04;
          this.smokePositions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.04;
          this.smokePositions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.04;

          this.smokeLifetimes[i] = 0.0;
          this.smokeMaxLifetimes[i] = 0.35 + Math.random() * 0.35;
          this.smokeSizes[i] = 16.0 + Math.random() * 18.0;

          // Electric cyan & magenta spark colors for cyberpunk drift
          if (Math.random() > 0.4) {
            this.smokeColors[i * 3 + 0] = 0.0;
            this.smokeColors[i * 3 + 1] = 0.95;
            this.smokeColors[i * 3 + 2] = 1.0;
          } else {
            this.smokeColors[i * 3 + 0] = 1.0;
            this.smokeColors[i * 3 + 1] = 0.08;
            this.smokeColors[i * 3 + 2] = 0.75;
          }
          break;
        }
      }
    }
  }

  public addTrailPoint(leftTail: THREE.Vector3, rightTail: THREE.Vector3, intensity: number): void {
    this.trailHistory.unshift({
      left: leftTail.clone(),
      right: rightTail.clone(),
      alpha: Math.min(1.0, intensity),
    });

    if (this.trailHistory.length > this.maxTrailPoints) {
      this.trailHistory.pop();
    }
  }

  public update(delta: number): void {
    // 1. Update smoke particles
    let smokeNeedsUpdate = false;
    for (let i = 0; i < this.smokeCount; i++) {
      if (this.smokeLifetimes[i] >= 0.0) {
        this.smokeLifetimes[i] += delta / this.smokeMaxLifetimes[i];
        if (this.smokeLifetimes[i] >= 1.0) {
          this.smokeLifetimes[i] = -1.0;
          this.smokePositions[i * 3 + 2] = -9999.0;
        }
        smokeNeedsUpdate = true;
      }
    }
    if (smokeNeedsUpdate) {
      this.smokeGeometry.attributes.position.needsUpdate = true;
      this.smokeGeometry.attributes.aLifetime.needsUpdate = true;
    }

    // 2. Update taillight neon lines / manga calligraphy ink streaks
    const isManga = this.themeTransition >= 0.5;
    let segIdx = 0;
    for (let i = 0; i < this.trailHistory.length - 1; i++) {
      const p0 = this.trailHistory[i];
      const p1 = this.trailHistory[i + 1];

      const lifeFrac = 1.0 - i / this.trailHistory.length;
      const alpha = p0.alpha * lifeFrac;

      // In Cyber: hot magenta/red neon; in Manga: deep sumi ink stroke
      const r = isManga ? 0.05 * alpha : 1.0 * alpha;
      const g = isManga ? 0.05 * alpha : 0.05 * alpha;
      const b = isManga ? 0.06 * alpha : 0.4 * alpha;

      // Left light trail segment
      this.trailPositions[segIdx * 3 + 0] = p0.left.x;
      this.trailPositions[segIdx * 3 + 1] = p0.left.y;
      this.trailPositions[segIdx * 3 + 2] = p0.left.z;
      this.trailColors[segIdx * 3 + 0] = r;
      this.trailColors[segIdx * 3 + 1] = g;
      this.trailColors[segIdx * 3 + 2] = b;
      segIdx++;

      this.trailPositions[segIdx * 3 + 0] = p1.left.x;
      this.trailPositions[segIdx * 3 + 1] = p1.left.y;
      this.trailPositions[segIdx * 3 + 2] = p1.left.z;
      this.trailColors[segIdx * 3 + 0] = r;
      this.trailColors[segIdx * 3 + 1] = g;
      this.trailColors[segIdx * 3 + 2] = b;
      segIdx++;

      // Right light trail segment
      this.trailPositions[segIdx * 3 + 0] = p0.right.x;
      this.trailPositions[segIdx * 3 + 1] = p0.right.y;
      this.trailPositions[segIdx * 3 + 2] = p0.right.z;
      this.trailColors[segIdx * 3 + 0] = r;
      this.trailColors[segIdx * 3 + 1] = g;
      this.trailColors[segIdx * 3 + 2] = b;
      segIdx++;

      this.trailPositions[segIdx * 3 + 0] = p1.right.x;
      this.trailPositions[segIdx * 3 + 1] = p1.right.y;
      this.trailPositions[segIdx * 3 + 2] = p1.right.z;
      this.trailColors[segIdx * 3 + 0] = r;
      this.trailColors[segIdx * 3 + 1] = g;
      this.trailColors[segIdx * 3 + 2] = b;
      segIdx++;
    }

    // Zero out remaining inactive segments
    for (let i = segIdx; i < this.maxTrailPoints * 2; i++) {
      this.trailPositions[i * 3 + 0] = 0;
      this.trailPositions[i * 3 + 1] = 0;
      this.trailPositions[i * 3 + 2] = -9999.0;
      this.trailColors[i * 3 + 0] = 0;
      this.trailColors[i * 3 + 1] = 0;
      this.trailColors[i * 3 + 2] = 0;
    }

    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
  }
}
