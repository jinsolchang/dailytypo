import * as THREE from 'three';

export function createCluster() {
  const group = new THREE.Group();
  const galaxyCount = 60;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(galaxyCount * 3);
  const colors = new Float32Array(galaxyCount * 3);
  const sizes = new Float32Array(galaxyCount);

  for (let i = 0; i < galaxyCount; i++) {
    const r = 5 + Math.random() * 50;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi);

    const type = Math.random();
    if (type > 0.6) {
      colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
    } else if (type > 0.3) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.7;
    } else {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 0.5;
    }

    sizes[i] = 2.0 + Math.random() * 5.0;
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
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (500.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        // Spiral galaxy shape hint
        float angle = atan(uv.y, uv.x);
        float spiral = sin(angle * 2.0 + d * 10.0) * 0.1;
        float core = exp(-d * 6.0);
        float disk = exp(-d * 3.0) * 0.5 * (1.0 + spiral);
        float brightness = core + disk;
        gl_FragColor = vec4(vColor * brightness * 2.0, brightness);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  group.add(new THREE.Points(geometry, material));

  // Hot gas (ICM - intracluster medium)
  const gasGeo = new THREE.SphereGeometry(35, 32, 32);
  const gasMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float uTime;
      void main() {
        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        rim = pow(rim, 3.0);
        float noise = sin(vPosition.x * 0.5 + uTime) * sin(vPosition.y * 0.5 + uTime * 0.7) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.2, 0.1, 0.4), vec3(0.4, 0.2, 0.6), noise);
        gl_FragColor = vec4(col * rim, rim * 0.15);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(gasGeo, gasMat));

  group.userData.animate = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
    gasMat.uniforms.uTime.value = elapsed;
    group.rotation.y = elapsed * 0.02;
  };
  group.userData.update = () => {};

  return group;
}
