import * as THREE from 'three';

export function createBigBang() {
  const group = new THREE.Group();
  const count = 8000;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.5 + Math.random() * 2.0;
    velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
    velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
    velocities[i * 3 + 2] = Math.cos(phi) * speed;

    const temp = Math.random();
    if (temp > 0.7) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.9;
      colors[i * 3 + 2] = 0.7;
    } else if (temp > 0.3) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.6;
      colors[i * 3 + 2] = 0.2;
    } else {
      colors[i * 3] = 0.8;
      colors[i * 3 + 1] = 0.4;
      colors[i * 3 + 2] = 0.1;
    }

    sizes[i] = 0.5 + Math.random() * 2.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uExpansion: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uExpansion;
      void main() {
        vColor = color;
        vec3 pos = position;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z) * (1.0 + uExpansion * 0.5);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 4.0);
        vec3 col = vColor * glow * 2.0;
        gl_FragColor = vec4(col, glow);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);

  // Core glow sphere
  const coreGeo = new THREE.SphereGeometry(0.3, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  group.userData.velocities = velocities;
  group.userData.startTime = null;

  group.userData.animate = (elapsed) => {
    if (!group.userData.startTime) group.userData.startTime = elapsed;
    const t = elapsed - group.userData.startTime;

    material.uniforms.uTime.value = t;
    const expansion = Math.min(t * 0.3, 1.0);
    material.uniforms.uExpansion.value = expansion;

    const posAttr = geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      posAttr.array[i * 3] += velocities[i * 3] * 0.02 * expansion;
      posAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * 0.02 * expansion;
      posAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * 0.02 * expansion;
    }
    posAttr.needsUpdate = true;

    core.scale.setScalar(1.0 + Math.sin(t * 3) * 0.2);
    coreMat.opacity = Math.max(0, 1.0 - expansion);
  };

  group.userData.update = (localProgress) => {};

  return group;
}
