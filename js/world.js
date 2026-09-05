import * as THREE from "three";

const MOON_G = 1.62; // m/s² — about 1/6 of Earth. This is why landing feels "floaty."
const MASS = 7200; // kg, roughly LM at this point in the descent
const FT = 3.28084;

export function mToFt(m) {
  return m * FT;
}

export function msToFps(ms) {
  return ms * FT;
}

/** Same height function builds the mesh AND the collision ground. */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h =
    Math.sin(x * 0.018) * Math.cos(z * 0.016) * 5.5 +
    Math.sin(x * 0.05 + 1.7) * Math.cos(z * 0.04) * 2.2 +
    Math.sin(x * 0.11 + z * 0.09) * 0.7;

  h += crater(x, z, 70, -40, 18, 4.5);
  h += crater(x, z, -90, 30, 22, 5);
  h += crater(x, z, 40, 110, 14, 3.2);
  h += crater(x, z, -50, -95, 16, 3.8);
  h += crater(x, z, 160, 20, 28, 6);

  // Flatten a disc under the landing rings so the 360° marker isn't buried in the dirt.
  if (r < 30) {
    const f = 1 - smoothstep(22, 30, r);
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

export function createStars() {
  const count = 1800;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 420 + Math.random() * 800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xeff4ff, size: 1.4, sizeAttenuation: true })
  );
}

export function createMoon() {
  const group = new THREE.Group();
  const size = 520;
  const seg = 128;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x9a9690,
    roughness: 0.96,
    metalness: 0.02,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);

  // Full 360° landing markers. Torus tubes don't z-fight into a partial arc the way a flat ring did.
  const padY = heightAt(0, 0) + 0.22;
  [
    [7.2, 0.28, 0xd4b45a],
    [15.2, 0.22, 0x7cff6b],
    [22.4, 0.18, 0xd4b45a],
  ].forEach(([radius, tube, color]) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = padY;
    group.add(ring);
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
  disc.position.y = padY - 0.08;
  group.add(disc);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 28, 8),
    new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.22 })
  );
  beacon.position.y = padY + 14;
  group.add(beacon);

  const boulders = [];
  const spots = [
    [88, 42, 3.2],
    [96, 58, 4.1],
    [78, 70, 2.6],
    [110, 36, 3.6],
    [102, 80, 2.9],
    [70, 48, 2.2],
    [120, 55, 3.4],
    [84, 28, 2.4],
    [-40, 90, 3.0],
    [30, -70, 2.7],
  ];
  spots.forEach(([x, z, r]) => {
    const boulder = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: 0x6c6964, roughness: 1 })
    );
    boulder.position.set(x, heightAt(x, z) + r * 0.45, z);
    boulder.rotation.set(Math.random(), Math.random(), Math.random());
    boulder.castShadow = true;
    group.add(boulder);
    boulders.push({ x, z, r: r * 1.05, y: boulder.position.y });
  });

  return { group, boulders };
}

export function createEarth() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#1c3f8a";
  c.fillRect(0, 0, 256, 128);
  c.fillStyle = "#2f9e4f";
  c.beginPath();
  c.ellipse(70, 64, 38, 28, 0.4, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(190, 50, 50, 22, -0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 18; i++) {
    c.beginPath();
    c.ellipse(Math.random() * 256, Math.random() * 128, 18, 6, Math.random(), 0, Math.PI * 2);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(38, 32, 24),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  mesh.position.set(-180, 110, -260);
  return mesh;
}

export function createEagle() {
  const lm = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.55,
    roughness: 0.4,
  });
  const silver = new THREE.MeshStandardMaterial({
    color: 0xcfd5da,
    metalness: 0.6,
    roughness: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.3, roughness: 0.6 });
  const foil = new THREE.MeshStandardMaterial({ color: 0xeeece6, metalness: 0.2, roughness: 0.7 });

  const descent = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 1.7, 8), gold);
  descent.position.y = 1.15;
  descent.castShadow = true;
  lm.add(descent);

  const oct = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.18, 8), gold);
  oct.position.y = 2.05;
  lm.add(oct);

  const ascent = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.1, 2.4), silver);
  ascent.position.y = 3.2;
  ascent.castShadow = true;
  lm.add(ascent);

  const wrap = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.7, 2.55), foil);
  wrap.position.y = 2.55;
  lm.add(wrap);

  const windowMat = new THREE.MeshBasicMaterial({ color: 0x14283c });
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.08), windowMat);
  win.position.set(0, 3.45, 1.22);
  lm.add(win);

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.95, 1.1, 16), dark);
  bell.position.y = 0.15;
  lm.add(bell);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc56b, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  flame.position.y = -1.1;
  flame.rotation.x = Math.PI;
  flame.visible = false;
  lm.add(flame);

  const pads = [];
  const legSpread = 3.15;
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  corners.forEach(([sx, sz]) => {
    const leg = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), gold);
    strut.position.set(sx * 1.15, 0.2, sz * 1.15);
    strut.rotation.x = sz * 0.38;
    strut.rotation.z = -sx * 0.38;
    lm.add(strut);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), dark);
    pad.position.set(sx * legSpread, -0.55, sz * legSpread);
    lm.add(pad);
    pads.push(pad);

    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4), silver);
    probe.position.set(sx * legSpread, -1.3, sz * legSpread);
    lm.add(probe);
  });

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), silver);
  dish.position.set(-0.2, 4.45, -0.4);
  dish.rotation.x = 0.5;
  lm.add(dish);

  lm.userData.flame = flame;
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
  constructor(mesh, difficulty) {
    this.mesh = mesh;
    this.diff = difficulty;
    this.reset();
  }

  reset() {
    const d = this.diff;
    const x = d.startX;
    const z = d.startZ;
    this.fuel = d.fuel;
    this.fuelMax = d.fuel;
    this.alive = true;
    this.landed = false;
    this.crashed = false;
    this.failReason = "";
    this.contact = false;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = Math.atan2(-x, -z);
    this.pos = new THREE.Vector3(x, d.startAlt + heightAt(x, z), z);
    const range = Math.hypot(x, z) || 1;
    const sink = d.startVs ?? -1.6;
    this.vel = new THREE.Vector3((-x / range) * d.startHoriz, sink, (-z / range) * d.startHoriz);
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

    const throttle = this.fuel > 0 ? input.throttle : 0;
    // Cadet tank (~100% at 0.022) is about 90 seconds of hover. Hover is expensive on purpose —
    // that's why Armstrong did not linger over the boulder field.
    const burn = throttle * 0.022 * dt;
    this.fuel = Math.max(0, this.fuel - burn);

    const hover = MASS * MOON_G;
    const thrust = throttle * d.maxThrustG * hover;
    const accel = thrust / MASS;
    const up = this.upVector();

    this.vel.x += up.x * accel * dt;
    this.vel.y += up.y * accel * dt - MOON_G * dt;
    this.vel.z += up.z * accel * dt;

    this.pos.addScaledVector(this.vel, dt);

    const ground = heightAt(this.pos.x, this.pos.z);
    const agl = this.pos.y - ground;
    const probe = 1.55;
    this.contact = agl < probe + 0.6;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const vs = this.vel.y;
    const tilt = (Math.hypot(this.pitch, this.roll) * 180) / Math.PI;

    if (agl < 0.55) {
      this.pos.y = ground + 0.55;
      this.impactVs = Math.abs(vs);
      this.impactHs = hs;
      const onPad = Math.hypot(this.pos.x, this.pos.z) <= d.padRadius;
      const soft = this.impactVs <= d.maxLandVs && this.impactHs <= d.maxLandHs && tilt <= d.maxLandTilt;
      if (soft && onPad) {
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

    const flame = this.mesh.userData.flame;
    flame.visible = throttle > 0.04;
    flame.scale.set(0.7 + throttle, 0.5 + throttle * 1.6, 0.7 + throttle);
    flame.material.opacity = 0.35 + throttle * 0.5;
  }

  agl() {
    return this.pos.y - heightAt(this.pos.x, this.pos.z);
  }

  range() {
    return Math.hypot(this.pos.x, this.pos.z);
  }
}

export { MOON_G };
