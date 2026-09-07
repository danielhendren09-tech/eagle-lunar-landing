import * as THREE from "three";

const MASS = 7200; // kg, roughly LM at this point in the descent
const FT = 3.28084;

export function mToFt(m) {
  return m * FT;
}

export function msToFps(ms) {
  return ms * FT;
}

/** Active world drives both the mesh AND collision. */
let terrainProfile = null;
let padOrigin = { x: 0, z: 0 };
let escapeAlt = 220;

export function setTerrainProfile(planet) {
  terrainProfile = planet;
  padOrigin = { x: planet.padX || 0, z: planet.padZ || 0 };
  escapeAlt = planet.escapeAlt || 220;
}

export function getPadOrigin() {
  return padOrigin;
}

export function getEscapeAlt() {
  return escapeAlt;
}

export function getPadWorldPos(out = new THREE.Vector3()) {
  const y = heightAt(padOrigin.x, padOrigin.z) + 0.4;
  return out.set(padOrigin.x, y, padOrigin.z);
}

/** Same height function builds the mesh AND the collision ground. */
export function heightAt(x, z) {
  const p = terrainProfile;
  if (!p) return 0;
  const t = p.terrain;
  const px = padOrigin.x;
  const pz = padOrigin.z;
  let h = 0;

  for (const [fx, fz, amp, phase] of t.hills) {
    h += Math.sin(x * fx + phase) * Math.cos(z * fz + phase * 0.7) * amp;
  }

  for (const [cx, cz, radius, depth] of t.craters) {
    h += crater(x, z, px + cx, pz + cz, radius, depth);
  }

  if (t.ridge) {
    const { spacing, height, width } = t.ridge;
    const dx = x - px;
    const dz = z - pz;
    const r = Math.hypot(dx, dz);
    const ring = r % spacing;
    const dist = Math.min(ring, spacing - ring);
    const bump = 1 - smoothstep(0, width, dist);
    h += height * bump * bump;
  }

  if (t.canyon) {
    const c = t.canyon;
    const ca = Math.cos(c.angle);
    const sa = Math.sin(c.angle);
    const lx = x - (px + c.x);
    const lz = z - (pz + c.z);
    const along = lx * ca + lz * sa;
    const across = -lx * sa + lz * ca;
    if (Math.abs(along) < c.length * 0.5) {
      const wall = smoothstep(0, c.width, Math.abs(across));
      h -= c.depth * (1 - wall) * (1 - wall);
    }
  }

  // Flatten under the landing pad so the ring sits clean.
  const rPad = Math.hypot(x - px, z - pz);
  const flat = t.flatten || 30;
  if (rPad < flat) {
    const f = 1 - smoothstep(flat * 0.7, flat, rPad);
    h *= 1 - f;
  }
  return h;
}

function crater(x, z, cx, cz, radius, depth) {
  const d = Math.hypot(x - cx, z - cz);
  if (d > radius) return 0;
  const n = d / radius;
  return -depth * (1 - n) * (1 - n) * (0.35 + 0.65 * n);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}

/** Canvas dust/regolith map — cheap way to kill the flat plastic look. */
function makeRegolithTextures() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d");
  const img = c.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(x * 0.035, y * 0.035, 5);
      const speck = hash2(x * 0.7, y * 1.1);
      const shade = 0.55 + n * 0.5 + (speck > 0.97 ? 0.14 : 0) - (speck < 0.03 ? 0.12 : 0);
      const v = Math.min(255, Math.max(0, shade * 210));
      d[i] = v;
      d[i + 1] = v * 0.98;
      d[i + 2] = v * 0.94;
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  for (let k = 0; k < 60; k++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 8 + Math.random() * 44;
    const g = c.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    g.addColorStop(0, "rgba(18,16,14,0.38)");
    g.addColorStop(0.5, "rgba(18,16,14,0.08)");
    g.addColorStop(0.72, "rgba(235,225,210,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rc = roughCanvas.getContext("2d");
  const rimg = rc.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const n = 175 + fbm(x * 0.08, y * 0.08, 3) * 75;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = n;
      rimg.data[i + 3] = 255;
    }
  }
  rc.putImageData(rimg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(6, 6);

  return { map, roughnessMap };
}

function makeFoilTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  c.fillStyle = "#e8e4d8";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const w = 8 + Math.random() * 40;
    const h = 2 + Math.random() * 6;
    c.fillStyle = `rgba(${200 + Math.random() * 40},${190 + Math.random() * 40},${160 + Math.random() * 40},${0.08 + Math.random() * 0.2})`;
    c.save();
    c.translate(x, y);
    c.rotate(Math.random() * Math.PI);
    c.fillRect(-w / 2, -h / 2, w, h);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStars() {
  const count = 3200;
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 500 + Math.random() * 900;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.6 + Math.random() * 2.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xf2f6ff,
      size: 1.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
}

export function createHorizon() {
  const geo = new THREE.SphereGeometry(900, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x000008) },
      bottom: { value: new THREE.Color(0x1a1814) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottom, top, pow(h, 1.35));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export function createMoon() {
  const group = new THREE.Group();
  const size = 520;
  const seg = 192;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const baseXZ = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    baseXZ[i * 2] = pos.getX(i);
    baseXZ[i * 2 + 1] = pos.getZ(i);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));

  const { map, roughnessMap } = makeRegolithTextures();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9a9690,
    map,
    roughnessMap,
    roughness: 0.95,
    metalness: 0.04,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "surface";
  group.add(mesh);

  const padGroup = new THREE.Group();
  group.add(padGroup);
  const hazardGroup = new THREE.Group();
  group.add(hazardGroup);
  const hoopGroup = new THREE.Group();
  group.add(hoopGroup);

  group.userData.surface = mesh;
  group.userData.baseXZ = baseXZ;
  group.userData.padGroup = padGroup;
  group.userData.hazardGroup = hazardGroup;
  group.userData.hoopGroup = hoopGroup;

  return { group, boulders: [], hoops: [] };
}

function clearGroup(g) {
  while (g.children.length) {
    const c = g.children.pop();
    c.geometry?.dispose?.();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
      else c.material.dispose?.();
    }
  }
}

function makeHazardMesh(kind, r, colorHex) {
  let geo;
  let mat;
  if (kind === "ice") {
    geo = new THREE.ConeGeometry(r * 0.55, r * 2.4, 5);
    mat = new THREE.MeshStandardMaterial({
      color: 0xb8d8e8,
      roughness: 0.35,
      metalness: 0.25,
      emissive: 0x204050,
      emissiveIntensity: 0.15,
    });
  } else if (kind === "vent") {
    geo = new THREE.CylinderGeometry(r * 0.9, r * 1.1, r * 0.55, 10);
    mat = new THREE.MeshStandardMaterial({
      color: 0x2a1810,
      emissive: colorHex || 0xff6020,
      emissiveIntensity: 0.55,
      roughness: 0.85,
    });
  } else if (kind === "tower") {
    geo = new THREE.BoxGeometry(r * 0.35, r * 3.2, r * 0.35);
    mat = new THREE.MeshStandardMaterial({ color: 0x889098, metalness: 0.6, roughness: 0.35 });
  } else {
    geo = new THREE.IcosahedronGeometry(r, 1);
    mat = new THREE.MeshStandardMaterial({
      color: colorHex || 0x6e6a64,
      roughness: 0.92,
      metalness: 0.05,
    });
    const bp = geo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const nx = bp.getX(i);
      const ny = bp.getY(i);
      const nz = bp.getZ(i);
      const s = 0.82 + hash2(nx * 4, nz * 4) * 0.35;
      bp.setXYZ(i, nx * s, ny * s * 0.85, nz * s);
    }
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Rebuild terrain heights, move the gold ring, and place world-specific hazards.
 * Call whenever the player picks a different planet.
 */
export function applyWorldLayout(worldGroup, planet) {
  setTerrainProfile(planet);
  const surface = worldGroup.userData.surface;
  const baseXZ = worldGroup.userData.baseXZ;
  const padGroup = worldGroup.userData.padGroup;
  const hazardGroup = worldGroup.userData.hazardGroup;
  const hoopGroup = worldGroup.userData.hoopGroup;
  const geo = surface.geometry;
  const pos = geo.attributes.position;
  const colors = geo.attributes.color;

  for (let i = 0; i < pos.count; i++) {
    const x = baseXZ[i * 2];
    const z = baseXZ[i * 2 + 1];
    const y = heightAt(x, z);
    pos.setY(i, y);
    const n = fbm(x * 0.04 + planet.padX * 0.01, z * 0.04 + planet.padZ * 0.01, 3);
    const shade = 0.86 + n * 0.22 + Math.min(0.14, Math.abs(y) * 0.012);
    colors.setXYZ(i, shade, shade, shade * 0.98);
  }
  pos.needsUpdate = true;
  colors.needsUpdate = true;
  geo.computeVertexNormals();
  surface.material.color.setHex(planet.color);

  clearGroup(padGroup);
  const px = planet.padX;
  const pz = planet.padZ;
  const padY = heightAt(px, pz) + 0.22;
  [
    [7.2, 0.28, 0xd4b45a],
    [15.2, 0.22, 0x7cff6b],
    [22.4, 0.18, 0xd4b45a],
  ].forEach(([radius, tube, color]) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 96),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.2,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(px, padY, pz);
    padGroup.add(ring);
  });
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 48),
    new THREE.MeshBasicMaterial({
      color: 0xd4b45a,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(px, padY - 0.08, pz);
  padGroup.add(disc);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 28, 8),
    new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.18 })
  );
  beacon.position.set(px, padY + 14, pz);
  padGroup.add(beacon);

  clearGroup(hazardGroup);
  const boulders = [];
  for (const [ox, oz, r, kind] of planet.rocks || []) {
    const x = px + ox;
    const z = pz + oz;
    const rock = makeHazardMesh(kind || "rock", r, planet.color);
    const yOff = kind === "ice" ? r * 1.05 : kind === "tower" ? r * 1.5 : kind === "vent" ? r * 0.2 : r * 0.35;
    rock.position.set(x, heightAt(x, z) + yOff, z);
    rock.rotation.set(kind === "ice" || kind === "tower" ? 0 : Math.random(), Math.random() * Math.PI, 0);
    hazardGroup.add(rock);
    boulders.push({
      x,
      z,
      r: r * (kind === "tower" ? 0.6 : 1.05),
      y: rock.position.y,
      kind: kind || "rock",
    });
  }

  if (hoopGroup) clearGroup(hoopGroup);
  return boulders;
}

/** Free-mode fly-through hoops along a course near the pad. */
export function rebuildHoops(worldGroup, planet, count = 5) {
  const hoopGroup = worldGroup.userData.hoopGroup;
  if (!hoopGroup) return [];
  clearGroup(hoopGroup);
  setTerrainProfile(planet);
  const hoops = [];
  const px = planet.padX || 0;
  const pz = planet.padZ || 0;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.4) / count;
    const x = px + Math.sin(t * Math.PI * 1.6) * 70 + 25;
    const z = pz - 55 + t * 130;
    const alt = 22 + (i % 3) * 9;
    const y = heightAt(x, z) + alt;
    const nx = px + Math.sin((t + 0.12) * Math.PI * 1.6) * 70 + 25;
    const nz = pz - 55 + (t + 0.12) * 130;
    const ny = heightAt(nx, nz) + alt;
    const tangent = new THREE.Vector3(nx - x, ny - y, nz - z).normalize();
    const pos = new THREE.Vector3(x, y, z);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x6ec8ff,
      emissive: 0x2a80c0,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.25,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(9, 0.42, 10, 48), mat);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(tangent));
    hoopGroup.add(mesh);
    hoops.push({
      mesh,
      pos: pos.clone(),
      normal: tangent.clone(),
      r: 9,
      collected: false,
    });
  }
  return hoops;
}

export function createEarth() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  const ocean = c.createLinearGradient(0, 0, 0, 256);
  ocean.addColorStop(0, "#0a1e4a");
  ocean.addColorStop(0.5, "#1a4a8a");
  ocean.addColorStop(1, "#0c2848");
  c.fillStyle = ocean;
  c.fillRect(0, 0, 512, 256);
  // Continents
  const lands = [
    [90, 110, 70, 48, 0.5],
    [140, 90, 40, 28, -0.2],
    [280, 100, 90, 40, 0.3],
    [360, 130, 55, 30, -0.4],
    [420, 80, 45, 35, 0.6],
    [50, 180, 80, 25, 0.1],
  ];
  lands.forEach(([x, y, rx, ry, rot]) => {
    c.fillStyle = "#2f7a42";
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3d8f52";
    c.beginPath();
    c.ellipse(x - rx * 0.2, y - ry * 0.15, rx * 0.55, ry * 0.45, rot, 0, Math.PI * 2);
    c.fill();
  });
  c.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.ellipse(Math.random() * 512, Math.random() * 256, 12 + Math.random() * 28, 4 + Math.random() * 8, Math.random(), 0, Math.PI * 2);
    c.fill();
  }
  // Ice caps
  c.fillStyle = "rgba(230,240,255,0.85)";
  c.fillRect(0, 0, 512, 18);
  c.fillRect(0, 238, 512, 18);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(42, 48, 32),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.05 })
  );
  group.add(mesh);
  const atmos = new THREE.Mesh(
    new THREE.SphereGeometry(44.5, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0x6aa8ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide,
    })
  );
  group.add(atmos);
  group.position.set(-190, 120, -270);
  return group;
}

export function createEagle() {
  const lm = new THREE.Group();
  const foilTex = makeFoilTexture();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.72,
    roughness: 0.32,
    envMapIntensity: 0.8,
  });
  const silver = new THREE.MeshStandardMaterial({
    color: 0xd5d8dc,
    metalness: 0.65,
    roughness: 0.28,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.4, roughness: 0.55 });
  const foil = new THREE.MeshStandardMaterial({
    color: 0xf0ebe0,
    map: foilTex,
    metalness: 0.35,
    roughness: 0.55,
  });

  const descent = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 1.7, 10), gold);
  descent.position.y = 1.15;
  descent.castShadow = true;
  descent.receiveShadow = true;
  lm.add(descent);

  const oct = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.18, 10), gold);
  oct.position.y = 2.05;
  oct.castShadow = true;
  lm.add(oct);

  // Foil panels on descent stage faces
  for (let i = 0; i < 4; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.06), foil);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    panel.position.set(Math.cos(a) * 2.05, 1.15, Math.sin(a) * 2.05);
    panel.lookAt(0, 1.15, 0);
    lm.add(panel);
  }

  const ascent = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.1, 2.4), silver);
  ascent.position.y = 3.2;
  ascent.castShadow = true;
  ascent.receiveShadow = true;
  lm.add(ascent);

  const wrap = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.7, 2.55), foil);
  wrap.position.y = 2.55;
  lm.add(wrap);

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x081018,
    emissive: 0x1a4060,
    emissiveIntensity: 0.45,
    metalness: 0.9,
    roughness: 0.15,
  });
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.48, 0.08), windowMat);
  win.position.set(0, 3.45, 1.22);
  lm.add(win);
  const winL = win.clone();
  winL.position.set(-0.85, 3.35, 0.95);
  winL.rotation.y = 0.45;
  lm.add(winL);
  const winR = win.clone();
  winR.position.set(0.85, 3.35, 0.95);
  winR.rotation.y = -0.45;
  lm.add(winR);

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.95, 1.1, 20), dark);
  bell.position.y = 0.15;
  lm.add(bell);

  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  flameCore.position.y = -0.85;
  flameCore.rotation.x = Math.PI;
  flameCore.visible = false;
  lm.add(flameCore);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 2.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  flame.position.y = -1.2;
  flame.rotation.x = Math.PI;
  flame.visible = false;
  lm.add(flame);

  const flameLight = new THREE.PointLight(0xffa040, 0, 18, 2);
  flameLight.position.y = -1.4;
  lm.add(flameLight);

  const pads = [];
  const legSpread = 3.15;
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  corners.forEach(([sx, sz]) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), gold);
    strut.position.set(sx * 1.15, 0.2, sz * 1.15);
    strut.rotation.x = sz * 0.38;
    strut.rotation.z = -sx * 0.38;
    strut.castShadow = true;
    lm.add(strut);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 16), dark);
    pad.position.set(sx * legSpread, -0.55, sz * legSpread);
    pad.castShadow = true;
    pad.receiveShadow = true;
    lm.add(pad);
    pads.push(pad);

    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), silver);
    probe.position.set(sx * legSpread, -1.3, sz * legSpread);
    lm.add(probe);
  });

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20), silver);
  dish.position.set(-0.2, 4.45, -0.4);
  dish.rotation.x = 0.5;
  lm.add(dish);
  const dishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), dark);
  dishPole.position.set(-0.2, 4.05, -0.25);
  lm.add(dishPole);

  lm.userData.flame = flame;
  lm.userData.flameCore = flameCore;
  lm.userData.flameLight = flameLight;
  lm.userData.pads = pads;
  return lm;
}

export function createDust() {
  const count = 220;
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xc4bba8,
      size: 0.55,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  points.visible = false;
  points.userData.life = new Float32Array(count);
  return points;
}

/**
 * Semi-implicit Euler integration.
 * Stick tilts the lander; throttle makes thrust along the lander's "up" axis.
 * That's how Armstrong steered: he pointed the engine, he didn't have a steering wheel.
 */
export class Lander {
  constructor(mesh, difficulty, gravity = 1.62) {
    this.mesh = mesh;
    this.diff = difficulty;
    this.gravity = gravity;
    this.reset();
  }

  reset() {
    const d = this.diff;
    const pad = getPadOrigin();
    const x = pad.x + d.startX;
    const z = pad.z + d.startZ;
    this.padX = pad.x;
    this.padZ = pad.z;
    this.fuel = d.freeFlight ? 1 : d.fuel;
    this.fuelMax = d.freeFlight ? 1 : d.fuel;
    this.alive = true;
    this.landed = false;
    this.crashed = false;
    this.failReason = "";
    this.contact = false;
    this.parked = false;
    this.justParked = false;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = Math.atan2(-(x - pad.x), -(z - pad.z));
    this.pos = new THREE.Vector3(x, d.startAlt + heightAt(x, z), z);
    const dx = pad.x - x;
    const dz = pad.z - z;
    const range = Math.hypot(dx, dz) || 1;
    const sink = d.startVs ?? -1.6;
    this.vel = new THREE.Vector3((dx / range) * d.startHoriz, sink, (dz / range) * d.startHoriz);
    this.impactVs = 0;
    this.impactHs = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
  }

  upVector() {
    const up = new THREE.Vector3(0, 1, 0);
    up.applyEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, "YXZ"));
    return up;
  }

  step(dt, input) {
    if (!this.alive) return;

    const d = this.diff;
    const g = this.gravity;
    if (d.directAttitude) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, input.pitch * 0.38, 1 - Math.pow(0.001, dt));
      this.roll = THREE.MathUtils.lerp(this.roll, input.roll * 0.38, 1 - Math.pow(0.001, dt));
    } else {
      this.pitch += input.pitch * 0.85 * dt;
      this.roll += input.roll * 0.85 * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.7, 0.7);
      this.roll = THREE.MathUtils.clamp(this.roll, -0.7, 0.7);
    }
    this.yaw += input.yaw * 1.1 * dt;

    const throttle = this.fuel > 0 || d.freeFlight ? input.throttle : 0;
    if (d.freeFlight) {
      this.fuel = 1;
    } else {
      const burn = throttle * 0.022 * dt;
      this.fuel = Math.max(0, this.fuel - burn);
    }

    const hover = MASS * g;
    const thrust = throttle * d.maxThrustG * hover;
    const accel = thrust / MASS;
    const up = this.upVector();

    if (this.parked) {
      if (throttle > 0.08) {
        this.parked = false;
        this.justParked = false;
      } else {
        this.justParked = false;
        this.vel.set(0, 0, 0);
        this.pos.y = heightAt(this.pos.x, this.pos.z) + 0.55;
        this.contact = true;
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
        const flame = this.mesh.userData.flame;
        const flameCore = this.mesh.userData.flameCore;
        const flameLight = this.mesh.userData.flameLight;
        if (flame) flame.visible = false;
        if (flameCore) flameCore.visible = false;
        if (flameLight) flameLight.intensity = 0;
        return;
      }
    }

    this.vel.x += up.x * accel * dt;
    this.vel.y += up.y * accel * dt - g * dt;
    this.vel.z += up.z * accel * dt;
    this.pos.addScaledVector(this.vel, dt);

    const ground = heightAt(this.pos.x, this.pos.z);
    const agl = this.pos.y - ground;
    const probe = 1.55;
    this.contact = agl < probe + 0.6;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const vs = this.vel.y;
    const tilt = (Math.hypot(this.pitch, this.roll) * 180) / Math.PI;

    if (agl > escapeAlt) {
      this.crashed = true;
      this.alive = false;
      this.impactVs = Math.abs(Math.min(0, vs));
      this.impactHs = hs;
      this.failReason = "You've left the gravity well — Eagle is drifting into deep space.";
      this._syncFlame(throttle);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
      return;
    }

    if (agl < 0.55) {
      this.pos.y = ground + 0.55;
      this.impactVs = Math.abs(vs);
      this.impactHs = hs;
      const onPad = Math.hypot(this.pos.x - this.padX, this.pos.z - this.padZ) <= d.padRadius;
      const soft = this.impactVs <= d.maxLandVs && this.impactHs <= d.maxLandHs && tilt <= d.maxLandTilt;
      if (d.freeFlight) {
        if (soft) {
          this.parked = true;
          this.justParked = true;
          this.vel.set(0, 0, 0);
        } else {
          this.crashed = true;
          this.alive = false;
          this.vel.set(0, 0, 0);
          this.failReason = "Hard impact. In Free mode you can take soft landings — this wasn't one.";
        }
      } else if (soft && onPad) {
        this.landed = true;
        this.alive = false;
        this.vel.set(0, 0, 0);
      } else {
        this.crashed = true;
        this.alive = false;
        this.vel.set(0, 0, 0);
        if (!onPad) this.failReason = "You missed the clear patch and hit rough ground.";
        else if (this.impactVs > d.maxLandVs) this.failReason = "Descent rate was too high — Eagle's legs can't take that.";
        else if (this.impactHs > d.maxLandHs) this.failReason = "Still sliding sideways. Kill horizontal speed before touchdown.";
        else this.failReason = "Eagle was tilted too far. Keep the gold foil side mostly upright.";
      }
    }

    if (agl < -2) {
      this.crashed = true;
      this.alive = false;
      this.failReason = "Eagle hit the surface hard.";
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
    this._syncFlame(this.parked ? 0 : throttle);
  }

  _syncFlame(throttle) {
    const flame = this.mesh.userData.flame;
    const flameCore = this.mesh.userData.flameCore;
    const flameLight = this.mesh.userData.flameLight;
    const lit = throttle > 0.04;
    if (flame) {
      flame.visible = lit;
      flame.scale.set(0.7 + throttle, 0.5 + throttle * 1.6, 0.7 + throttle);
      flame.material.opacity = 0.28 + throttle * 0.45;
    }
    if (flameCore) {
      flameCore.visible = lit;
      flameCore.scale.set(0.8 + throttle * 0.4, 0.6 + throttle * 1.2, 0.8 + throttle * 0.4);
      flameCore.material.opacity = 0.55 + throttle * 0.35;
    }
    if (flameLight) flameLight.intensity = lit ? 0.8 + throttle * 2.4 : 0;
  }

  agl() {
    return this.pos.y - heightAt(this.pos.x, this.pos.z);
  }

  range() {
    return Math.hypot(this.pos.x - this.padX, this.pos.z - this.padZ);
  }

  hudRates() {
    return { vs: this.vel.y, hs: Math.hypot(this.vel.x, this.vel.z) };
  }
}
