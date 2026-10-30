import * as THREE from 'three';

export class AtmosphericEffects {
  public group: THREE.Group;
  private groundFogMesh: THREE.Mesh | null = null;
  private groundFogMaterial: THREE.ShaderMaterial | null = null;
  private skyDomeMesh: THREE.Mesh | null = null;
  private skyDomeMaterial: THREE.ShaderMaterial | null = null;
  private particlesMesh: THREE.Points | null = null;
  private materials: THREE.Material[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'AtmosphericEffects';

    // 1. Setup scene exponential fog for natural atmospheric depth
    scene.fog = new THREE.FogExp2(0x02050c, 0.012);

    // 2. Initialize Layered Abyssal Ground Fog
    this.initGroundFog();

    // 3. Initialize Atmospheric Cyber Sky Dome
    this.initSkyDome();

    // 4. Initialize Drifting Cyber Dust & Atmosphere Particles
    this.initFloatingParticles();
  }

  private initGroundFog(): void {
    // Large circular plane in the deep city basin
    const geo = new THREE.PlaneGeometry(160, 160, 48, 48);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x002c44) }, // Deep ambient cyan
        uColorB: { value: new THREE.Color(0x280436) }, // Deep ambient violet
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Rolling atmospheric fog waves
          float wave1 = sin(pos.x * 0.08 + uTime * 0.4) * cos(pos.z * 0.08 + uTime * 0.3) * 1.8;
          float wave2 = sin(pos.x * 0.04 - uTime * 0.2) * cos(pos.z * 0.05 + uTime * 0.25) * 2.2;
          pos.y += wave1 + wave2;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          // Soft radial falloff from center of city canyon
          float distFromCenter = length(vWorldPosition.xz);
          float radialFade = smoothstep(80.0, 12.0, distFromCenter);

          // Moving turbulent mist density
          float noise = sin(vWorldPosition.x * 0.06 + uTime * 0.25) *
                        cos(vWorldPosition.z * 0.06 - uTime * 0.2) * 0.5 + 0.5;

          // Blend cyan and violet atmospheric scatter (minimal soft mist)
          vec3 fogColor = mix(uColorA, uColorB, noise);

          float alpha = radialFade * (0.2 + 0.2 * noise) * 0.35;
          gl_FragColor = vec4(fogColor * 0.9, alpha);
        }
      `,
    });

    this.groundFogMaterial = mat;
    this.materials.push(mat);

    this.groundFogMesh = new THREE.Mesh(geo, mat);
    this.groundFogMesh.position.y = -14.5; // Resides in lower skyscraper canyon
    this.group.add(this.groundFogMesh);
  }

  private initSkyDome(): void {
    const geo = new THREE.SphereGeometry(140, 32, 24);

    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uZenithColor: { value: new THREE.Color(0x010307) },
        uHorizonColor: { value: new THREE.Color(0x040b18) },
        uGlowColor: { value: new THREE.Color(0x00f5ff) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGlowColor;
        varying vec3 vWorldPosition;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float heightFactor = clamp(dir.y * 1.5 + 0.2, 0.0, 1.0);

          // Deep cosmic vertical gradient
          vec3 sky = mix(uHorizonColor, uZenithColor, pow(heightFactor, 0.6));

          // Distant city light dome / horizon glow (minimal subtle gradient)
          float horizonGlow = pow(1.0 - abs(dir.y), 6.0) * 0.16;
          sky += uGlowColor * horizonGlow;

          // Subtle distant stars in upper sky
          if (dir.y > 0.08) {
            vec2 starCoord = vec2(atan(dir.z, dir.x) * 35.0, dir.y * 70.0);
            vec2 starId = floor(starCoord);
            float h = hash(starId);
            if (h > 0.982) {
              float starTwinkle = sin(uTime * 2.0 + h * 40.0) * 0.5 + 0.5;
              sky += vec3(0.9, 0.95, 1.0) * starTwinkle * 0.85;
            }
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.skyDomeMaterial = mat;
    this.materials.push(mat);

    this.skyDomeMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.skyDomeMesh);
  }

  private initFloatingParticles(): void {
    const count = 650;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = -12.0 + Math.random() * 26.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 44;

      if (Math.random() < 0.65) {
        // Cyan cyber dust
        colors[i * 3 + 0] = 0.0;
        colors[i * 3 + 1] = 0.88;
        colors[i * 3 + 2] = 1.0;
      } else {
        // Magenta / violet ember
        colors[i * 3 + 0] = 0.9;
        colors[i * 3 + 1] = 0.15;
        colors[i * 3 + 2] = 0.85;
      }

      scales[i] = 0.6 + Math.random() * 1.4;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aScale;
        varying vec3 vColor;
        uniform float uTime;

        void main() {
          vColor = color;
          vec3 pos = position;

          // Gentle ambient drift
          pos.x += sin(uTime * 0.25 + position.z * 0.1) * 0.8;
          pos.y += cos(uTime * 0.3 + position.x * 0.1) * 0.6;
          pos.z += sin(uTime * 0.2 + position.y * 0.1) * 0.8;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (14.0 * aScale) * (18.0 / max(1.0, -mvPosition.z));
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, dist) * 0.35;
          gl_FragColor = vec4(vColor * 0.9, alpha);
        }
      `,
    });

    this.materials.push(mat);
    this.particlesMesh = new THREE.Points(geo, mat);
    this.group.add(this.particlesMesh);
  }

  public update(delta: number, time: number): void {
    if (this.groundFogMaterial) {
      this.groundFogMaterial.uniforms.uTime.value = time;
    }
    if (this.skyDomeMaterial) {
      this.skyDomeMaterial.uniforms.uTime.value = time;
    }
    if (this.particlesMesh && (this.particlesMesh.material as THREE.ShaderMaterial).uniforms) {
      (this.particlesMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    }
  }

  public dispose(): void {
    if (this.groundFogMesh) this.groundFogMesh.geometry.dispose();
    if (this.skyDomeMesh) this.skyDomeMesh.geometry.dispose();
    if (this.particlesMesh) this.particlesMesh.geometry.dispose();
    this.materials.forEach((mat) => mat.dispose());
  }
}

