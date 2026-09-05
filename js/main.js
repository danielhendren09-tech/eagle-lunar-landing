import * as THREE from "three";
import { Input, DIFFICULTY } from "./input.js";
import { Audio } from "./audio.js";
import {
  createStars,
  createMoon,
  createEarth,
  createEagle,
  createDust,
  Lander,
  heightAt,
  mToFt,
  msToFps,
} from "./world.js";

const NOTES = {
  cadet: DIFFICULTY.cadet.note,
  pilot: DIFFICULTY.pilot.note,
  commander: DIFFICULTY.commander.note,
};

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.input = new Input();
    this.audio = new Audio();
    this.difficulty = "cadet";
    this.state = "menu";
    this.cameraMode = "chase";
    this.alarmPlayed = false;
    this.sixtyCalled = false;
    this.thirtyCalled = false;
    this.contactCalled = false;
    this.calloutUntil = 0;
    this._rWas = false;
    this.camElev = 0;
    this.camOrbit = 0;

    this.canvas = $("scene");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000005);
    this.scene.fog = new THREE.FogExp2(0x000005, 0.0016);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
    sun.position.set(180, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8a929c, 0.52));
    const bounce = new THREE.DirectionalLight(0x8899aa, 0.28);
    bounce.position.set(-80, 40, -40);
    this.scene.add(bounce);

    this.scene.add(createStars());
    this.scene.add(createEarth());
    const moon = createMoon();
    this.moon = moon.group;
    this.boulders = moon.boulders;
    this.scene.add(this.moon);

    this.eagleMesh = createEagle();
    this.scene.add(this.eagleMesh);
    this.dust = createDust();
    this.scene.add(this.dust);

    this.lander = new Lander(this.eagleMesh, DIFFICULTY.cadet);

    this._bindUi();
    window.addEventListener("resize", () => this._resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  _bindUi() {
    document.querySelectorAll(".diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".diff").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.difficulty = btn.dataset.diff;
        $("diff-note").textContent = NOTES[this.difficulty];
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
    this.lander.diff = DIFFICULTY[this.difficulty];
    this.lander.reset();
    this.alarmPlayed = false;
    this.sixtyCalled = false;
    this.thirtyCalled = false;
    this.contactCalled = false;
    this.cameraMode = "chase";
    this.camElev = 0;
    this.camOrbit = 0;
    this.state = "fly";
    // Keyboard has no analog slider, so start near hover. Stick slider overrides next frame.
    if (!this.input.connected) {
      this.input.throttle = 1 / this.lander.diff.maxThrustG;
    }
    $("overlay").classList.add("hidden");
    $("debrief").classList.add("hidden");
    $("hud").classList.remove("hidden");
    this.say("POWERED DESCENT. YOU HAVE THE STICK.");
  }

  showMenu() {
    this.state = "menu";
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
      this._boulders();
      this._events(now);
      this._hud(now);
      this.audio.setEngine(this.lander.fuel > 0 ? this.input.throttle : 0);
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
      const dz = this.lander.pos.z - b.z;
      const dy = this.lander.pos.y - b.y;
      if (Math.hypot(dx, dy, dz) < b.r + 1.6) {
        this.lander.crashed = true;
        this.lander.alive = false;
        this.lander.impactVs = Math.abs(this.lander.vel.y);
        this.lander.impactHs = Math.hypot(this.lander.vel.x, this.lander.vel.z);
        this.lander.failReason = "That's the boulder field Armstrong had to fly over. Find the clear patch.";
      }
    }
  }

  _events(now) {
    const fuelFrac = this.lander.fuel / this.lander.fuelMax;
    const aglFt = mToFt(this.lander.agl());

    if (!this.alarmPlayed && aglFt < 520 && aglFt > 380) {
      this.alarmPlayed = true;
      $("alarm").classList.add("on");
      this.audio.alarm();
      this.say("1202 ALARM — CAPCOM: YOU'RE GO ON THAT ALARM.");
      setTimeout(() => $("alarm").classList.remove("on"), 2600);
    }
    if (!this.sixtyCalled && fuelFrac < 0.28) {
      this.sixtyCalled = true;
      this.say("SIXTY SECONDS.");
      this.audio.beep(700, 0.15, 0.08);
    }
    if (!this.thirtyCalled && fuelFrac < 0.14) {
      this.thirtyCalled = true;
      this.say("THIRTY SECONDS.");
      this.audio.beep(700, 0.15, 0.08);
    }
    if (this.lander.contact && !this.contactCalled) {
      this.contactCalled = true;
      this.audio.contact();
      this.say("CONTACT LIGHT. KILL THE ENGINE.");
    }
    if (now > this.calloutUntil && $("callout").textContent && this.state === "fly") {
      if (!this.lander.contact) $("callout").textContent = "";
    }
  }

  _hud() {
    const l = this.lander;
    const agl = Math.max(0, l.agl());
    const vs = l.vel.y;
    const hs = Math.hypot(l.vel.x, l.vel.z);
    const fuelPct = Math.round((l.fuel / l.fuelMax) * 100);

    $("alt-value").textContent = Math.round(mToFt(agl)).toString();
    $("vs-value").textContent = (msToFps(vs) >= 0 ? "+" : "") + msToFps(vs).toFixed(1);
    $("hs-value").textContent = msToFps(hs).toFixed(1);
    $("range-value").textContent = Math.round(mToFt(l.range())).toString();
    $("fuel-value").textContent = fuelPct + "%";
    $("fuel-fill").style.transform = `scaleX(${Math.max(0, l.fuel / l.fuelMax)})`;

    const vsNeedle = 50 + THREE.MathUtils.clamp(msToFps(vs) / 30, -1, 1) * 46;
    $("vs-needle").style.left = vsNeedle + "%";

    const vsTape = $("vs-tape");
    vsTape.className = "tape" + (vs < -3.5 ? " danger" : vs < -2.2 ? " warn" : "");
    const fuelTape = $("fuel-tape");
    fuelTape.className = "tape fuel" + (fuelPct < 15 ? " danger" : fuelPct < 30 ? " warn" : "");
    $("contact-light").classList.toggle("on", l.contact);

    $("adi-ball").style.transform = `translateY(${l.pitch * 70}px) rotate(${-l.roll}rad)`;
    $("stick-dot").style.left = 50 + this.input.roll * 42 + "%";
    $("stick-dot").style.top = 50 + this.input.pitch * 42 + "%";
    $("throttle-fill").style.height = this.input.throttle * 100 + "%";
    $("stick-status").textContent =
      this.input.statusLine() + " · THR " + Math.round(this.input.throttle * 100) + "%";

    const hint = $("live-hint");
    if (l.contact) hint.textContent = "CONTACT LIGHT — pull the throttle slider back to idle, like Armstrong.";
    else if (hs > 4) hint.textContent = "Tilt Eagle toward the gold ring to kill that sideways speed.";
    else if (vs < -4) hint.textContent = "You're dropping fast. Add throttle — lunar gravity is still pulling.";
    else hint.textContent = "Hat forward = look down on the gold ring · Slider = engine · Stick tilts Eagle";
  }

  _dust() {
    const l = this.lander;
    const show = l.agl() < 22 && this.input.throttle > 0.12 && l.alive;
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
      this.camera.position.copy(l.pos).add(new THREE.Vector3(0, 2.4, 0));
      this.camera.lookAt(l.pos.clone().add(fwd.multiplyScalar(20)));
      return;
    }

    // Hat forward raises the camera toward overhead and pulls the look-at
    // toward the gold ring so you can see the landing site from above.
    const elev = 0.38 + this.camElev * 1.12;
    const dist = 16 + this.camElev * 36;
    const yaw = l.yaw + Math.PI + this.camOrbit;
    const desired = new THREE.Vector3(
      l.pos.x + Math.sin(yaw) * Math.cos(elev) * dist,
      l.pos.y + Math.sin(elev) * dist + 2,
      l.pos.z + Math.cos(yaw) * Math.cos(elev) * dist
    );
    const ring = new THREE.Vector3(0, heightAt(0, 0) + 0.4, 0);
    const look = l.pos.clone();
    look.y += 1.1;
    look.lerp(ring, THREE.MathUtils.clamp((this.camElev - 0.08) / 0.7, 0, 0.82));
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
    const fuelPct = Math.round((l.fuel / l.fuelMax) * 100);
    if (success) {
      this.audio.success();
      $("debrief-kicker").textContent = "20 JULY 1969 · TRANQUILITY BASE";
      $("debrief-title").textContent = "THE EAGLE HAS LANDED";
      let rating = "Soft touchdown.";
      if (fuelPct <= 20) rating = "Armstrong-class. You landed with almost nothing left in the tanks.";
      else if (l.impactVs < 1.2 && l.impactHs < 0.6) rating = "Textbook. Aldrin would have liked those numbers.";
      $("debrief-quote").textContent = "“Houston, Tranquility Base here. The Eagle has landed.”";
      $("debrief-stats").innerHTML = `
        <li><span>RATING</span> ${rating}</li>
        <li><span>TOUCHDOWN</span> ${msToFps(l.impactVs).toFixed(1)} ft/s down, ${msToFps(l.impactHs).toFixed(1)} ft/s sideways</li>
        <li><span>FUEL LEFT</span> ${fuelPct}% — Armstrong had about 20 seconds of hover time remaining</li>
        <li><span>SITE</span> ${Math.round(mToFt(l.range()))} ft from the planned marker</li>
      `;
    } else {
      this.audio.crash();
      $("debrief-kicker").textContent = "MISSION ABORT";
      $("debrief-title").textContent = "EAGLE IS DOWN";
      $("debrief-quote").textContent = l.failReason || "Hard landing.";
      $("debrief-stats").innerHTML = `
        <li><span>WHAT HAPPENED</span> ${l.failReason || "Impact."}</li>
        <li><span>RATES</span> ${msToFps(l.impactVs).toFixed(1)} ft/s down, ${msToFps(l.impactHs).toFixed(1)} ft/s sideways</li>
        <li><span>FUEL</span> ${fuelPct}%</li>
        <li><span>TIP</span> Hover is expensive. Kill sideways speed first, then bleed altitude, then cut the engine on CONTACT LIGHT.</li>
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
