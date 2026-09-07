import * as THREE from "three";
import { Input, DIFFICULTY } from "./input.js";
import { Audio } from "./audio.js";
import { PLANETS, PLANET_ORDER } from "./planets.js";
import {
  createStars,
  createMoon,
  createEarth,
  createEagle,
  createDust,
  createHorizon,
  applyWorldLayout,
  rebuildHoops,
  getPadWorldPos,
  getEscapeAlt,
  heightAt,
  Lander,
  mToFt,
  msToFps,
} from "./world.js";

const NOTES = {
  cadet: DIFFICULTY.cadet.note,
  pilot: DIFFICULTY.pilot.note,
  commander: DIFFICULTY.commander.note,
  free: DIFFICULTY.free.note,
  apollo: DIFFICULTY.apollo.note,
};

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.input = new Input();
    this.audio = new Audio();
    this.difficulty = "cadet";
    this.planetId = "moon";
    this.state = "menu";
    this.cameraMode = "chase";
    this.alarmPlayed = false;
    this.sixtyCalled = false;
    this.thirtyCalled = false;
    this.contactCalled = false;
    this.softLandChimed = false;
    this.apolloPdi = false;
    this.apolloLow = false;
    this.apolloPitch = false;
    this.calloutUntil = 0;
    this._rWas = false;
    this.camElev = 0;
    this.camOrbit = 0;
    this.hoops = [];
    this.ringsDone = false;
    this.escapeWarned = false;
    this.earth = null;

    this.canvas = $("scene");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000006);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.00115);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);

    const sun = new THREE.DirectionalLight(0xfff0d8, 2.05);
    sun.position.set(160, 240, 110);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 700;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.bias = -0.00025;
    this.scene.add(sun);
    this.sun = sun;
    this.scene.add(new THREE.HemisphereLight(0xb8c4d4, 0x3a342c, 0.42));
    const bounce = new THREE.DirectionalLight(0x6a7a90, 0.35);
    bounce.position.set(-90, 50, -50);
    this.scene.add(bounce);
    this.scene.add(new THREE.AmbientLight(0x4a5058, 0.18));

    this.scene.add(createHorizon());
    this.scene.add(createStars());
    this.earth = createEarth();
    this.scene.add(this.earth);
    const moon = createMoon();
    this.moon = moon.group;
    this.surface = moon.group.userData.surface;
    this.boulders = moon.boulders;
    this.scene.add(this.moon);

    this.eagleMesh = createEagle();
    this.scene.add(this.eagleMesh);
    this.dust = createDust();
    this.scene.add(this.dust);

    this.lander = new Lander(this.eagleMesh, DIFFICULTY.cadet, PLANETS.moon.gravity);

    this._buildPlanetButtons();
    this._bindUi();
    this._applyPlanet(this.planetId);
    window.addEventListener("resize", () => this._resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  get planet() {
    return PLANETS[this.planetId];
  }

  get isApollo() {
    return !!DIFFICULTY[this.difficulty]?.apollo;
  }

  _buildPlanetButtons() {
    const grid = $("planet-grid");
    grid.innerHTML = "";
    PLANET_ORDER.forEach((id) => {
      const p = PLANETS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "planet" + (id === this.planetId ? " active" : "");
      btn.dataset.planet = id;
      btn.textContent = p.label;
      btn.addEventListener("click", () => {
        if (this.isApollo && id !== "moon") return;
        document.querySelectorAll(".planet").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._applyPlanet(id);
      });
      grid.appendChild(btn);
    });
    this._syncPlanetLock();
  }

  _syncPlanetLock() {
    const apollo = this.isApollo;
    document.querySelectorAll(".planet").forEach((btn) => {
      const id = btn.dataset.planet;
      const locked = apollo && id !== "moon";
      btn.disabled = locked;
      btn.classList.toggle("locked", locked);
      if (apollo && id === "moon") {
        document.querySelectorAll(".planet").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }
    });
    if (apollo && this.planetId !== "moon") this._applyPlanet("moon");
  }

  _applyPlanet(id) {
    this.planetId = id;
    const p = PLANETS[id];
    $("planet-note").textContent = p.note;
    $("brief-kicker").textContent = p.site;
    this.boulders = applyWorldLayout(this.moon, p);
    this.hoops = [];
    if (this.dust) this.dust.material.color.setHex(p.dust);
    if (this.scene.fog) this.scene.fog.color.setHex(p.fog || 0x050508);
    if (this.earth) this.earth.visible = id === "moon" || id === "earth";
  }

  _bindUi() {
    document.querySelectorAll(".diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".diff").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.difficulty = btn.dataset.diff;
        $("diff-note").textContent = NOTES[this.difficulty];
        this._syncPlanetLock();
      });
    });
    $("btn-start").addEventListener("click", () => this.start());
    $("btn-invert").addEventListener("click", () => {
      this.input.invertThrottle = !this.input.invertThrottle;
      $("btn-invert").textContent = this.input.invertThrottle ? "Throttle inverted" : "Invert throttle";
    });
    $("btn-again").addEventListener("click", () => this.start());
    $("btn-menu").addEventListener("click", () => this.showMenu());
  }

  async start() {
    await this.audio.unlock();
    if (this.isApollo) this._applyPlanet("moon");
    this.lander.diff = DIFFICULTY[this.difficulty];
    this.lander.gravity = this.planet.gravity;
    this.lander.reset();
    this.alarmPlayed = false;
    this.sixtyCalled = false;
    this.thirtyCalled = false;
    this.contactCalled = false;
    this.softLandChimed = false;
    this.apolloPdi = false;
    this.apolloLow = false;
    this.apolloPitch = false;
    this.ringsDone = false;
    this.escapeWarned = false;
    this.cameraMode = "chase";
    this.camElev = 0;
    this.camOrbit = 0;
    this.state = "fly";

    this.hoops = this.lander.diff.freeFlight ? rebuildHoops(this.moon, this.planet, 5) : rebuildHoops(this.moon, this.planet, 0);

    if (!this.input.connected) {
      this.input.throttle = 1 / this.lander.diff.maxThrustG;
    }
    $("overlay").classList.add("hidden");
    $("debrief").classList.add("hidden");
    $("hud").classList.remove("hidden");
    $("mission-label").textContent = this.isApollo ? "APOLLO 11" : this.planet.label.toUpperCase();
    const ringsHud = $("rings-tape");
    if (ringsHud) ringsHud.classList.toggle("hidden", !this.lander.diff.freeFlight);
    this.audio.setMusic(true);

    if (this.isApollo) {
      this.say("HOUSTON — EAGLE, YOU'RE GO FOR POWERED DESCENT.", 4200);
    } else if (this.lander.diff.freeFlight) {
      this.say(`FREE FLIGHT · ${this.planet.label.toUpperCase()} · FLY THE RINGS · DON'T ESCAPE`);
    } else {
      this.say(`POWERED DESCENT · ${this.planet.label.toUpperCase()} · ${this.planet.gravity.toFixed(2)} m/s²`);
    }
  }

  showMenu() {
    this.state = "menu";
    this.audio.setMusic(false);
    this.audio.setEngine(0);
    $("debrief").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("overlay").classList.remove("hidden");
    $("btn-invert").textContent = this.input.invertThrottle ? "Throttle inverted" : "Invert throttle";
  }

  say(text, ms = 2800) {
    $("callout").textContent = text;
    this.calloutUntil = performance.now() + ms;
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.input.poll();
    $("pad-line").textContent = this.input.menuHint();
    $("stick-status").textContent = this.input.statusLine();
    const thrPct = Math.round(this.input.throttle * 100);
    const menuFill = $("menu-throttle-fill");
    const menuPct = $("menu-throttle-pct");
    if (menuFill) menuFill.style.width = thrPct + "%";
    if (menuPct) menuPct.textContent = thrPct + "%";

    if (this.state === "menu" && this.input.triggerEdge) this.start();
    if (this.state === "debrief" && this.input.triggerEdge) this.start();

    if (this.state === "fly") {
      if (this.input.thumbEdge) this.cameraMode = this.cameraMode === "chase" ? "window" : "chase";
      if (this.input.hatX || this.input.hatY) this.cameraMode = "chase";
      this.camElev = THREE.MathUtils.clamp(this.camElev - this.input.hatY * 0.85 * dt, 0, 1);
      this.camOrbit += this.input.hatX * 1.7 * dt;
      const rNow = this.input.keys.has("KeyR");
      if (rNow && !this._rWas) this.start();
      this._rWas = rNow;
      this.lander.step(dt, this.input);
      if (!this.lander.diff.freeFlight) this._boulders();
      if (this.lander.diff.freeFlight) this._hoops();
      this._events(now);
      this._hud(now);
      this.audio.setEngine(this.lander.fuel > 0 || this.lander.diff.freeFlight ? this.input.throttle : 0);
      this._dust();
      if (this.lander.landed) this._finish(true);
      if (this.lander.crashed) this._finish(false);
    } else {
      this.audio.setEngine(0);
    }

    this._camera();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }

  _boulders() {
    for (const b of this.boulders) {
      const dx = this.lander.pos.x - b.x;
      const dy = this.lander.pos.y - b.y;
      const dz = this.lander.pos.z - b.z;
      const hitR = (b.r || 2) + 1.6;
      if (Math.hypot(dx, dy, dz) < hitR) {
        this.lander.crashed = true;
        this.lander.alive = false;
        this.lander.impactVs = Math.abs(this.lander.vel.y);
        this.lander.impactHs = Math.hypot(this.lander.vel.x, this.lander.vel.z);
        const kind = b.kind || "rock";
        if (kind === "ice") {
          this.lander.failReason = "Ice spike. Find the clear shelf to the gold ring.";
        } else if (kind === "vent") {
          this.lander.failReason = "Volcanic vent — that heat will cook Eagle. Steer clear.";
        } else if (kind === "tower") {
          this.lander.failReason = "Survey tower. Stay in the clear lane to the pad.";
        } else {
          this.lander.failReason = "Hazard field. Find the clear patch around the gold ring.";
        }
      }
    }
  }

  _hoops() {
    if (!this.hoops.length) return;
    const pos = this.lander.pos;
    for (const h of this.hoops) {
      if (h.collected) continue;
      const d = pos.distanceTo(h.pos);
      if (d < h.r * 0.85) {
        const along = this.lander.vel.clone().normalize().dot(h.normal);
        if (along > 0.15 || this.lander.vel.length() < 1.5) {
          h.collected = true;
          h.mesh.material.emissiveIntensity = 0.15;
          h.mesh.material.opacity = 0.35;
          h.mesh.material.color.setHex(0x3a5a40);
          this.audio.hoop();
          const got = this.hoops.filter((x) => x.collected).length;
          this.say(`RING ${got} / ${this.hoops.length}`);
          if (got === this.hoops.length && !this.ringsDone) {
            this.ringsDone = true;
            this.audio.hoopComplete();
            this.say("RING COURSE COMPLETE — NICE FLYING.", 3600);
          }
        }
      }
    }
  }

  _events(now) {
    const free = this.lander.diff.freeFlight;
    const apollo = this.isApollo;
    const fuelFrac = this.lander.fuel / this.lander.fuelMax;
    const aglFt = mToFt(this.lander.agl());
    const agl = this.lander.agl();

    if (apollo && !this.apolloPdi && aglFt < 2800) {
      this.apolloPdi = true;
      this.say("EAGLE, HOUSTON — ALTITUDE LIGHTS LOOK GOOD. CONTINUE.", 3800);
    }
    if (apollo && !this.apolloPitch && aglFt < 900 && aglFt > 700) {
      this.apolloPitch = true;
      this.say("HOUSTON — EAGLE, YOU'RE LOOKING GREAT. WATCH YOUR RATES.", 3600);
    }
    if (apollo && !this.apolloLow && aglFt < 200 && aglFt > 120) {
      this.apolloLow = true;
      this.say("LOW GATE — PICK YOUR SPOT. CLEAR THE BOULDERS.", 3400);
    }

    if (!free && !this.alarmPlayed && aglFt < 520 && aglFt > 380) {
      this.alarmPlayed = true;
      $("alarm").classList.add("on");
      this.audio.alarm();
      this.say(
        apollo
          ? "1202 ALARM — CAPCOM: WE'RE GO ON THAT ALARM. SAME FOR US."
          : "1202 ALARM — CAPCOM: YOU'RE GO ON THAT ALARM.",
        4000
      );
      setTimeout(() => $("alarm").classList.remove("on"), 2600);
    }
    if (!free && !this.sixtyCalled && fuelFrac < 0.28) {
      this.sixtyCalled = true;
      this.say(apollo ? "SIXTY SECONDS. QUANTITY LIGHT." : "SIXTY SECONDS.");
      this.audio.beep(700, 0.15, 0.08);
    }
    if (!free && !this.thirtyCalled && fuelFrac < 0.14) {
      this.thirtyCalled = true;
      this.say("THIRTY SECONDS.");
      this.audio.beep(700, 0.15, 0.08);
    }

    if (free && !this.escapeWarned && agl > getEscapeAlt() * 0.72 && this.lander.alive) {
      this.escapeWarned = true;
      this.say("WARNING — APPROACHING ESCAPE. PULL BACK TOWARD THE SURFACE.", 2600);
    }
    if (free && agl < getEscapeAlt() * 0.55) this.escapeWarned = false;

    if (free) {
      if (this.lander.justParked && !this.softLandChimed) {
        this.softLandChimed = true;
        this.audio.softLand();
        this.say("SOFT LANDING — ADD THROTTLE TO LIFT OFF.");
      }
      if (!this.lander.parked) this.softLandChimed = false;
    } else if (this.lander.contact && !this.contactCalled) {
      this.contactCalled = true;
      this.audio.contact();
      this.say(apollo ? "CONTACT LIGHT — ENGINE STOP." : "CONTACT LIGHT. KILL THE ENGINE.");
    }

    if (now > this.calloutUntil && $("callout").textContent && this.state === "fly") {
      if (!this.lander.contact && !this.lander.parked) $("callout").textContent = "";
    }
  }

  _hud() {
    const l = this.lander;
    const free = l.diff.freeFlight;
    const agl = Math.max(0, l.agl());
    const { vs, hs } = l.hudRates();
    const fuelPct = free ? 100 : Math.round((l.fuel / l.fuelMax) * 100);

    $("alt-value").textContent = Math.round(mToFt(agl)).toString();
    $("vs-value").textContent = (msToFps(vs) >= 0 ? "+" : "") + msToFps(vs).toFixed(1);
    $("hs-value").textContent = msToFps(hs).toFixed(1);
    $("range-value").textContent = Math.round(mToFt(l.range())).toString();
    $("fuel-value").textContent = free ? "∞" : fuelPct + "%";
    $("fuel-fill").style.transform = `scaleX(${free ? 1 : Math.max(0, l.fuel / l.fuelMax)})`;

    const ringsVal = $("rings-value");
    if (ringsVal && free) {
      const got = this.hoops.filter((h) => h.collected).length;
      ringsVal.textContent = `${got}/${this.hoops.length || 5}`;
    }

    const vsNeedle = 50 + THREE.MathUtils.clamp(msToFps(vs) / 30, -1, 1) * 46;
    $("vs-needle").style.left = vsNeedle + "%";

    const vsTape = $("vs-tape");
    vsTape.className = "tape" + (vs < -3.5 ? " danger" : vs < -2.2 ? " warn" : "");
    const fuelTape = $("fuel-tape");
    fuelTape.className = "tape fuel" + (!free && fuelPct < 15 ? " danger" : !free && fuelPct < 30 ? " warn" : "");
    $("contact-light").classList.toggle("on", l.contact || l.parked);

    $("adi-ball").style.transform = `translateY(${l.pitch * 70}px) rotate(${-l.roll}rad)`;
    $("stick-dot").style.left = 50 + this.input.roll * 42 + "%";
    $("stick-dot").style.top = 50 + this.input.pitch * 42 + "%";
    $("throttle-fill").style.height = this.input.throttle * 100 + "%";
    $("stick-status").textContent =
      this.input.statusLine() +
      " · THR " +
      Math.round(this.input.throttle * 100) +
      "% · g " +
      this.planet.gravity.toFixed(2);

    const hint = $("live-hint");
    if (l.parked) hint.textContent = "Parked. Add throttle to lift off again.";
    else if (l.contact) {
      hint.textContent = free
        ? "CONTACT — keep it soft, or push throttle to climb."
        : "CONTACT LIGHT — pull the throttle slider back to idle, like Armstrong.";
    } else if (hs > 4) hint.textContent = "Tilt Eagle toward the gold ring to kill that sideways speed.";
    else if (vs < -4) {
      hint.textContent = `You're dropping fast. Add throttle — ${this.planet.label} gravity is ${this.planet.gravity.toFixed(2)} m/s².`;
    } else if (free) {
      hint.textContent = `Free · rings ${this.hoops.filter((h) => h.collected).length}/${this.hoops.length} · escape at ${Math.round(mToFt(getEscapeAlt()))} ft AGL`;
    } else if (this.isApollo) {
      hint.textContent = "Apollo mode — listen to Capcom · Hat looks down on the gold ring";
    } else {
      hint.textContent = "Hat forward = look down on the gold ring · Slider = engine · Stick tilts Eagle";
    }
  }

  _dust() {
    const l = this.lander;
    const show = l.agl() < 22 && this.input.throttle > 0.12 && l.alive && !l.parked;
    this.dust.visible = show;
    if (!show) return;
    const pos = this.dust.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (Math.random() - 0.5) * 0.8;
      arr[i + 1] += 0.08 + Math.random() * 0.12;
      arr[i + 2] += (Math.random() - 0.5) * 0.8;
      if (arr[i + 1] > l.pos.y + 4 || Math.hypot(arr[i] - l.pos.x, arr[i + 2] - l.pos.z) > 18) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 7;
        arr[i] = l.pos.x + Math.cos(a) * r;
        arr[i + 1] = heightAt(l.pos.x, l.pos.z) + 0.2;
        arr[i + 2] = l.pos.z + Math.sin(a) * r;
      }
    }
    pos.needsUpdate = true;
  }

  _camera() {
    const l = this.lander;
    if (this.cameraMode === "window") {
      const fwd = new THREE.Vector3(0, 0.15, 1).applyEuler(new THREE.Euler(l.pitch, l.yaw, l.roll, "YXZ"));
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(l.pos).add(new THREE.Vector3(0, 2.4, 0));
      this.camera.lookAt(l.pos.clone().add(fwd.multiplyScalar(20)));
      return;
    }

    const elev = 0.38 + this.camElev * 1.12;
    const dist = 16 + this.camElev * 36;
    const yaw = l.yaw + Math.PI + this.camOrbit;
    const desired = new THREE.Vector3(
      l.pos.x + Math.sin(yaw) * Math.cos(elev) * dist,
      l.pos.y + Math.sin(elev) * dist + 2,
      l.pos.z + Math.cos(yaw) * Math.cos(elev) * dist
    );
    const ring = getPadWorldPos();
    const look = l.pos.clone();
    look.y += 1.1;
    look.lerp(ring, THREE.MathUtils.clamp((this.camElev - 0.08) / 0.7, 0, 0.82));
    this.camera.up.set(0, 1, 0);
    this.camera.position.lerp(desired, 0.1);
    this.camera.lookAt(look);
  }

  _finish(success) {
    if (this.state === "debrief") return;
    this.state = "debrief";
    this.audio.setEngine(0);
    $("hud").classList.add("hidden");
    $("debrief").classList.remove("hidden");
    $("alarm").classList.remove("on");

    const l = this.lander;
    const p = this.planet;
    const fuelPct = Math.round((l.fuel / l.fuelMax) * 100);
    const ringsGot = this.hoops.filter((h) => h.collected).length;
    if (success) {
      this.audio.success();
      $("debrief-kicker").textContent = this.isApollo
        ? "JULY 20, 1969 · SEA OF TRANQUILITY"
        : `${p.label.toUpperCase()} · ${p.site}`;
      $("debrief-title").textContent = "THE EAGLE HAS LANDED";
      let rating = "Soft touchdown.";
      if (fuelPct <= 20) rating = "Armstrong-class. You landed with almost nothing left in the tanks.";
      else if (l.impactVs < 1.2 && l.impactHs < 0.6) rating = "Textbook. Aldrin would have liked those numbers.";
      $("debrief-quote").textContent = "“Houston, Tranquility Base here. The Eagle has landed.”";
      $("debrief-stats").innerHTML = `
        <li><span>RATING</span> ${rating}</li>
        <li><span>WORLD</span> ${p.label} · ${p.gravity.toFixed(2)} m/s²</li>
        <li><span>TOUCHDOWN</span> ${msToFps(l.impactVs).toFixed(1)} ft/s down, ${msToFps(l.impactHs).toFixed(1)} ft/s sideways</li>
        <li><span>FUEL LEFT</span> ${fuelPct}%</li>
        <li><span>SITE</span> ${Math.round(mToFt(l.range()))} ft from the planned marker</li>
      `;
    } else {
      this.audio.crash();
      $("debrief-kicker").textContent = "MISSION ABORT";
      $("debrief-title").textContent = "EAGLE IS DOWN";
      $("debrief-quote").textContent = l.failReason || "Hard landing.";
      const ringLine =
        l.diff.freeFlight && this.hoops.length
          ? `<li><span>RINGS</span> ${ringsGot}/${this.hoops.length}</li>`
          : "";
      $("debrief-stats").innerHTML = `
        <li><span>WHAT HAPPENED</span> ${l.failReason || "Impact."}</li>
        <li><span>WORLD</span> ${p.label} · ${p.gravity.toFixed(2)} m/s²</li>
        <li><span>RATES</span> ${msToFps(l.impactVs).toFixed(1)} ft/s down, ${msToFps(l.impactHs).toFixed(1)} ft/s sideways</li>
        <li><span>FUEL</span> ${l.diff.freeFlight ? "∞" : fuelPct + "%"}</li>
        ${ringLine}
        <li><span>TIP</span> Stay below escape altitude. Kill sideways speed, then bleed altitude.</li>
      `;
    }
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
