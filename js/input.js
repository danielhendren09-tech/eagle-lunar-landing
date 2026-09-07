/**
 * Reads the Logitech Extreme 3D Pro through the Gamepad API.
 *
 * Chrome on macOS does NOT pack axes 0..3 as X/Y/twist/slider.
 * It indexes by HID usage, so a typical report looks like:
 *   [0]=X  [1]=Y  [2..4]=empty  [5]=Rz twist  [6]=Slider
 * The old code read axes[3], which is an empty slot stuck at 0 —
 * that's why the throttle graph never moved.
 *
 * Fix: watch every axis, treat 0/1 as the stick, then pick the extra
 * axis with the most travel as the slider (and the spring-centered
 * leftover as twist).
 */

const DEADZONE = 0.08;

export const DIFFICULTY = {
  cadet: {
    label: "Cadet",
    note: "Start almost over the gold ring. Extra fuel, stick points the ship. Learn the throttle first.",
    fuel: 1,
    maxThrustG: 2.35,
    startAlt: 52,
    startHoriz: 0.35,
    startVs: -1.6,
    startX: 8,
    startZ: 6,
    padRadius: 24,
    directAttitude: true,
    maxLandVs: 3.2,
    maxLandHs: 2.2,
    maxLandTilt: 16,
    freeFlight: false,
  },
  pilot: {
    label: "Pilot",
    note: "Lower and offset, sliding toward the gold ring. Kill that sideways speed before you get there.",
    fuel: 0.7,
    maxThrustG: 2.2,
    startAlt: 62,
    startHoriz: 7.5,
    startVs: -1.1,
    startX: 68,
    startZ: 22,
    padRadius: 16,
    directAttitude: false,
    maxLandVs: 2.6,
    maxLandHs: 1.7,
    maxLandTilt: 12,
    freeFlight: false,
  },
  commander: {
    label: "Commander",
    note: "Fast sideways close-in over the boulder field. Translate, then brake, then settle. Fuel is tight.",
    fuel: 0.48,
    maxThrustG: 2.05,
    startAlt: 70,
    startHoriz: 10.5,
    startVs: -1.25,
    startX: 98,
    startZ: 32,
    padRadius: 12,
    directAttitude: false,
    maxLandVs: 2.1,
    maxLandHs: 1.3,
    maxLandTilt: 10,
    freeFlight: false,
  },
  free: {
    label: "Free",
    note: "Unlimited fuel. Soft land anywhere, fly the glow rings, don't escape the gravity well.",
    fuel: 1,
    maxThrustG: 2.5,
    startAlt: 90,
    startHoriz: 2,
    startVs: -0.8,
    startX: 40,
    startZ: 28,
    padRadius: 9999,
    directAttitude: true,
    maxLandVs: 4.5,
    maxLandHs: 3.5,
    maxLandTilt: 25,
    freeFlight: true,
    apollo: false,
  },
  apollo: {
    label: "Apollo",
    note: "Moon only. Historical Capcom calls, 1202 alarm, tight fuel — recreate July 20, 1969.",
    fuel: 0.52,
    maxThrustG: 2.05,
    startAlt: 72,
    startHoriz: 10.2,
    startVs: -1.2,
    startX: 95,
    startZ: 30,
    padRadius: 14,
    directAttitude: false,
    maxLandVs: 2.15,
    maxLandHs: 1.35,
    maxLandTilt: 10,
    freeFlight: false,
    apollo: true,
  },
};

function applyDeadzone(v) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

function axisVal(ax, i) {
  const v = ax[i];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export class Input {
  constructor() {
    // Extreme 3D Pro slider is physically backwards vs HID (idle reports high).
    // Default mapping already inverts; the button is only if a stick is the other way.
    this.invertThrottle = false;
    this.invertPitch = false;
    this.padIndex = null;
    this.padName = "";
    this.connected = false;
    this.triggerPressed = false;
    this.thumbPressed = false;
    this._triggerWas = false;
    this._thumbWas = false;
    this.triggerEdge = false;
    this.thumbEdge = false;

    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.throttle = 0;
    this.hatX = 0;
    this.hatY = 0;

    this.throttleAxis = null;
    this.yawAxis = null;
    this.axisMin = [];
    this.axisMax = [];
    this.axesLive = [];
    this.throttleSource = "none";

    this.keys = new Set();

    window.addEventListener("gamepadconnected", (e) => {
      this.padIndex = e.gamepad.index;
      this.padName = e.gamepad.id || "Joystick";
      this.connected = true;
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.connected = false;
      this.padName = "";
      this.padIndex = null;
      this.throttleAxis = null;
      this.yawAxis = null;
    });

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Digit1") this.throttle = 0;
      if (e.code === "Digit2") this.throttle = 0.5;
      if (e.code === "Digit3") this.throttle = 1;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  poll() {
    this.triggerEdge = false;
    this.thumbEdge = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = this.padIndex != null ? pads[this.padIndex] : null;
    if (!pad) {
      pad = [...pads].find((p) => p);
      if (pad) {
        this.padIndex = pad.index;
        this.padName = pad.id || "Joystick";
      }
    }
    this.connected = Boolean(pad);
    if (pad) this.padName = pad.id || this.padName;

    let roll = 0;
    let pitch = 0;
    let yaw = 0;
    let throttle = this.throttle;
    let trigger = false;
    let thumb = false;

    if (pad) {
      const ax = pad.axes || [];
      this.axesLive = Array.from(ax, (v) => (typeof v === "number" ? v : 0));
      this._trackAxes(this.axesLive);
      this._pickAxes(this.axesLive);

      roll = applyDeadzone(axisVal(ax, 0));
      pitch = -applyDeadzone(axisVal(ax, 1));

      if (this.yawAxis != null) {
        yaw = -applyDeadzone(axisVal(ax, this.yawAxis));
      }

      if (this.throttleAxis != null) {
        throttle = this._mapSlider(axisVal(ax, this.throttleAxis), this.throttleAxis);
        this.throttleSource = "axis " + this.throttleAxis;
      }

      trigger = Boolean(pad.buttons[0]?.pressed);
      thumb = Boolean(pad.buttons[1]?.pressed);
      const hat = this._readHat(pad);
      this.hatX = hat.x;
      this.hatY = hat.y;
    } else {
      this.axesLive = [];
      this.throttleSource = "keyboard";
      this.hatX = 0;
      this.hatY = 0;
    }

    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) roll -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) roll += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) pitch -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) pitch += 1;
    if (this.keys.has("KeyQ")) yaw -= 1;
    if (this.keys.has("KeyE")) yaw += 1;
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) {
      throttle = Math.min(1, throttle + 0.02);
    }
    if (this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("KeyZ")) {
      throttle = Math.max(0, throttle - 0.02);
    }
    if (this.keys.has("Space")) trigger = true;
    if (this.keys.has("KeyC")) thumb = true;
    if (this.keys.has("KeyI")) this.hatY -= 1;
    if (this.keys.has("KeyK")) this.hatY += 1;
    if (this.keys.has("KeyJ")) this.hatX -= 1;
    if (this.keys.has("KeyL")) this.hatX += 1;
    this.hatX = Math.max(-1, Math.min(1, this.hatX));
    this.hatY = Math.max(-1, Math.min(1, this.hatY));

    this.roll = Math.max(-1, Math.min(1, roll));
    this.pitch = Math.max(-1, Math.min(1, pitch));
    this.yaw = Math.max(-1, Math.min(1, yaw));
    this.throttle = Math.min(1, Math.max(0, throttle));

    this.triggerPressed = trigger;
    this.thumbPressed = thumb;
    this.triggerEdge = trigger && !this._triggerWas;
    this.thumbEdge = thumb && !this._thumbWas;
    this._triggerWas = trigger;
    this._thumbWas = thumb;
  }

  _trackAxes(ax) {
    for (let i = 0; i < ax.length; i++) {
      const v = ax[i];
      if (this.axisMin[i] === undefined) {
        this.axisMin[i] = v;
        this.axisMax[i] = v;
      } else {
        this.axisMin[i] = Math.min(this.axisMin[i], v);
        this.axisMax[i] = Math.max(this.axisMax[i], v);
      }
    }
  }

  _pickAxes(ax) {
    // Lock the slider once and never steal it. After a Cadet flight, twist/hat
    // have more "travel" than the slider, and the old picker would rebind
    // throttle to twist — briefing bar looks dead, second flight ignores the slider.
    if (ax.length > 6) {
      this.throttleAxis = 6;
      this.yawAxis = 5;
      return;
    }
    if (ax.length === 4) {
      this.throttleAxis = 3;
      this.yawAxis = 2;
      return;
    }
    if (this.throttleAxis != null) return;

    const extras = [];
    for (let i = 2; i < ax.length; i++) {
      const travel = (this.axisMax[i] ?? ax[i]) - (this.axisMin[i] ?? ax[i]);
      extras.push({ i, travel, abs: Math.abs(ax[i]) });
    }
    extras.sort((a, b) => b.travel - a.travel || b.abs - a.abs);
    const moved = extras.filter((e) => e.travel > 0.18);
    if (moved[0]) this.throttleAxis = moved[0].i;
    else {
      const parked = extras.filter((e) => e.abs > 0.4).sort((a, b) => b.abs - a.abs)[0];
      if (parked) this.throttleAxis = parked.i;
    }
    this.yawAxis = extras.find((e) => e.i !== this.throttleAxis)?.i ?? null;
  }

  /**
   * Coolie hat / POV on top of the Extreme 3D Pro.
   * Chrome may expose it as d-pad buttons 12–15, or as HID Hat (usage 0x39 → axes[9]).
   * Neutral hat is usually clipped to +1, so we only treat axis 9 (and similar
   * rest-at-+1 axes) as a POV — never the empty 0-slots.
   */
  _readHat(pad) {
    let x = 0;
    let y = 0;
    const b = pad.buttons || [];
    if (b[12]?.pressed) y -= 1;
    if (b[13]?.pressed) y += 1;
    if (b[14]?.pressed) x -= 1;
    if (b[15]?.pressed) x += 1;

    const ax = pad.axes || [];
    const skip = new Set([0, 1, this.throttleAxis, this.yawAxis]);
    const candidates = [];
    if (ax.length > 9) candidates.push(9);
    for (let i = 2; i < ax.length; i++) {
      if (skip.has(i) || i === 9) continue;
      const restMax = this.axisMax[i];
      const restMin = this.axisMin[i];
      const restHigh = restMax > 0.9 && restMin > 0.5;
      if (restHigh) candidates.push(i);
    }
    const dirs = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    for (const i of candidates) {
      const v = axisVal(ax, i);
      if (v > 0.92) continue;
      const sector = Math.max(0, Math.min(7, Math.round(((v + 1) / 2) * 7)));
      x += dirs[sector][0];
      y += dirs[sector][1];
    }
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }

  _mapSlider(raw, index) {
    let t = raw;
    const min = this.axisMin[index];
    const max = this.axisMax[index];
    const span = max - min;
    if (span > 0.12) {
      t = (raw - min) / span;
    } else {
      t = raw >= 0 && raw <= 1 && min >= -0.05 ? raw : (raw + 1) / 2;
    }
    t = Math.min(1, Math.max(0, t));
    // Default is inverted: idle (HID high) = engine off. Invert button undoes this.
    return this.invertThrottle ? t : 1 - t;
  }

  statusLine() {
    if (this.connected) {
      const short = this.padName.replace(/\s*\(.*\)/, "");
      const src = this.throttleAxis != null ? ` · SLIDER AXIS ${this.throttleAxis}` : " · MOVE THE THROTTLE SLIDER";
      return short.toUpperCase() + src;
    }
    return "NO STICK — KEYBOARD ACTIVE";
  }

  menuHint() {
    if (!this.connected) return "No joystick yet. Plug in a stick, or fly with the keyboard.";
    const pct = Math.round(this.throttle * 100);
    const dump = this.axesLive.map((v, i) => `${i}:${v.toFixed(2)}`).join("  ");
    if (this.throttleAxis == null) {
      return "Stick is live. Slide the throttle on the base — the bar should fill.  " + dump;
    }
    return `Throttle ${pct}% (axis ${this.throttleAxis}). Slide idle→full once.  ${dump}`;
  }
}
