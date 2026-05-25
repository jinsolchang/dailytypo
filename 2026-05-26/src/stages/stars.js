import * as THREE from 'three';

export function createStars() {
  const group = new THREE.Group();
  const count = 5000;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 20 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const starType = Math.random();
    if (starType > 0.8) {
      colors[i * 3] = 0.6; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 1.0;
    } else if (starType > 0.5) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 0.9;
    } else if (starType > 0.2) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6;
    } else {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.4; colors[i * 3 + 2] = 0.2;
    }

    sizes[i] = 1.0 + Math.random() * 3.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vSize;
      uniform float uTime;
      void main() {
        vColor = color;
        vSize = size;
        vec3 pos = position;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float twinkle = 1.0 + 0.3 * sin(uTime * 2.0 + position.x * 10.0);
        gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSize;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = exp(-d * 8.0);
        float glow = exp(-d * 3.0) * 0.5;
        float rays = 0.0;
        if (vSize > 2.5) {
          vec2 uv = gl_PointCoord - 0.5;
          rays = max(0.0, 1.0 - abs(uv.x) * 8.0) * exp(-abs(uv.y) * 4.0) * 0.3;
          rays += max(0.0, 1.0 - abs(uv.y) * 8.0) * exp(-abs(uv.x) * 4.0) * 0.3;
        }
        float alpha = core + glow + rays;
        vec3 col = vColor * (core + glow) + vec3(1.0) * rays;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);

  // Nebula clouds
  const nebulaCount = 20;
  const nebulaGeo = new THREE.PlaneGeometry(15, 15);
  for (let i = 0; i < nebulaCount; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    const hue = Math.random() * 60 + 200;
    gradient.addColorStop(0, `hsla(${hue}, 80%, 50%, 0.3)`);
    gradient.addColorStop(0.5, `hsla(${hue}, 60%, 30%, 0.1)`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);

    const nebulaMat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, opacity: 0.4,
    });
    const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
    nebula.position.set(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );
    nebula.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    nebula.scale.setScalar(1 + Math.random() * 2);
    group.add(nebula);
  }

  group.userData.animate = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
    group.rotation.y = elapsed * 0.01;
  };
  group.userData.update = () => {};

  return group;
}
