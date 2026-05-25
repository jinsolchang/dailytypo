import * as THREE from 'three';

export function createSupercluster() {
  const group = new THREE.Group();

  // Cosmic web filaments
  const filamentCount = 30;
  const nodesPerFilament = 20;
  const nodeGeometry = new THREE.BufferGeometry();
  const totalNodes = filamentCount * nodesPerFilament + 500;
  const positions = new Float32Array(totalNodes * 3);
  const colors = new Float32Array(totalNodes * 3);
  const sizes = new Float32Array(totalNodes);

  let idx = 0;

  for (let f = 0; f < filamentCount; f++) {
    const startX = (Math.random() - 0.5) * 200;
    const startY = (Math.random() - 0.5) * 200;
    const startZ = (Math.random() - 0.5) * 200;
    const dirX = (Math.random() - 0.5) * 2;
    const dirY = (Math.random() - 0.5) * 2;
    const dirZ = (Math.random() - 0.5) * 2;

    for (let n = 0; n < nodesPerFilament; n++) {
      const t = n / nodesPerFilament;
      const scatter = 3;
      positions[idx * 3] = startX + dirX * t * 100 + (Math.random() - 0.5) * scatter;
      positions[idx * 3 + 1] = startY + dirY * t * 100 + (Math.random() - 0.5) * scatter;
      positions[idx * 3 + 2] = startZ + dirZ * t * 100 + (Math.random() - 0.5) * scatter;

      colors[idx * 3] = 0.4 + Math.random() * 0.3;
      colors[idx * 3 + 1] = 0.3 + Math.random() * 0.2;
      colors[idx * 3 + 2] = 0.7 + Math.random() * 0.3;

      sizes[idx] = 1.0 + Math.random() * 2.0;
      idx++;
    }
  }

  // Cluster nodes at intersections
  for (let i = 0; i < 500; i++) {
    const r = Math.random() * 150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.cos(phi);

    colors[idx * 3] = 0.5;
    colors[idx * 3 + 1] = 0.3;
    colors[idx * 3 + 2] = 0.8;
    sizes[idx] = 0.5 + Math.random() * 1.0;
    idx++;
  }

  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  nodeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  nodeGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (600.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 4.0);
        gl_FragColor = vec4(vColor * glow * 1.5, glow * 0.8);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  group.add(new THREE.Points(nodeGeometry, material));

  // Filament lines
  for (let f = 0; f < filamentCount; f++) {
    const linePoints = [];
    const baseIdx = f * nodesPerFilament;
    for (let n = 0; n < nodesPerFilament; n++) {
      const i = (baseIdx + n) * 3;
      linePoints.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4422aa, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Line(lineGeo, lineMat));
  }

  group.userData.animate = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
    group.rotation.y = elapsed * 0.005;
    group.rotation.x = Math.sin(elapsed * 0.01) * 0.05;
  };
  group.userData.update = () => {};

  return group;
}
