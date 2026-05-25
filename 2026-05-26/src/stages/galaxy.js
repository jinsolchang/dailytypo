import * as THREE from 'three';

export function createGalaxy() {
  const group = new THREE.Group();
  const armCount = 4;
  const particlesPerArm = 5000;
  const totalParticles = armCount * particlesPerArm + 2000; // +2000 for core

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);
  const sizes = new Float32Array(totalParticles);

  let idx = 0;

  // Spiral arms
  for (let arm = 0; arm < armCount; arm++) {
    const armAngle = (arm / armCount) * Math.PI * 2;
    for (let i = 0; i < particlesPerArm; i++) {
      const t = i / particlesPerArm;
      const radius = 2 + t * 40;
      const spin = t * 3.0;
      const angle = armAngle + spin;

      const scatter = (1 - t * 0.5) * 2.0;
      const x = Math.cos(angle) * radius + (Math.random() - 0.5) * scatter * 3;
      const y = (Math.random() - 0.5) * scatter * 0.5;
      const z = Math.sin(angle) * radius + (Math.random() - 0.5) * scatter * 3;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      // Color: core is warm gold, arms are blue-white
      const coreInfluence = 1 - t;
      if (Math.random() > 0.7) {
        colors[idx * 3] = 0.5 + coreInfluence * 0.5;
        colors[idx * 3 + 1] = 0.6 + coreInfluence * 0.3;
        colors[idx * 3 + 2] = 1.0;
      } else {
        colors[idx * 3] = 1.0;
        colors[idx * 3 + 1] = 0.8 + (1 - coreInfluence) * 0.2;
        colors[idx * 3 + 2] = 0.5 + (1 - coreInfluence) * 0.5;
      }

      sizes[idx] = 0.3 + Math.random() * 1.5 * (1 - t * 0.5);
      idx++;
    }
  }

  // Core bulge
  for (let i = 0; i < 2000; i++) {
    const r = Math.random() * 5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.5;
    positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3;
    positions[idx * 3 + 2] = r * Math.cos(phi) * 1.5;

    colors[idx * 3] = 1.0;
    colors[idx * 3 + 1] = 0.9;
    colors[idx * 3 + 2] = 0.6;
    sizes[idx] = 0.5 + Math.random() * 2.0;
    idx++;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        vColor = color;
        vec3 pos = position;
        float angle = uTime * 0.05 * (1.0 / (1.0 + length(pos.xz) * 0.1));
        float c = cos(angle), s = sin(angle);
        pos.xz = mat2(c, -s, s, c) * pos.xz;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (400.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 5.0);
        gl_FragColor = vec4(vColor * glow * 1.5, glow);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);

  // Dust lanes (dark patches)
  const dustGeo = new THREE.PlaneGeometry(80, 80);
  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = 256; dustCanvas.height = 256;
  const dctx = dustCanvas.getContext('2d');
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 10 + Math.random() * 40;
    const grad = dctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.15)');
    grad.addColorStop(1, 'transparent');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 256, 256);
  }
  const dustTex = new THREE.CanvasTexture(dustCanvas);
  const dustMat = new THREE.MeshBasicMaterial({
    map: dustTex, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const dust = new THREE.Mesh(dustGeo, dustMat);
  dust.rotation.x = Math.PI / 2;
  group.add(dust);

  group.rotation.x = 0.3;

  group.userData.animate = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
  };
  group.userData.update = () => {};

  return group;
}
