import * as THREE from 'three';

export interface CityConfig {
  buildingCount?: number;
  cityRadius?: number;
  innerExclusionRadius?: number;
  baseY?: number;
}

export class CityGenerator {
  public group: THREE.Group;
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private billboardMesh: THREE.InstancedMesh | null = null;
  private beaconPoints: THREE.Points | null = null;
  private trafficMesh: THREE.InstancedMesh | null = null;
  private trafficData: { pos: THREE.Vector3; speed: number; laneY: number; laneZ: number; dir: number }[] = [];
  private trafficCount = 120;

  private materials: THREE.Material[] = [];
  private buildingShaderMat: THREE.ShaderMaterial | null = null;
  private billboardShaderMat: THREE.ShaderMaterial | null = null;

  constructor(config: CityConfig = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CyberpunkCity';

    this.initCity(config);
    this.initHoloBillboards();
    this.initRooftopBeacons();
    this.initAerialTraffic();
  }

  private createBuildingShader(): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(0x02050e) },
        uFogNear: { value: 12.0 },
        uFogFar: { value: 95.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vInstanceId;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vInstanceId = float(gl_InstanceID);

          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vInstanceId;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 N = normalize(vNormal);
          float isSide = step(0.15, abs(N.x) + abs(N.z));

          // Base dark obsidian composite facade
          vec3 facadeColor = vec3(0.015, 0.02, 0.03);

          // Procedural high-density illuminated window grid on skyscraper sides
          vec3 windowColor = vec3(0.0);
          if (isSide > 0.5) {
            vec2 winUv = vec2(
              (abs(N.x) > 0.5 ? vWorldPosition.z : vWorldPosition.x) * 4.0,
              vWorldPosition.y * 3.5
            );

            vec2 cell = floor(winUv);
            vec2 frac = fract(winUv);

            // Window frame margins
            float winMask = step(0.18, frac.x) * step(frac.x, 0.82) *
                           step(0.15, frac.y) * step(frac.y, 0.85);

            float r = hash21(cell + vec2(vInstanceId * 0.17, 3.41));
            float isLit = step(0.55, r); // ~45% lit windows

            // Variety of cyberpunk window hues: Cyan, Amber, Soft White, Magenta
            vec3 litHue = vec3(0.9, 0.95, 1.0); // cool white
            if (r > 0.88) {
              litHue = vec3(0.0, 0.95, 1.0); // vibrant cyan
            } else if (r > 0.74) {
              litHue = vec3(1.0, 0.65, 0.15); // amber / tungsten
            } else if (r > 0.62) {
              litHue = vec3(0.85, 0.2, 0.9); // neon violet
            }

            // Subtle slow twinkle on select windows
            float twinkle = 0.9 + 0.1 * sin(uTime * 1.5 + r * 60.0);

            windowColor = litHue * isLit * winMask * twinkle * 0.75;
          }

          // Vertical neon corner accent stripes on some buildings (subtle minimal accents)
          float isSpecialBuilding = step(0.72, fract(vInstanceId * 0.38));
          float cornerGlow = smoothstep(0.08, 0.0, abs(fract(vWorldPosition.x * 0.25) - 0.5)) *
                             smoothstep(0.08, 0.0, abs(fract(vWorldPosition.z * 0.25) - 0.5)) *
                             isSpecialBuilding * 0.5;
          vec3 stripeColor = mix(vec3(0.0, 0.75, 0.9), vec3(0.85, 0.1, 0.6), fract(vInstanceId * 0.73));

          // Combine lighting
          vec3 finalColor = facadeColor + windowColor + stripeColor * cornerGlow;

          // Atmospheric depth fog calculation
          float dist = length(vWorldPosition - cameraPosition);
          float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
          fogFactor = pow(fogFactor, 1.35);

          // Vertical ground haze blending (abyssal fog at bottom)
          float groundHaze = smoothstep(-6.0, -22.0, vWorldPosition.y) * 0.65;
          finalColor = mix(finalColor, uFogColor, clamp(fogFactor + groundHaze, 0.0, 0.95));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });

    this.buildingShaderMat = mat;
    this.materials.push(mat);
    return mat;
  }

  private initCity(config: CityConfig): void {
    const totalCount = config.buildingCount ?? 260;
    const cityRadius = config.cityRadius ?? 65;
    const innerExclusion = config.innerExclusionRadius ?? 4.8; // Keeps direct track clearance
    const baseY = config.baseY ?? -24;

    const buildingMat = this.createBuildingShader();

    // 4 Distinct Architectural Geometries
    const geometries = [
      // 0: Monolithic high-rise slab
      new THREE.BoxGeometry(2.4, 1.0, 2.4),
      // 1: Chamfered octagonal spire tower
      new THREE.CylinderGeometry(1.4, 2.0, 1.0, 8),
      // 2: Stepped corporate twin-tower block
      new THREE.BoxGeometry(3.6, 1.0, 1.8),
      // 3: Monumental megastructure pillar
      new THREE.BoxGeometry(4.8, 1.0, 4.8),
    ];

    const countsPerGeo = [
      Math.floor(totalCount * 0.42),
      Math.floor(totalCount * 0.28),
      Math.floor(totalCount * 0.20),
      Math.floor(totalCount * 0.10),
    ];

    // Create instanced mesh for each archetype
    const dummy = new THREE.Object3D();

    geometries.forEach((geo, geoIdx) => {
      const count = countsPerGeo[geoIdx];
      const instancedMesh = new THREE.InstancedMesh(geo, buildingMat, count);
      instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      let placed = 0;
      let attempts = 0;

      while (placed < count && attempts < count * 15) {
        attempts++;

        // Polar distribution: dense mid-range, sparse foreground, grand background
        const angle = Math.random() * Math.PI * 2;
        const distNorm = Math.pow(Math.random(), 0.75); // cluster around inner/mid
        const dist = innerExclusion + distNorm * (cityRadius - innerExclusion);

        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        // Keep direct central corridor for the Möbius track unobstructed
        // Möbius track spans roughly X: [-4, 4], Z: [-2, 2], Y: [-1.2, 1.2]
        if (Math.abs(x) < 4.6 && Math.abs(z) < 2.8) {
          continue;
        }

        // Variable tower heights:
        // Distant background towers can be towering giants (up to 38m tall, reaching Y ~ +14),
        // foreground/midground towers sit below or flank the circuit.
        let height = 12 + Math.random() * 22;
        if (dist > 25) {
          height += Math.random() * 26; // Mega towers in distance
        } else if (dist < 10) {
          height = 10 + Math.random() * 12; // Lower towers close to track so track remains visible
        }

        const widthScale = 0.8 + Math.random() * 0.8;
        const depthScale = 0.8 + Math.random() * 0.8;

        const posX = x;
        const posZ = z;
        const posY = baseY + height * 0.5;

        dummy.position.set(posX, posY, posZ);
        dummy.scale.set(widthScale, height, depthScale);
        dummy.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2) + (Math.random() - 0.5) * 0.15;
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }

      instancedMesh.count = placed;
      instancedMesh.instanceMatrix.needsUpdate = true;
      this.group.add(instancedMesh);
      this.instancedMeshes.push(instancedMesh);
    });
  }

  private initHoloBillboards(): void {
    const billboardCount = 38;
    const geo = new THREE.PlaneGeometry(3.5, 1.8);

    const billboardMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          // Cyber scanlines
          float scanline = sin(vUv.y * 120.0 + uTime * 6.0) * 0.5 + 0.5;
          scanline = smoothstep(0.2, 0.8, scanline);

          // Border glow
          float bx = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float by = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float border = 1.0 - (bx * by);

          // Dynamic graphic bars / graphic equalizer
          float bars = sin(vUv.x * 24.0 + uTime * 3.0) * sin(vUv.y * 18.0 - uTime * 2.0);
          bars = step(0.1, bars);

          // Cyberpunk Cyan / Magenta holographic color palette (restrained minimal opacity)
          vec3 cyan = vec3(0.0, 0.75, 0.9);
          vec3 magenta = vec3(0.85, 0.1, 0.65);
          vec3 color = mix(cyan, magenta, sin(uTime * 0.8 + vUv.x * 3.14) * 0.5 + 0.5);

          float alpha = (0.2 + 0.25 * scanline + 0.2 * bars + border * 0.45) * 0.45;
          gl_FragColor = vec4(color * 0.85, alpha);
        }
      `,
    });

    this.billboardShaderMat = billboardMat;
    this.materials.push(billboardMat);

    const instancedBillboards = new THREE.InstancedMesh(geo, billboardMat, billboardCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < billboardCount; i++) {
      const angle = (i / billboardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 9.0 + Math.random() * 26.0;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -10.0 + Math.random() * 12.0;

      dummy.position.set(x, y, z);
      // Face inward toward the racetrack center with slight tilt
      dummy.lookAt(0, y, 0);
      dummy.scale.set(1.2 + Math.random() * 0.8, 1.0 + Math.random() * 0.6, 1.0);
      dummy.updateMatrix();

      instancedBillboards.setMatrixAt(i, dummy.matrix);
    }

    instancedBillboards.instanceMatrix.needsUpdate = true;
    this.group.add(instancedBillboards);
    this.billboardMesh = instancedBillboards;
  }

  private initRooftopBeacons(): void {
    const beaconCount = 75;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(beaconCount * 3);
    const colors = new Float32Array(beaconCount * 3);

    for (let i = 0; i < beaconCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8.0 + Math.random() * 50.0;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = -6.0 + Math.random() * 22.0; // Rooftop height

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // 70% aviation strobe red, 30% cyber cyan
      if (Math.random() < 0.7) {
        colors[i * 3 + 0] = 1.0;
        colors[i * 3 + 1] = 0.08;
        colors[i * 3 + 2] = 0.15;
      } else {
        colors[i * 3 + 0] = 0.0;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 1.0;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const beaconMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        varying float vStrobe;
        uniform float uTime;

        void main() {
          vColor = color;
          // Synchronized aviation flash pulse (minimal pinpoint strobe)
          float t = mod(uTime * 1.8 + position.x * 0.05, 1.0);
          float strobe = smoothstep(0.0, 0.06, t) * smoothstep(0.12, 0.06, t) +
                         smoothstep(0.16, 0.22, t) * smoothstep(0.28, 0.22, t);
          vStrobe = clamp(strobe * 1.0, 0.05, 1.1);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (6.0 * vStrobe) * (14.0 / max(1.0, -mvPosition.z));
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vStrobe;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, dist) * vStrobe * 0.8;
          gl_FragColor = vec4(vColor * 0.9, alpha);
        }
      `,
    });

    this.materials.push(beaconMat);
    this.beaconPoints = new THREE.Points(geo, beaconMat);
    this.group.add(this.beaconPoints);
  }

  private initAerialTraffic(): void {
    const count = this.trafficCount;
    // Aerodynamic elongated speeder shape
    const geo = new THREE.BoxGeometry(0.35, 0.08, 0.85);

    const trafficMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vLocalPos;
        void main() {
          vNormal = normalMatrix * normal;
          vLocalPos = position;
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vLocalPos;

        void main() {
          // Minimal sleek speeder marker lights
          float isFront = step(0.0, vLocalPos.z);
          vec3 headlight = vec3(0.5, 0.8, 1.0) * 0.75;
          vec3 taillight = vec3(0.8, 0.08, 0.2) * 0.75;

          vec3 color = mix(taillight, headlight, isFront);
          gl_FragColor = vec4(color, 0.65);
        }
      `,
    });

    this.materials.push(trafficMat);
    this.trafficMesh = new THREE.InstancedMesh(geo, trafficMat, count);
    this.trafficMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize traffic lanes in concentric rings and cross-canyon highways
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const laneRadius = 12.0 + (i % 6) * 5.0;
      const speed = (2.5 + Math.random() * 3.5) * dir;
      const laneY = -14.0 + (i % 5) * 2.2;
      const initialAngle = (i / count) * Math.PI * 2;

      const pos = new THREE.Vector3(
        Math.cos(initialAngle) * laneRadius,
        laneY,
        Math.sin(initialAngle) * laneRadius
      );

      this.trafficData.push({
        pos,
        speed,
        laneY,
        laneZ: laneRadius,
        dir,
      });
    }

    this.group.add(this.trafficMesh);
  }

  public update(delta: number, time: number): void {
    if (this.buildingShaderMat) {
      this.buildingShaderMat.uniforms.uTime.value = time;
    }
    if (this.billboardShaderMat) {
      this.billboardShaderMat.uniforms.uTime.value = time;
    }
    if (this.beaconPoints && (this.beaconPoints.material as THREE.ShaderMaterial).uniforms) {
      (this.beaconPoints.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    }

    // Update aerial traffic positions along cylindrical skyways
    if (this.trafficMesh) {
      const dummy = new THREE.Object3D();

      for (let i = 0; i < this.trafficCount; i++) {
        const item = this.trafficData[i];
        const radius = item.laneZ;
        let currentAngle = Math.atan2(item.pos.z, item.pos.x);

        currentAngle += (item.speed / radius) * delta;
        item.pos.x = Math.cos(currentAngle) * radius;
        item.pos.z = Math.sin(currentAngle) * radius;
        item.pos.y = item.laneY + Math.sin(time * 0.8 + i) * 0.15; // micro flight bobbing

        dummy.position.copy(item.pos);
        // Point vehicle forward along tangent of orbit
        const forwardAngle = currentAngle + (item.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        dummy.rotation.y = -forwardAngle + Math.PI / 2;
        dummy.scale.set(1.0, 1.0, 1.2 + Math.abs(item.speed) * 0.15); // Velocity elongation
        dummy.updateMatrix();

        this.trafficMesh.setMatrixAt(i, dummy.matrix);
      }

      this.trafficMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.instancedMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
    });
    if (this.billboardMesh) this.billboardMesh.geometry.dispose();
    if (this.trafficMesh) this.trafficMesh.geometry.dispose();
    if (this.beaconPoints) this.beaconPoints.geometry.dispose();
    this.materials.forEach((mat) => mat.dispose());
  }
}

