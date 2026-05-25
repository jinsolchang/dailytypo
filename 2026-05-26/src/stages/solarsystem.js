import * as THREE from 'three';

export function createSolarSystem() {
  const group = new THREE.Group();

  // Central star (sun)
  const sunGeo = new THREE.SphereGeometry(2, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  group.add(sun);

  // Sun glow
  const glowGeo = new THREE.SphereGeometry(3, 32, 32);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      uniform float uTime;
      void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        vec3 col = vec3(1.0, 0.8, 0.3) * intensity * 2.0;
        gl_FragColor = vec4(col, intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  // Planets
  const planets = [];
  const planetData = [
    { radius: 0.2, distance: 5, speed: 2.0, color: 0xaaaaaa },
    { radius: 0.4, distance: 8, speed: 1.5, color: 0xddaa44 },
    { radius: 0.5, distance: 12, speed: 1.0, color: 0x4488ff },
    { radius: 0.45, distance: 16, speed: 0.8, color: 0xcc4422 },
    { radius: 1.2, distance: 22, speed: 0.5, color: 0xddbb88 },
    { radius: 1.0, distance: 30, speed: 0.35, color: 0xeedd99 },
  ];

  planetData.forEach(p => {
    const geo = new THREE.SphereGeometry(p.radius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: p.color });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Orbit ring
    const orbitGeo = new THREE.RingGeometry(p.distance - 0.02, p.distance + 0.02, 64);
    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
    });
    const orbit = new THREE.Mesh(orbitGeo, orbitMat);
    orbit.rotation.x = Math.PI / 2;
    group.add(orbit);

    planets.push({ mesh, ...p });
  });

  // Background stars
  const bgCount = 2000;
  const bgGeo = new THREE.BufferGeometry();
  const bgPos = new Float32Array(bgCount * 3);
  for (let i = 0; i < bgCount; i++) {
    const r = 100 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    bgPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    bgPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    bgPos[i * 3 + 2] = r * Math.cos(phi);
  }
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
  const bgMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.3, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Points(bgGeo, bgMat));

  group.userData.animate = (elapsed) => {
    planets.forEach(p => {
      const angle = elapsed * p.speed * 0.3;
      p.mesh.position.x = Math.cos(angle) * p.distance;
      p.mesh.position.z = Math.sin(angle) * p.distance;
    });
    sun.rotation.y = elapsed * 0.1;
    glowMat.uniforms.uTime.value = elapsed;
  };
  group.userData.update = () => {};

  return group;
}
