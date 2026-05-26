import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const DitherShader = {
  uniforms: { tDiffuse:{value:null}, resolution:{value:new THREE.Vector2(innerWidth,innerHeight)}, pixelSize:{value:3.0} },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;uniform vec2 resolution;uniform float pixelSize;varying vec2 vUv;
    float bayer8(vec2 pos){ivec2 p=ivec2(mod(pos,8.0));int idx=p.x+p.y*8;
    float m[64];m[0]=0.0;m[1]=32.0;m[2]=8.0;m[3]=40.0;m[4]=2.0;m[5]=34.0;m[6]=10.0;m[7]=42.0;
    m[8]=48.0;m[9]=16.0;m[10]=56.0;m[11]=24.0;m[12]=50.0;m[13]=18.0;m[14]=58.0;m[15]=26.0;
    m[16]=12.0;m[17]=44.0;m[18]=4.0;m[19]=36.0;m[20]=14.0;m[21]=46.0;m[22]=6.0;m[23]=38.0;
    m[24]=60.0;m[25]=28.0;m[26]=52.0;m[27]=20.0;m[28]=62.0;m[29]=30.0;m[30]=54.0;m[31]=22.0;
    m[32]=3.0;m[33]=35.0;m[34]=11.0;m[35]=43.0;m[36]=1.0;m[37]=33.0;m[38]=9.0;m[39]=41.0;
    m[40]=51.0;m[41]=19.0;m[42]=59.0;m[43]=27.0;m[44]=49.0;m[45]=17.0;m[46]=57.0;m[47]=25.0;
    m[48]=15.0;m[49]=47.0;m[50]=7.0;m[51]=39.0;m[52]=13.0;m[53]=45.0;m[54]=5.0;m[55]=37.0;
    m[56]=63.0;m[57]=31.0;m[58]=55.0;m[59]=23.0;m[60]=61.0;m[61]=29.0;m[62]=53.0;m[63]=21.0;
    float t=0.0;for(int i=0;i<64;i++){if(i==idx){t=m[i];break;}}return t/64.0;}
    void main(){vec2 pc=floor(gl_FragCoord.xy/pixelSize)*pixelSize;vec2 uv=pc/resolution;
    vec4 c=texture2D(tDiffuse,uv);float l=dot(c.rgb,vec3(0.299,0.587,0.114));
    gl_FragColor=vec4(vec3(step(bayer8(pc/pixelSize),l)),1.0);}`,
};

const BOUNDS = 18;
const state = { hp:5, score:0, ammo:5, maxAmmo:5, enemies:[], snowballs:[], particles:[], keys:{}, playerDir:new THREE.Vector3(0,0,-1), gameOver:false, started:false };

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x888888);
const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 100);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ditherPass = new ShaderPass(DitherShader); composer.addPass(ditherPass);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 12, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(BOUNDS*2, BOUNDS*2),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 1 })
);
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

for (let i = 0; i < 4; i++) {
  const isX = i < 2;
  const w = new THREE.Mesh(
    new THREE.BoxGeometry(isX ? 0.3 : BOUNDS*2, 2, isX ? BOUNDS*2 : 0.3),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  w.position.set(i===0?-BOUNDS:i===1?BOUNDS:0, 1, i===2?-BOUNDS:i===3?BOUNDS:0);
  w.castShadow = true; scene.add(w);
}

for (let i = 0; i < 10; i++) {
  const r = 0.8 + Math.random()*1.5;
  const geo = new THREE.SphereGeometry(r, 8, 6); geo.scale(1, 0.4, 1);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  const a = Math.random()*Math.PI*2, d = 5 + Math.random()*10;
  m.position.set(Math.cos(a)*d, r*0.2, Math.sin(a)*d); m.castShadow = true; scene.add(m);
}

for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.5,6), new THREE.MeshStandardMaterial({color:0x444444}));
  tk.position.y = 0.75; tk.castShadow = true; g.add(tk);
  for (let j = 0; j < 3; j++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.2-j*0.3,1.5,6), new THREE.MeshStandardMaterial({color:0x555555}));
    c.position.y = 2 + j*0.9; c.castShadow = true; g.add(c);
  }
  const a = Math.random()*Math.PI*2, d = 10 + Math.random()*6;
  g.position.set(Math.cos(a)*d, 0, Math.sin(a)*d); scene.add(g);
}

const snowGeo = new THREE.BufferGeometry();
const snowCount = 600, snowPos = new Float32Array(snowCount*3);
for (let i = 0; i < snowCount; i++) { snowPos[i*3]=(Math.random()-0.5)*50; snowPos[i*3+1]=Math.random()*20; snowPos[i*3+2]=(Math.random()-0.5)*50; }
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
scene.add(new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));

function clampBounds(p) { const l=BOUNDS-1; p.x=Math.max(-l,Math.min(l,p.x)); p.z=Math.max(-l,Math.min(l,p.z)); }
function disposeGroup(g) { g.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();}); scene.remove(g); }
function createChargeRing(color) {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.3,0.5,12), new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:0.7}));
  r.rotation.x = -Math.PI/2; return r;
}
function spawnBurst(pos, count) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06,4,4), new THREE.MeshBasicMaterial({color:0xffffff}));
    m.position.copy(pos); scene.add(m);
    state.particles.push({ mesh:m, vel:new THREE.Vector3((Math.random()-0.5)*5, Math.random()*3+1, (Math.random()-0.5)*5), life:0.4+Math.random()*0.3 });
  }
}

// Player
const player = new THREE.Group();
const pB = new THREE.Mesh(new THREE.CapsuleGeometry(0.3,0.7,4,8), new THREE.MeshStandardMaterial({color:0x333333}));
pB.position.y = 0.85; pB.castShadow = true; player.add(pB);
const pH = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshStandardMaterial({color:0xaaaaaa}));
pH.position.y = 1.55; pH.castShadow = true; player.add(pH);
scene.add(player);

// Enemy
class Enemy {
  constructor() {
    this.mesh = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.3,0.7,4,8), new THREE.MeshStandardMaterial({color:0x666666}));
    b.position.y = 0.85; b.castShadow = true; this.mesh.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshStandardMaterial({color:0x999999}));
    h.position.y = 1.55; h.castShadow = true; this.mesh.add(h);
    const a = Math.random()*Math.PI*2, d = 8+Math.random()*8;
    this.mesh.position.set(Math.cos(a)*d, 0, Math.sin(a)*d); scene.add(this.mesh);
    this.hp = 2; this.cooldown = 80+Math.floor(Math.random()*60);
    this.moveTimer = 0; this.moveDir = new THREE.Vector3();
    this.alive = true; this.charging = false; this.chargeTime = 0; this.chargeEffect = null;
  }
  update(dt) {
    if (!this.alive) return;
    const toP = new THREE.Vector3().subVectors(player.position, this.mesh.position);
    const dist = toP.length();
    if (this.charging) {
      this.chargeTime += dt;
      if (this.chargeEffect) { this.chargeEffect.scale.setScalar(0.5+this.chargeTime*0.8); this.chargeEffect.rotation.y += dt*5; }
      if (this.chargeTime >= 1.2) {
        this.fire(); this.charging = false; this.chargeTime = 0;
        if (this.chargeEffect) { this.mesh.remove(this.chargeEffect); this.chargeEffect = null; }
        this.cooldown = 80+Math.floor(Math.random()*60);
      }
      return;
    }
    this.cooldown--; this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer = 1+Math.random()*1.5;
      if (dist > 12) this.moveDir.copy(toP).normalize();
      else if (dist < 5) this.moveDir.copy(toP).normalize().negate();
      else this.moveDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
    }
    this.mesh.position.add(this.moveDir.clone().multiplyScalar(2.5*dt));
    clampBounds(this.mesh.position);
    this.mesh.lookAt(player.position.x, 0, player.position.z);
    if (this.cooldown <= 0 && dist < 16) {
      this.charging = true; this.chargeTime = 0;
      this.chargeEffect = createChargeRing(0x999999); this.chargeEffect.position.y = 1;
      this.mesh.add(this.chargeEffect);
    }
  }
  fire() {
    const dir = new THREE.Vector3().subVectors(player.position, this.mesh.position).normalize();
    dir.y = 0.15; dir.normalize();
    const pos = this.mesh.position.clone(); pos.y += 1.2;
    fireSnowball(pos, dir, 14, false, 0.15);
  }
  hit() {
    this.hp--; spawnBurst(this.mesh.position, 8);
    if (this.hp <= 0) {
      this.alive = false;
      if (this.chargeEffect) this.mesh.remove(this.chargeEffect);
      scene.remove(this.mesh); state.score += 10; updateHUD();
    }
  }
}
function spawnEnemies() { for (let i = 0; i < 4; i++) state.enemies.push(new Enemy()); }
spawnEnemies();

// Snowball
function fireSnowball(pos, dir, speed, fromPlayer, size = 0.15) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size,8,8), new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.3}));
  core.castShadow = true; group.add(core);
  const outline = new THREE.Mesh(new THREE.SphereGeometry(size+0.04,8,8), new THREE.MeshBasicMaterial({color:0x000000,side:THREE.BackSide}));
  group.add(outline);
  group.position.copy(pos); scene.add(group);
  state.snowballs.push({ mesh:group, dir:dir.clone(), speed, fromPlayer, life:3.5, vy:0.12 });
}

// Charging
let isCharging = false, chargeStart = 0, playerChargeEffect = null;
const chargeBar = document.getElementById('charge-bar');
const chargeFill = document.getElementById('charge-fill');

function playerShoot(chargeTime) {
  if (state.ammo <= 0 || state.gameOver) return;
  if (chargeTime > 2.0) { spawnBurst(player.position, 10); showMsg('눈이 부서졌다!'); state.ammo--; updateHUD(); return; }
  state.ammo--; updateHUD();
  let multiplier;
  if (chargeTime >= 1.8) multiplier = 5.0;
  else multiplier = 1.0 + (chargeTime / 1.8) * 3.0;
  const speed = 12 * multiplier;
  const size = 0.12 * Math.min(multiplier, 3.0);
  const dir = state.playerDir.clone();
  dir.y = 0.1 + (multiplier-1)*0.02; dir.normalize();
  const pos = player.position.clone(); pos.y += 1.2;
  pos.add(dir.clone().multiplyScalar(0.5));
  fireSnowball(pos, dir, speed, true, size);
  if (chargeTime >= 1.8) showMsg('완벽!');
}

// Input
document.addEventListener('keydown', e => { state.keys[e.code] = true; });
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

canvas.addEventListener('mousedown', e => {
  if (!state.started) return;
  if (!document.pointerLockElement) { canvas.requestPointerLock(); return; }
  if (e.button === 0 && !state.gameOver) {
    if (state.ammo <= 0) { showMsg('탄약 없음! R로 재장전'); return; }
    isCharging = true; chargeStart = performance.now();
    chargeBar.classList.add('active');
    playerChargeEffect = createChargeRing(0xffffff); playerChargeEffect.position.y = 1;
    player.add(playerChargeEffect);
  }
});
canvas.addEventListener('mouseup', e => {
  if (!isCharging) return;
  if (e.button === 0) {
    const t = (performance.now() - chargeStart) / 1000;
    isCharging = false; chargeBar.classList.remove('active');
    chargeFill.style.width = '0%'; chargeFill.classList.remove('overcharge');
    if (playerChargeEffect) { player.remove(playerChargeEffect); playerChargeEffect = null; }
    playerShoot(t);
  }
});
let camTheta = 0;
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  camTheta -= e.movementX * 0.004;
});
document.addEventListener('keydown', e => {
  if (e.code === 'KeyR' && state.ammo < state.maxAmmo) { state.ammo = state.maxAmmo; updateHUD(); }
});

// HUD
const hpEl = document.getElementById('hp');
const scoreEl = document.getElementById('score');
const msgEl = document.getElementById('msg');
function updateHUD() {
  hpEl.textContent = 'HP: ' + '■'.repeat(state.hp) + '□'.repeat(Math.max(0,5-state.hp)) + '  AMMO: ' + state.ammo;
  scoreEl.textContent = 'SCORE: ' + state.score;
}
function showMsg(t) { msgEl.textContent = t; msgEl.classList.add('show'); if(t) setTimeout(()=>msgEl.classList.remove('show'), 1500); }
function gameOver() { state.gameOver = true; showMsg('GAME OVER — R to restart'); document.exitPointerLock(); }
function restart() {
  state.hp=5; state.score=0; state.ammo=state.maxAmmo; state.gameOver=false;
  state.enemies.forEach(e=>{if(e.alive)scene.remove(e.mesh);}); state.enemies=[];
  spawnEnemies(); player.position.set(0,0,0); updateHUD();
}

// Title
const titleScreen = document.getElementById('title-screen');
let titleCamAngle = 0;
titleScreen.addEventListener('click', () => { titleScreen.classList.add('hidden'); state.started = true; canvas.requestPointerLock(); });

// Game Loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!state.started) {
    titleCamAngle += dt * 0.3;
    camera.position.set(Math.sin(titleCamAngle)*22, 10, Math.cos(titleCamAngle)*22);
    camera.lookAt(0, 1, 0);
    composer.render(); return;
  }
  if (state.gameOver) { if(state.keys['KeyR']) restart(); composer.render(); return; }

  // Charge bar
  if (isCharging) {
    const elapsed = (performance.now()-chargeStart)/1000;
    chargeFill.style.width = Math.min(elapsed/2.0,1.0)*100 + '%';
    chargeFill.classList.toggle('overcharge', elapsed > 2.0);
    if (playerChargeEffect) { playerChargeEffect.scale.setScalar(0.5+elapsed*0.8); playerChargeEffect.rotation.y += dt*5; }
  }

  // Player move (blocked while charging)
  if (!isCharging) {
    const forward = new THREE.Vector3(-Math.sin(camTheta), 0, -Math.cos(camTheta));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (state.keys['KeyW']) move.add(forward);
    if (state.keys['KeyS']) move.sub(forward);
    if (state.keys['KeyA']) move.sub(right);
    if (state.keys['KeyD']) move.add(right);
    if (move.length() > 0) { move.normalize().multiplyScalar(5*dt); player.position.add(move); clampBounds(player.position); }
  }
  player.rotation.y = camTheta;
  state.playerDir.set(-Math.sin(camTheta), 0, -Math.cos(camTheta));

  camera.position.set(player.position.x+Math.sin(camTheta)*7, 7, player.position.z+Math.cos(camTheta)*7);
  camera.lookAt(player.position.x, 1, player.position.z);

  state.enemies.forEach(e => e.update(dt));

  for (let i = state.snowballs.length-1; i >= 0; i--) {
    const sb = state.snowballs[i];
    sb.mesh.position.add(sb.dir.clone().multiplyScalar(sb.speed*dt));
    sb.mesh.position.y += sb.vy; sb.vy -= 9.8*dt*0.3; sb.life -= dt;
    if (sb.life <= 0 || sb.mesh.position.y < 0) { spawnBurst(sb.mesh.position,4); disposeGroup(sb.mesh); state.snowballs.splice(i,1); continue; }
    if (sb.fromPlayer) {
      for (const en of state.enemies) {
        if (!en.alive) continue;
        if (sb.mesh.position.distanceTo(en.mesh.position) < 1.0) { en.hit(); disposeGroup(sb.mesh); state.snowballs.splice(i,1); break; }
      }
    } else {
      if (sb.mesh.position.distanceTo(player.position) < 1.0) {
        state.hp--; updateHUD(); spawnBurst(player.position,6); showMsg('퍽!');
        disposeGroup(sb.mesh); state.snowballs.splice(i,1);
        if (state.hp <= 0) gameOver();
      }
    }
  }

  for (let i = state.particles.length-1; i >= 0; i--) {
    const p = state.particles[i];
    p.vel.y -= 9.8*dt; p.mesh.position.add(p.vel.clone().multiplyScalar(dt)); p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); state.particles.splice(i,1); }
  }

  const sp = snowGeo.attributes.position.array;
  for (let i = 0; i < snowCount; i++) {
    sp[i*3+1] -= dt*1.5; sp[i*3] += Math.sin(Date.now()*0.001+i)*dt*0.2;
    if (sp[i*3+1] < 0) { sp[i*3+1] = 18; sp[i*3] = player.position.x+(Math.random()-0.5)*50; }
  }
  snowGeo.attributes.position.needsUpdate = true;

  if (state.enemies.filter(e=>e.alive).length === 0) { state.score += 50; showMsg('WAVE CLEAR +50'); spawnEnemies(); }

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  ditherPass.uniforms.resolution.value.set(innerWidth, innerHeight);
});

updateHUD(); animate();
