import * as THREE from 'three';

export class MobiusSparkSystem {
  public mesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private particleCount: number;

  private positions: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private lifetimes: Float32Array;
  private maxLifetimes: Float32Array;
  private sizes: Float32Array;

  constructor(count = 500) {
    this.particleCount = count;
    this.geometry = new THREE.BufferGeometry();

    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.lifetimes = new Float32Array(count);
    this.maxLifetimes = new Float32Array(count);
    this.sizes = new Float32Array(count);

    // Initialize all particles safely off-screen
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 0] = 0.0;
      this.positions[i * 3 + 1] = 0.0;
      this.positions[i * 3 + 2] = -9999.0;
      this.lifetimes[i] = -1.0;
      this.maxLifetimes[i] = 1.0;
      this.sizes[i] = 4.0;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aLifetime', new THREE.BufferAttribute(this.lifetimes, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    const uniforms = {
      uTime: { value: 0.0 },
      uThemeTransition: { value: 0.0 },
    };

    const vertexShader = /* glsl */ `
      attribute vec3 aColor;
      attribute float aLifetime;
      attribute float aSize;

      uniform float uThemeTransition;

      varying vec3 vColor;
      varying float vLife;

      void main() {
        vLife = aLifetime;
        vColor = aColor;

        if (aLifetime < 0.0) {
          gl_Position = vec4(0.0, 0.0, -9999.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Controlled, crisp point size (tiny digital sparks, NOT giant discs)
        float lifeScale = 1.0 - aLifetime;
        float pSize = aSize * lifeScale * (35.0 / max(1.0, -mvPosition.z));
        gl_PointSize = clamp(pSize, 1.5, 12.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      varying vec3 vColor;
      varying float vLife;
      uniform float uThemeTransition;

      void main() {
        if (vLife < 0.0) discard;

        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        if (dist > 0.5) discard;

        // Sharp pinpoint spark with soft anti-aliased edge
        float alpha = smoothstep(0.5, 0.1, dist) * (1.0 - vLife);

        vec3 color = vColor;
        // In manga mode: crisp ink black or paper white shards
        if (uThemeTransition > 0.5) {
          color = (vColor.r > 0.5) ? vec3(0.96) : vec3(0.04);
        }

        gl_FragColor = vec4(color, alpha * 0.9);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  public emitAt(origin: THREE.Vector3, count = 4, isCyanBias = true): void {
    let emitted = 0;
    for (let i = 0; i < this.particleCount && emitted < count; i++) {
      if (this.lifetimes[i] < 0.0) {
        // Spawn particle near tip
        this.positions[i * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.08;
        this.positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.08;
        this.positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.08;

        const speed = 0.2 + Math.random() * 0.45;
        const theta = Math.random() * Math.PI * 2.0;
        const phi = (Math.random() - 0.5) * Math.PI;

        this.velocities[i * 3 + 0] = Math.cos(theta) * Math.cos(phi) * speed;
        this.velocities[i * 3 + 1] = Math.sin(phi) * speed + 0.15;
        this.velocities[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;

        this.lifetimes[i] = 0.0;
        this.maxLifetimes[i] = 0.3 + Math.random() * 0.4;
        this.sizes[i] = 2.5 + Math.random() * 4.0;

        if (isCyanBias || Math.random() < 0.7) {
          this.colors[i * 3 + 0] = 0.0;
          this.colors[i * 3 + 1] = 0.95;
          this.colors[i * 3 + 2] = 1.0;
        } else {
          this.colors[i * 3 + 0] = 1.0;
          this.colors[i * 3 + 1] = 0.08;
          this.colors[i * 3 + 2] = 0.82;
        }

        emitted++;
      }
    }
  }

  public update(delta: number, time: number, themeTransition: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uThemeTransition.value = themeTransition;

    let needsPosUpdate = false;
    let needsLifeUpdate = false;

    for (let i = 0; i < this.particleCount; i++) {
      if (this.lifetimes[i] >= 0.0) {
        this.lifetimes[i] += delta / this.maxLifetimes[i];

        if (this.lifetimes[i] >= 1.0) {
          this.lifetimes[i] = -1.0;
          this.positions[i * 3 + 2] = -9999.0;
        } else {
          this.velocities[i * 3 + 0] *= 0.95;
          this.velocities[i * 3 + 1] *= 0.95;
          this.velocities[i * 3 + 2] *= 0.95;

          this.positions[i * 3 + 0] += this.velocities[i * 3 + 0] * delta;
          this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
          this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;
        }

        needsPosUpdate = true;
        needsLifeUpdate = true;
      }
    }

    if (needsPosUpdate) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aLifetime.needsUpdate = true;
    }
  }
}
