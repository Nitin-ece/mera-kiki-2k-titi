import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { SceneController } from './sceneController';

gsap.registerPlugin(ScrollTrigger);

// -------------------------------------------------------------
// 1. Initialize Lenis Smooth Scrolling
// -------------------------------------------------------------
const lenis = new Lenis({
  duration: 1.25,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  gestureOrientation: 'vertical',
  smoothWheel: true,
  touchMultiplier: 1.8,
});

// Coordinate Lenis with GSAP ScrollTrigger
lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

// -------------------------------------------------------------
// 2. Setup Three.js WebGL Scene & Post-Processing
// -------------------------------------------------------------
const container = document.getElementById('canvas-container') || document.body;

const scene = new THREE.Scene();

// Camera setup: centered perspective matching cinematic compositions
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 1.8, 8.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.id = 'webgl-canvas';
container.appendChild(renderer.domElement);

// Post-Processing: UnrealBloomPass for crisp neon racetrack & taillight highlights
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.46, // bloom strength
  0.22, // radius
  0.86  // threshold
);

const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);

// -------------------------------------------------------------
// 3. Initialize Unified SceneController (Track, Car, Drift, Camera)
// -------------------------------------------------------------
const sceneController = new SceneController({
  scene,
  camera,
  renderer,
});

// -------------------------------------------------------------
// 4. GSAP ScrollTrigger: Scroll-Driven 3D Choreography
// -------------------------------------------------------------
const stages = document.querySelectorAll<HTMLElement>('.stage');
const navLinks = document.querySelectorAll<HTMLElement>('.nav-link');
const stageDots = document.querySelectorAll<HTMLElement>('.stage-dot');

// Create Master ScrollTrigger pinned to the entire narrative scroll wrapper
ScrollTrigger.create({
  trigger: '#scroll-wrapper',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 0.8,
  onUpdate: (self) => {
    const progress = self.progress; // 0.0 to 1.0
    const velocity = self.getVelocity() / 1000;

    // Direct 3D scene camera & car choreography
    sceneController.updateScroll(progress, velocity);

    // Update active stage class in DOM
    let activeIndex = 0;
    if (progress > 0.72) activeIndex = 3;
    else if (progress > 0.46) activeIndex = 2;
    else if (progress > 0.22) activeIndex = 1;

    stages.forEach((stg, i) => {
      if (i === activeIndex) {
        stg.classList.add('active');
      } else {
        stg.classList.remove('active');
      }
    });

    navLinks.forEach((link, i) => {
      if (i === activeIndex) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    stageDots.forEach((dot, i) => {
      if (i === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  },
});

// -------------------------------------------------------------
// 5. Interactive Navigation Smooth Scrolling
// -------------------------------------------------------------
document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((elem) => {
  elem.addEventListener('click', (e) => {
    e.preventDefault();
    const targetSelector = elem.getAttribute('data-scroll');
    if (targetSelector) {
      const targetElem = document.querySelector(targetSelector);
      if (targetElem) {
        lenis.scrollTo(targetElem as HTMLElement, {
          duration: 1.4,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });
      }
    }
  });
});

stageDots.forEach((dot) => {
  dot.addEventListener('click', () => {
    const stageNum = dot.getAttribute('data-stage');
    const targetElem = document.querySelector(`#stage-${stageNum}`);
    if (targetElem) {
      lenis.scrollTo(targetElem as HTMLElement, { duration: 1.4 });
    }
  });
});

// -------------------------------------------------------------
// 6. Cybernetic Ambient Audio Synthesizer (Web Audio API)
// -------------------------------------------------------------
let audioCtx: AudioContext | null = null;
let osc1: OscillatorNode | null = null;
let osc2: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let isAudioActive = false;

const audioToggleBtn = document.getElementById('audio-toggle');
const audioIcon = document.getElementById('audio-icon');
const audioText = document.getElementById('audio-text');

function initAudio(): void {
  if (audioCtx) return;

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  audioCtx = new AudioContextClass();

  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
  gainNode.connect(audioCtx.destination);

  // Sub-bass motor resonance (electric drive hum)
  osc1 = audioCtx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(55, audioCtx.currentTime); // A1 note
  
  // High-frequency harmonic cyber whine
  osc2 = audioCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(220, audioCtx.currentTime);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(320, audioCtx.currentTime);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);

  osc1.start();
  osc2.start();
}

function toggleAudio(): void {
  if (!audioCtx) {
    initAudio();
  }

  if (audioCtx?.state === 'suspended') {
    audioCtx.resume();
  }

  isAudioActive = !isAudioActive;

  if (isAudioActive && gainNode && audioCtx) {
    gainNode.gain.setTargetAtTime(0.12, audioCtx.currentTime, 0.2);
    if (audioIcon) audioIcon.textContent = '🔊';
    if (audioText) audioText.textContent = 'AUDIO ON';
    audioToggleBtn?.style.setProperty('box-shadow', '0 0 16px rgba(0, 245, 255, 0.6)');
  } else if (gainNode && audioCtx) {
    gainNode.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.2);
    if (audioIcon) audioIcon.textContent = '🔇';
    if (audioText) audioText.textContent = 'AUDIO OFF';
    audioToggleBtn?.style.removeProperty('box-shadow');
  }
}

audioToggleBtn?.addEventListener('click', toggleAudio);

// -------------------------------------------------------------
// 7. Interactive Registration / Access Form
// -------------------------------------------------------------
const accessForm = document.getElementById('access-form') as HTMLFormElement | null;
const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
const formFeedback = document.getElementById('form-feedback');

accessForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = emailInput?.value.trim() || '';

  if (!email || !email.includes('@')) {
    if (formFeedback) {
      formFeedback.textContent = '⚠ ERROR: INVALID CYBERNETIC ADDRESS FORMAT';
      formFeedback.style.color = '#ff36d1';
    }
    return;
  }

  if (formFeedback) {
    formFeedback.textContent = `✓ PROTOCOL CONFIRMED // ACCESS GRANTED FOR ${email.toUpperCase()}`;
    formFeedback.style.color = '#00f5ff';
  }

  if (emailInput) {
    emailInput.disabled = true;
  }

  // Play micro confirmation click if audio active
  if (isAudioActive && audioCtx) {
    const beep = audioCtx.createOscillator();
    const beepGain = audioCtx.createGain();
    beep.frequency.setValueAtTime(880, audioCtx.currentTime);
    beepGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    beepGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    beep.connect(beepGain);
    beepGain.connect(audioCtx.destination);
    beep.start();
    beep.stop(audioCtx.currentTime + 0.35);
  }
});

// -------------------------------------------------------------
// 8. Live Telemetry HUD Binding Elements
// -------------------------------------------------------------
const hudSpeed = document.getElementById('hud-speed');
const hudGForce = document.getElementById('hud-gforce');
const hudSlip = document.getElementById('hud-slip');
const hudTrackProgress = document.getElementById('hud-track-progress');
const hudDriftTag = document.getElementById('hud-drift-tag');
const hudSpeedCard = document.getElementById('hud-speed-card');

// -------------------------------------------------------------
// 9. Main Animation Render Loop
// -------------------------------------------------------------
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  // Update 3D scene controller (car physics, drift, camera damping, track shaders)
  sceneController.update(delta, time);

  // Update HUD telemetry values
  const telemetry = sceneController.getTelemetry();

  if (hudSpeed) hudSpeed.textContent = telemetry.speedKmh.toString();
  if (hudGForce) hudGForce.textContent = telemetry.lateralG;
  if (hudSlip) hudSlip.textContent = telemetry.driftDeg;
  if (hudTrackProgress) hudTrackProgress.textContent = telemetry.trackPct.toString();

  if (telemetry.isDrifting) {
    hudDriftTag?.classList.add('active');
    if (hudDriftTag) hudDriftTag.textContent = 'DRIFTING';
    hudSpeedCard?.classList.add('drifting');
  } else {
    hudDriftTag?.classList.remove('active');
    if (hudDriftTag) hudDriftTag.textContent = 'CRUISING';
    hudSpeedCard?.classList.remove('drifting');
  }

  // Modulate cyber engine audio frequency dynamically
  if (isAudioActive && osc1 && osc2 && audioCtx) {
    const targetFreq = 48 + telemetry.speedKmh * 0.35 + telemetry.driftIntensity * 60;
    osc1.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
    osc2.frequency.setTargetAtTime(targetFreq * 3.8, audioCtx.currentTime, 0.08);
  }

  // Render post-processed scene
  composer.render();
}

animate();

// -------------------------------------------------------------
// 10. Responsive Window Resize Handler
// -------------------------------------------------------------
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  composer.setSize(width, height);
  bloomPass.setSize(width, height);

  ScrollTrigger.refresh();
});
