import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

const canvas = document.getElementById('canvas');
const progressFill = document.getElementById('progress-fill');
const introEl = document.getElementById('intro');
const flashEl = document.getElementById('flash');

const STAGES = [
  { name: '빅뱅', scale: '10⁻³⁵ m', at: 0 },
  { name: '별', scale: '~10⁹ m', at: 0.14 },
  { name: '태양계', scale: '~10¹³ m', at: 0.28 },
  { name: '은하', scale: '~10²¹ m', at: 0.45 },
  { name: '은하단', scale: '~10²³ m', at: 0.62 },
  { name: '초은하단', scale: '~10²⁵ m', at: 0.78 },
  { name: '관측 가능한 우주', scale: '~10²⁷ m', at: 0.92 },
];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.0001, 100000);
camera.position.set(0, 0, 80);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2, 0.8, 0.1);
composer.addPass(bloom);

const pivot = new THREE.Group();
pivot.scale.setScalar(0.0001);
scene.add(pivot);

// Drag rotation
let dragging = false, px = 0, py = 0, rx = 0, ry = 0;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; ry += (e.clientX - px) * 0.004; rx += (e.clientY - py) * 0.004; rx = Math.max(-1.2, Math.min(1.2, rx)); px = e.clientX; py = e.clientY; });
canvas.addEventListener('pointerup', e => { dragging = false; canvas.releasePointerCapture(e.pointerId); });

// Wheel scroll — scroll down = progress increases = zoom OUT (universe expands)
let progress = 0, target = 0, ready = false;
window.addEventListener('wheel', e => { if (!ready) return; target += e.deltaY * 0.00015; target = Math.max(0, Math.min(1, target)); }, { passive: true });

// Shader
const VERT = `
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * 400.0 / max(-mv.z, 0.01), 0.3, 80.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = exp(-d * 6.0) + exp(-d * 14.0) * 0.8;
  gl_FragColor = vec4(vColor * a, a);
}`;

// Particle builder
function addParticles(count, rMin, rMax, sMin, sMax, colorFn, shape) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (shape === 'spiral') {
      const arm = Math.floor(Math.random() * 4);
      const t = Math.random();
      const r = rMin + t * (rMax - rMin);
      const angle = (arm / 4) * Math.PI * 2 + t * 3.5;
      const sc = (1 - t * 0.6) * (rMax - rMin) * 0.06;
      x = Math.cos(angle) * r + (Math.random() - 0.5) * sc;
      y = (Math.random() - 0.5) * sc * 0.15;
      z = Math.sin(angle) * r + (Math.random() - 0.5) * sc;
    } else if (shape === 'filament') {
      const fi = Math.floor(Math.random() * 25);
      const dx = Math.sin(fi*1.3)*Math.cos(fi*0.7);
      const dy = Math.sin(fi*0.9)*Math.sin(fi*2.1);
      const dz = Math.cos(fi*1.7);
      const len = Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
      const t = (Math.random()-0.5)*2;
      const r = rMin + Math.random()*(rMax-rMin);
      const sc = (rMax-rMin)*0.025;
      x = (dx/len)*t*r+(Math.random()-0.5)*sc;
      y = (dy/len)*t*r+(Math.random()-0.5)*sc;
      z = (dz/len)*t*r+(Math.random()-0.5)*sc;
    } else {
      const r = rMin + Math.random()*(rMax-rMin);
      const th = Math.random()*Math.PI*2;
      const ph = Math.acos(2*Math.random()-1);
      x = r*Math.sin(ph)*Math.cos(th);
      y = r*Math.sin(ph)*Math.sin(th);
      z = r*Math.cos(ph);
    }
    pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
    const c = colorFn(i,count);
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    siz[i] = sMin + Math.random()*(sMax-sMin);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pivot.add(pts);
  return pts;
}

// --- Build layers (same as before — the "perfect" version) ---
// Stars (close)
addParticles(6000, 5, 30, 0.02, 0.1, () => {
  const t = Math.random();
  if (t > 0.7) return { r: 0.6, g: 0.7, b: 1.0 };
  if (t > 0.4) return { r: 1.0, g: 1.0, b: 0.9 };
  return { r: 1.0, g: 0.7, b: 0.4 };
}, 'sphere');

// Solar system scale
addParticles(2000, 25, 50, 0.04, 0.2, (i) => {
  if (i < 30) return { r: 1, g: 0.9, b: 0.5 };
  return { r: 0.8, g: 0.8, b: 1.0 };
}, 'sphere');

// Galaxy (spiral)
addParticles(15000, 30, 50, 0.08, 0.4, (i, n) => {
  const t = i / n;
  if (Math.random() > 0.6) return { r: 0.5 + t * 0.3, g: 0.6 + t * 0.2, b: 1.0 };
  return { r: 1.0, g: 0.85 - t * 0.2, b: 0.5 + t * 0.3 };
}, 'spiral');

// Neighboring galaxies
addParticles(10000, 50, 100, 0.2, 1.0, () => {
  const t = Math.random();
  if (t > 0.7) return { r: 0.6, g: 0.65, b: 1.0 };
  if (t > 0.4) return { r: 1.0, g: 0.9, b: 0.65 };
  return { r: 0.9, g: 0.7, b: 0.5 };
}, 'sphere');

// Galaxy clusters
addParticles(12000, 80, 180, 0.5, 3.0, () => {
  const t = Math.random();
  if (t > 0.6) return { r: 0.7, g: 0.75, b: 1.0 };
  if (t > 0.3) return { r: 1.0, g: 0.85, b: 0.6 };
  return { r: 0.9, g: 0.6, b: 0.4 };
}, 'sphere');

// Supercluster filaments
addParticles(10000, 150, 300, 1.0, 5.0, () => {
  const t = Math.random();
  return { r: 0.3 + t * 0.3, g: 0.2 + t * 0.2, b: 0.6 + t * 0.4 };
}, 'filament');

// Observable universe boundary
addParticles(5000, 280, 400, 3.0, 12.0, () => {
  const t = Math.random();
  return { r: 0.2 + t * 0.15, g: 0.1 + t * 0.1, b: 0.3 + t * 0.3 };
}, 'sphere');

// --- Zoom logic (REVERSED from before) ---
// progress 0 → scale SMALL (bigbang, everything collapsed)
// progress 1 → scale BIG (universe fully expanded, zoomed out)
// Scroll down = progress increases = universe expands outward
function getScale(p) {
  return Math.pow(10, p * 3 - 3);
}

// --- UI ---
function updateUI(p) {
  progressFill.style.height = `${p * 100}%`;
}

// --- Intro sequence: darkness → glitch text spiral → blackout → big bang ---
import GlitchedWriter from 'glitched-writer';

const glitchLayer = document.getElementById('glitch-layer');
const GLITCH_WORDS = [
  '무(無)', 'void', '∅', 'nothing', '0', 'null',
  '존재하지 않음', 'undefined', '공(空)', 'absence',
  '시간 없음', 'no time', '공간 없음', 'no space',
  '∞ → 0', 'singularity', '특이점', 'ε → 0',
  '밀도 = ∞', 'T = 10³²K', 'Δt = 10⁻⁴³s',
  'entropy', '혼돈', 'quantum', '진공',
  'fluctuation', '요동', 'planck', '플랑크',
  'dimension', '차원', 'zero', '영(零)',
  'infinite', '무한', 'collapse', '붕괴',
  'origin', '기원', 'before', '이전',
  'causality', '인과', 'boundary', '경계',
  'emergence', '창발', 'symmetry', '대칭',
  'broken', '깨짐', 'field', '장(場)',
  'potential', '퍼텐셜', 'vacuum', '진공에너지',
  'false vacuum', '거짓 진공', 'decay', '붕괴',
  'inflation', '급팽창', 'expansion', '팽창',
  'radiation', '복사', 'genesis', '태초',
];

function getSpawnDelay(index, total) {
  const t = index / total;
  const logCurve = 1 - Math.pow(t, 3);
  return logCurve * 120 + 10;
}

function spawnGlitchText(index, total) {
  const el = document.createElement('div');
  el.className = 'glitch-text';
  el.style.position = 'absolute';
  const t = index / total;
  const angle = t * Math.PI * 10;
  const radius = t * 44;
  const cx = 50 + Math.cos(angle) * radius;
  const cy = 50 + Math.sin(angle) * radius;
  el.style.left = cx + '%';
  el.style.top = cy + '%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.fontSize = (6 + t * 14) + 'px';
  el.style.opacity = '0';
  glitchLayer.appendChild(el);

  const word = GLITCH_WORDS[index % GLITCH_WORDS.length];
  const writer = new GlitchedWriter(el, {
    interval: [30, 80],
    delay: [20, 80],
    steps: [2, 6],
    maxGhosts: 4,
    ghostChance: 0.6,
    changeChance: 0.8,
    glyphs: '!@#$%^&*∞∅∑∏∂∆◊⌀≈≠±×÷',
  });
  el.style.opacity = '1';
  writer.write(word);
}

function startIntroSequence() {
  introEl.classList.add('fade-out');

  setTimeout(() => {
    glitchLayer.style.display = 'block';

    // Phase 1: dot blinks 3 times then becomes 무(無)
    const centerDot = document.createElement('div');
    centerDot.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:Courier New,monospace;color:#fff;font-size:24px;opacity:0;transition:opacity 0.15s;';
    centerDot.textContent = '.';
    glitchLayer.appendChild(centerDot);

    let blinks = 0;
    function blink() {
      if (blinks >= 3) {
        centerDot.style.fontSize = '32px';
        centerDot.style.opacity = '1';
        const muWriter = new GlitchedWriter(centerDot, {
          interval: [15, 30], steps: [2, 4], maxGhosts: 3,
          glyphs: '!@#$%^&*∞∅∑∏∂∆◊⌀≈≠±×÷',
        });
        muWriter.write('무(無)').then(() => {
          setTimeout(() => {
            centerDot.remove();
            startSpiralPhase();
          }, 300);
        });
        return;
      }
      centerDot.style.opacity = '1';
      setTimeout(() => {
        centerDot.style.opacity = '0';
        setTimeout(() => {
          blinks++;
          blink();
        }, 200);
      }, 250);
    }
    blink();

    // Phase 2: spiral words (original)
    function startSpiralPhase() {
      const totalWords = 25;
      let spawned = 0;
      function scheduleNext() {
        if (spawned >= totalWords) {
          setTimeout(() => {
            glitchLayer.querySelectorAll('.glitch-text').forEach(el => {
              el.classList.add('glitch-flicker');
            });
            setTimeout(() => {
              glitchLayer.innerHTML = '';
              glitchLayer.style.background = '#000';
              const finalEl = document.createElement('div');
              finalEl.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:32px;font-family:Courier New,monospace;color:#fff;';
              glitchLayer.appendChild(finalEl);
              const finalWriter = new GlitchedWriter(finalEl, {
                interval: [15, 30],
                delay: [10, 30],
                steps: [2, 4],
                maxGhosts: 3,
                ghostChance: 0.7,
                glyphs: '!@#$%^&*∞∅∑∏∂∆◊⌀≈≠±×÷',
              });
              finalWriter.write('빛이 있으라').then(() => {
                setTimeout(() => {
                  glitchLayer.style.display = 'none';
                  glitchLayer.innerHTML = '';
                  triggerBigBang();
                }, 300);
              });
            }, 500);
          }, 300);
          return;
        }
        spawnGlitchText(spawned, totalWords);
        spawned++;
        const delay = getSpawnDelay(spawned, totalWords);
        setTimeout(scheduleNext, delay);
      }
      scheduleNext();
    }
  }, 400);
}

function triggerBigBang() {
  canvas.classList.add('visible');
  gsap.to(flashEl, { opacity: 1, duration: 0.08, onComplete: () => {
    gsap.to(flashEl, { opacity: 0, duration: 2.5, ease: 'power2.out' });
  }});
  bloom.strength = 6;
  gsap.to(bloom, { strength: 2, duration: 3, ease: 'power2.out' });
  pivot.scale.setScalar(getScale(0));

  // Auto-play: smoothly advance progress from 0 to 1
  ready = true;
  const autoPlay = { val: 0 };
  gsap.to(autoPlay, {
    val: 1, duration: 12, ease: 'power1.inOut',
    onUpdate: () => {
      if (!ready) return;
      target = autoPlay.val;
    },
    onComplete: () => {
      // Auto-play done, user can now scroll freely
    }
  });
}

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  progress += (target - progress) * 0.05;
  if (ready) {
    const s = getScale(progress);
    pivot.scale.setScalar(s);
    updateUI(progress);

    // Subtle drift toward center when idle (very slow zoom in)
    if (!dragging) {
      camera.position.z += (78 - camera.position.z) * 0.0003;
      pivot.rotation.y += 0.0008;
    }
  }
  pivot.rotation.x += (rx - pivot.rotation.x) * 0.08;
  pivot.rotation.y += (ry - pivot.rotation.y) * 0.08;
  composer.render();
}

// --- Resize ---
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// --- Start ---
animate();

// Show "click to begin" with glitch effect
const introHint = document.getElementById('intro-hint');
const hintWriter = new GlitchedWriter(introHint, {
  interval: [30, 60], steps: [2, 4], maxGhosts: 3,
  glyphs: '!@#$%^&*∞∅∑∏∂∆◊⌀≈≠±',
});
hintWriter.write('click to begin');
introEl.addEventListener('click', startIntroSequence);
