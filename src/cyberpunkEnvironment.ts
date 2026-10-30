import * as THREE from 'three';
import { CityGenerator } from './cityGenerator';
import { AtmosphericEffects } from './atmosphericEffects';

export class CyberpunkEnvironment {
  public group: THREE.Group;
  public city: CityGenerator;
  public atmosphere: AtmosphericEffects;
  private trackSupportPylons: THREE.Group;
  private environmentMap: THREE.Texture | null = null;

  // Scene lighting
  public hemiLight: THREE.HemisphereLight;
  public cityUnderglow: THREE.PointLight;
  public keyDirectional: THREE.DirectionalLight;
  public rimCyanLight: THREE.DirectionalLight;
  public rimMagentaLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.group = new THREE.Group();
    this.group.name = 'CyberpunkEnvironment';

    // 1. Procedural Megacity
    this.city = new CityGenerator({
      buildingCount: 280,
      cityRadius: 75,
      innerExclusionRadius: 4.8,
      baseY: -26,
    });
    this.group.add(this.city.group);

    // 2. Atmospheric & Sky Systems
    this.atmosphere = new AtmosphericEffects(scene);
    this.group.add(this.atmosphere.group);

    // 3. Civil Architecture: Magnetic Levitation Anchors & Track Pylons
    this.trackSupportPylons = this.buildTrackInfrastructure();
    this.group.add(this.trackSupportPylons);

    // 4. Minimal, Restrained Cyberpunk Lighting Rig
    // Sky-to-city hemisphere light: deep navy zenith to rich cyan nadir
    this.hemiLight = new THREE.HemisphereLight(0x0a1426, 0x002638, 0.7);
    this.group.add(this.hemiLight);

    // Subtle upward city ambient from the abyss
    this.cityUnderglow = new THREE.PointLight(0x00a3cc, 0.75, 40, 1.4);
    this.cityUnderglow.position.set(0, -12, 0);
    this.group.add(this.cityUnderglow);

    // Balanced directional key light
    this.keyDirectional = new THREE.DirectionalLight(0xddeeff, 1.1);
    this.keyDirectional.position.set(12, 16, 10);
    this.group.add(this.keyDirectional);

    // Restrained Cyan Rim Light
    this.rimCyanLight = new THREE.DirectionalLight(0x00c8e6, 1.1);
    this.rimCyanLight.position.set(-14, 4, -8);
    this.group.add(this.rimCyanLight);

    // Restrained Magenta Accent Light
    this.rimMagentaLight = new THREE.DirectionalLight(0xcc0066, 0.8);
    this.rimMagentaLight.position.set(8, -6, 6);
    this.group.add(this.rimMagentaLight);

    // 5. Generate high-contrast Cyberpunk PMREM Environment Reflections for Car & Track
    this.generateCyberpunkEnvMap(renderer, scene);
  }

  private buildTrackInfrastructure(): THREE.Group {
    const infrastructure = new THREE.Group();
    infrastructure.name = 'TrackInfrastructure';

    // Heavy architectural foundation columns rising from the city below to support the circuit
    // Positioned strategically outside the car trajectory but framing the structure
    const pylonGeo = new THREE.CylinderGeometry(0.24, 0.48, 22.0, 8);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x070c14,
      metalness: 0.9,
      roughness: 0.25,
    });

    const ringGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      wireframe: true,
    });

    const pylonPositions = [
      new THREE.Vector3(-3.2, -11.0, 0.0),
      new THREE.Vector3(3.2, -11.0, 0.0),
      new THREE.Vector3(0.0, -11.0, -1.2),
      new THREE.Vector3(0.0, -11.0, 1.2),
    ];

    pylonPositions.forEach((pos) => {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.copy(pos);
      infrastructure.add(pylon);

      // Glowing anti-gravity emitter rings near the top
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(pos.x, -1.2 - r * 0.45, pos.z);
        infrastructure.add(ring);
      }
    });

    return infrastructure;
  }

  private generateCyberpunkEnvMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();

      // Create a virtual environment scene with glowing neon strips
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x020409);

      // Cyan strip
      const cyanGeo = new THREE.BoxGeometry(20, 2, 0.5);
      const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
      const cyanMesh = new THREE.Mesh(cyanGeo, cyanMat);
      cyanMesh.position.set(0, 10, -12);
      envScene.add(cyanMesh);

      // Magenta strip
      const magGeo = new THREE.BoxGeometry(16, 2, 0.5);
      const magMat = new THREE.MeshBasicMaterial({ color: 0xff0088 });
      const magMesh = new THREE.Mesh(magGeo, magMat);
      magMesh.position.set(10, 5, 10);
      envScene.add(magMesh);

      // Blue overhead ambient
      const blueGeo = new THREE.BoxGeometry(25, 1, 25);
      const blueMat = new THREE.MeshBasicMaterial({ color: 0x0a1c3d });
      const blueMesh = new THREE.Mesh(blueGeo, blueMat);
      blueMesh.position.set(0, 20, 0);
      envScene.add(blueMesh);

      const renderTarget = pmrem.fromScene(envScene, 0.04);
      this.environmentMap = renderTarget.texture;
      scene.environment = this.environmentMap;

      // Dispose temp resources
      cyanGeo.dispose();
      cyanMat.dispose();
      magGeo.dispose();
      magMat.dispose();
      blueGeo.dispose();
      blueMat.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn('Could not generate PMREM env map, using default lighting:', e);
    }
  }

  public update(delta: number, time: number): void {
    this.city.update(delta, time);
    this.atmosphere.update(delta, time);

    // Subtle breathing pulse in city underglow
    const glowPulse = 0.75 + Math.sin(time * 1.2) * 0.1;
    this.cityUnderglow.intensity = glowPulse;
  }

  public dispose(): void {
    this.city.dispose();
    this.atmosphere.dispose();
    if (this.environmentMap) this.environmentMap.dispose();
  }
}

