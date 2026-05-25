import * as THREE from 'three';

export function createObservableUniverse() {
  const group = new THREE.Group();

  // Large-scale structure points (superclusters as tiny dots)
  const count = 3000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 20 + Math.random() * 180;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const depth = r / 200;
    colors[i * 3] = 0.3 + depth * 0.2;
    colors[i * 3 + 1] = 0.2 + depth * 0.1;
    colors[i * 3 + 2] = 0.5 + depth * 0.3;
    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (800.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 4.0);
        gl_FragColor = vec4(vColor * glow, glow * 0.6);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  group.add(new THREE.Points(geometry, material));

  // CMB sphere (cosmic microwave background)
  const cmbGeo = new THREE.SphereGeometry(250, 64, 64);
  const cmbCanvas = document.createElement('canvas');
  cmbCanvas.width = 512; cmbCanvas.height = 256;
  const ctx = cmbCanvas.getContext('2d');

  // Generate CMB-like noise pattern
  const imageData = ctx.createImageData(512, 256);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.random() * 0.3;
    const base = 0.1 + noise;
    const px = (i / 4) % 512;
    const py = Math.floor((i / 4) / 512);
    const largescale = Math.sin(px * 0.02) * Math.cos(py * 0.03) * 0.2;

    imageData.data[i] = (base + largescale + 0.1) * 255;
    imageData.data[i + 1] = (base * 0.5) * 255;
    imageData.data[i + 2] = (base + largescale * 0.5 + 0.2) * 255;
    imageData.data[i + 3] = 40;
  }
  ctx.putImageData(imageData, 0, 0);

  const cmbTexture = new THREE.CanvasTexture(cmbCanvas);
  const cmbMat = new THREE.MeshBasicMaterial({
    map: cmbTexture,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const cmb = new THREE.Mesh(cmbGeo, cmbMat);
  group.add(cmb);

  // Outer glow ring
  const ringGeo = new THREE.RingGeometry(240, 260, 64);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        vec3 col = mix(vec3(0.2, 0.1, 0.4), vec3(0.4, 0.2, 0.6), vUv.x);
        float pulse = 0.8 + 0.2 * sin(uTime * 0.5 + vUv.y * 6.28);
        gl_FragColor = vec4(col * pulse, edge * 0.2);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  group.userData.animate = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
    ringMat.uniforms.uTime.value = elapsed;
    cmb.rotation.y = elapsed * 0.003;
    group.rotation.y = elapsed * 0.002;
  };
  group.userData.update = () => {};

  return group;
}
