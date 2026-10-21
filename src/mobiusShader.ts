import * as THREE from 'three';

export function createMobiusShaderMaterial(): THREE.ShaderMaterial {
  const uniforms = {
    uTime: { value: 0.0 },
    uProgress: { value: 0.0 },
    uActivationPulse: { value: -1.0 },
    uActivationPulse2: { value: -1.0 },
    uThemeTransition: { value: 0.0 },
    uGlitchIntensity: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uLightDirection: { value: new THREE.Vector3(0.6, 0.8, 0.5).normalize() },
  };

  const vertexShader = /* glsl */ `
    precision highp float;

    attribute float aEdgeFactor;
    attribute float aProgressCoord;
    attribute float aTwistIntensity;
    attribute float aFaceSide;

    uniform float uTime;
    uniform float uGlitchIntensity;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying vec2 vUv;
    varying vec4 vScreenPos;
    varying float vEdgeFactor;
    varying float vProgressCoord;
    varying float vTwistIntensity;
    varying float vFaceSide;

    void main() {
      vUv = uv;
      vEdgeFactor = aEdgeFactor;
      vProgressCoord = aProgressCoord;
      vTwistIntensity = aTwistIntensity;
      vFaceSide = aFaceSide;

      vec3 transformedNormal = normalMatrix * normal;
      vNormal = normalize(transformedNormal);

      vec3 pos = position;

      // Subtle glitch jitter along normal during theme shift
      if (uGlitchIntensity > 0.01) {
        float jitterNoise = sin(pos.y * 30.0 + uTime * 40.0) * sin(pos.x * 20.0);
        float glitchStep = step(0.7, abs(sin(pos.y * 14.0 + uTime * 25.0)));
        pos += normal * (jitterNoise * glitchStep * 0.05 * uGlitchIntensity);
      }

      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPos.xyz;
      vViewDirection = normalize(cameraPosition - worldPos.xyz);

      vec4 clipPos = projectionMatrix * viewMatrix * worldPos;

      // Screen-space chromatic slice displacement during glitch
      if (uGlitchIntensity > 0.01) {
        float scanShift = sin(clipPos.y * 35.0 + uTime * 30.0) * step(0.75, sin(clipPos.y * 12.0 + uTime * 18.0));
        clipPos.x += scanShift * 0.035 * uGlitchIntensity * clipPos.w;
      }

      vScreenPos = clipPos;
      gl_Position = clipPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform float uProgress;
    uniform float uActivationPulse;
    uniform float uActivationPulse2;
    uniform float uThemeTransition;
    uniform float uGlitchIntensity;
    uniform vec2 uResolution;
    uniform vec3 uLightDirection;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying vec2 vUv;
    varying vec4 vScreenPos;
    varying float vEdgeFactor;
    varying float vProgressCoord;
    varying float vTwistIntensity;
    varying float vFaceSide;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // Procedural cyber circuit traces
    float getCircuitPattern(vec2 uv) {
      vec2 grid = uv * vec2(90.0, 18.0);
      vec2 id = floor(grid);
      vec2 f = fract(grid);

      float h = hash(id);
      float trace = 0.0;
      if (h < 0.35) {
        trace = smoothstep(0.09, 0.02, abs(f.y - 0.5));
      } else if (h < 0.65) {
        trace = smoothstep(0.09, 0.02, abs(f.x - 0.5));
      } else {
        trace = smoothstep(0.09, 0.02, abs(f.x - f.y));
      }
      float node = smoothstep(0.2, 0.08, length(f - 0.5)) * step(0.72, h);
      return max(trace * 0.6, node);
    }

    void main() {
      // -------------------------------------------------------------
      // 1. ANIMATION A — PROGRESSIVE FORMATION
      // -------------------------------------------------------------
      if (vProgressCoord > uProgress) {
        discard;
      }

      float isBuilding = step(uProgress, 0.998);
      float headDist = max(0.0, uProgress - vProgressCoord);
      // Cyan wireframe tip
      float tipCyan = smoothstep(0.035, 0.0, headDist) * isBuilding;
      // Magenta wave trailing tip
      float tipMagenta = smoothstep(0.09, 0.035, headDist) * (1.0 - tipCyan) * isBuilding;

      // Surface vectors
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);
      vec3 L = normalize(uLightDirection);
      vec3 H = normalize(L + V);

      float NdotV = max(0.0, dot(N, V));
      float NdotL = max(0.0, dot(N, L));
      float NdotH = max(0.0, dot(N, H));

      // Fresnel reflection
      float fresnel = pow(1.0 - NdotV, 3.5);

      vec2 screenCoord = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
      vec2 screenPixels = screenCoord * uResolution;

      // -------------------------------------------------------------
      // 2. STATE A — CYBERPUNK MODE
      // -------------------------------------------------------------
      // Deep obsidian titanium base with rich dark contrast
      vec3 obsidianBase = vec3(0.018, 0.022, 0.028);

      // Subtle metallic diffuse lighting
      vec3 diffuse = obsidianBase * (0.3 + 0.7 * NdotL);

      // Iridescent metallic sheen (cyan, violet, magenta color shifts)
      float iridAngle = fresnel * 3.14159 + vTwistIntensity * 1.5 + uTime * 0.4;
      vec3 iridColor = mix(
        vec3(0.0, 0.75, 0.95), // cyan
        vec3(0.85, 0.08, 0.75), // magenta
        sin(iridAngle) * 0.5 + 0.5
      );
      vec3 cyberBody = diffuse + iridColor * (fresnel * 0.38);

      // Polished liquid chrome specular reflection
      float chromeSpec = pow(NdotH, 64.0);
      cyberBody += vec3(0.85, 0.92, 1.0) * chromeSpec * 0.75;

      // Micro-engraved circuit traces
      float circuit = getCircuitPattern(vUv);
      float circuitWave = sin(vProgressCoord * 24.0 - uTime * 3.0) * 0.5 + 0.5;
      vec3 circuitColor = mix(vec3(0.0, 0.65, 0.9), vec3(0.85, 0.1, 0.8), circuitWave);
      cyberBody += circuitColor * circuit * 0.28;

      // Electric cyan luminous edges along outer bevel
      float edgeMask = smoothstep(0.55, 0.98, vEdgeFactor);
      float edgePulse = 1.0 + 0.25 * sin(uTime * 4.0 + vProgressCoord * 12.0);
      vec3 cyanNeon = vec3(0.0, 0.95, 1.0) * (edgeMask * 1.35 * edgePulse);

      // Hot magenta highlights around twist and curvature
      float twistHighlight = pow(vTwistIntensity, 2.0) * fresnel;
      vec3 magentaGlow = vec3(1.0, 0.06, 0.7) * (twistHighlight * 0.9);

      // Thin neon center laser line
      float centerStripe = smoothstep(0.035, 0.0, abs(vEdgeFactor - 0.08));
      vec3 centerLineNeon = vec3(0.0, 0.8, 1.0) * centerStripe * 0.6;

      // Continuous traveling energy packet along the full Möbius loop
      float travelingPulse = smoothstep(0.96, 1.0, sin(vProgressCoord * 12.566 - uTime * 2.5));
      vec3 pulseColor = mix(vec3(0.0, 1.0, 0.9), vec3(1.0, 0.1, 0.8), sin(vProgressCoord * 6.28) * 0.5 + 0.5);
      vec3 pulseGlow = pulseColor * (travelingPulse * 0.7);

      // Activation Wave (Animation B)
      vec3 activationWave = vec3(0.0);
      if (uActivationPulse >= 0.0) {
        float wave1 = smoothstep(0.1, 0.0, abs(vProgressCoord - uActivationPulse));
        activationWave += vec3(0.0, 0.95, 1.0) * wave1 * 1.6;
      }
      if (uActivationPulse2 >= 0.0) {
        float wave2 = smoothstep(0.12, 0.0, abs(vProgressCoord - uActivationPulse2));
        activationWave += vec3(1.0, 0.08, 0.75) * wave2 * 1.3;
      }

      // Combine Cyberpunk
      vec3 cyberpunkColor = cyberBody
        + cyanNeon
        + magentaGlow
        + centerLineNeon
        + pulseGlow
        + activationWave;

      // Tip energy during formation
      if (isBuilding > 0.5) {
        cyberpunkColor += vec3(0.0, 1.0, 1.0) * tipCyan * 1.8;
        cyberpunkColor += vec3(1.0, 0.05, 0.8) * tipMagenta * 1.2;
      }

      // -------------------------------------------------------------
      // 3. STATE B — MONOCHROME MANGA MODE
      // -------------------------------------------------------------
      // Premium Japanese manga paper and deep sumi ink
      vec3 mangaPaper = vec3(0.95, 0.945, 0.94);
      vec3 mangaInk = vec3(0.035, 0.035, 0.04);

      // Inked contour outline (silhouette and bevel ink stroke)
      float inkSilhouette = smoothstep(0.2, 0.35, NdotV);
      float edgeOutline = 1.0 - smoothstep(0.65, 0.95, vEdgeFactor);

      // Manga cross-hatching in shadowed areas
      float hatchSpacing = 7.0;
      float hatch1 = step(0.48, fract((screenPixels.x + screenPixels.y) / hatchSpacing));
      float hatch2 = step(0.48, fract((screenPixels.x - screenPixels.y) / hatchSpacing));

      // Screentone dot grid (rotated 45 deg)
      vec2 rotGrid = mat2(0.7071, -0.7071, 0.7071, 0.7071) * screenPixels * 0.18;
      float dotDist = length(fract(rotGrid) - 0.5);
      float screentoneDot = step(dotDist, (1.0 - NdotL) * 0.42);

      // Ribbon longitudinal curvature speed lines
      float speedLine = step(0.5, fract(vUv.x * 320.0)) * step(0.45, 1.0 - NdotL);

      // Hand-inked crisp white specular glint
      float whiteSpecular = step(0.88, NdotH);

      // Build layered manga shading
      float shadow = 1.0 - NdotL;
      vec3 mangaShading = mangaPaper;

      // Halftone screentone in light shadow
      if (shadow > 0.22) {
        mangaShading = mix(mangaShading, mangaInk, screentoneDot * 0.7);
      }
      // 45-deg ink crosshatch in medium shadow
      if (shadow > 0.42) {
        mangaShading = mix(mangaShading, mangaInk, (1.0 - hatch1) * 0.85);
      }
      // Crossed 135-deg ink hatch in deep shadow
      if (shadow > 0.68) {
        mangaShading = mix(mangaShading, mangaInk, (1.0 - hatch2));
        mangaShading = mix(mangaShading, mangaInk, (1.0 - speedLine) * 0.65);
      }
      // Deep ink threshold
      if (shadow > 0.88) {
        mangaShading = mangaInk;
      }

      // Ink outlines
      mangaShading = mix(mangaInk, mangaShading, inkSilhouette);
      mangaShading = mix(mangaInk, mangaShading, edgeOutline);

      // Crisp white highlight
      mangaShading = mix(mangaShading, vec3(1.0), whiteSpecular);

      // Paper pulp grain
      float paperGrain = (hash(screenPixels) - 0.5) * 0.035;
      mangaShading += paperGrain;

      // -------------------------------------------------------------
      // 4. THEME BLEND & HYBRID GLITCH
      // -------------------------------------------------------------
      vec3 finalColor = mix(cyberpunkColor, mangaShading, uThemeTransition);

      if (uGlitchIntensity > 0.01) {
        float glitchY = gl_FragCoord.y;
        float noiseY = hash(vec2(floor(glitchY / 12.0), floor(uTime * 30.0)));
        float isGlitchSlice = step(0.7, noiseY);

        // Scanline sweep
        float scanline = sin(glitchY * 0.5 + uTime * 40.0) * 0.5 + 0.5;

        // Block digital distortion
        vec2 blockCoord = floor(screenPixels / vec2(28.0, 7.0));
        float blockNoise = hash(blockCoord + floor(uTime * 24.0));

        vec3 glitchColor = finalColor;
        if (isGlitchSlice > 0.5) {
          glitchColor.r = finalColor.r * 1.4 + scanline * 0.2;
          glitchColor.b = finalColor.b * 1.5;
          glitchColor.g *= 0.6;
        }
        if (blockNoise > 0.85) {
          glitchColor = (blockNoise > 0.92) ? vec3(0.98) : vec3(0.04);
        }

        finalColor = mix(finalColor, glitchColor, uGlitchIntensity * 0.8);
      }

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}
