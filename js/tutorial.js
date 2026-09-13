/**
 * Mini-tutorial for the Logitech Extreme 3D Pro.
 * The briefing diagram highlights whatever you click — or whatever you move.
 */

export const TOUR_BASIC = ["slider", "stick", "twist", "hat", "trigger", "thumb"];

export const TOUR_ASTRONAUT = [
  "slider",
  "stick",
  "twist",
  "hat",
  "trigger",
  "thumb",
  "cut",
  "hold",
  "rcs",
  "cam",
  "baseNav",
  "baseSys",
];

export const TOUR_COPY = {
  slider: {
    title: "Throttle slider",
    basic:
      "Left side of the base. This is the descent engine — the most important control. Idle is toward you; full is away. Watch the bar fill as you slide it.",
    astronaut:
      "Same slider, plus a hover detent: ease toward hover and it snaps. Wider on Jupiter. After ENGINE STOP, pulling idle clicks cutoff off.",
  },
  stick: {
    title: "Flight stick",
    basic:
      "Tilt Eagle. The engine points the way you lean — that is how Armstrong steered. There is no steering wheel. Small inputs.",
    astronaut:
      "Tilt to point the descent engine. Hold button 5 and the stick becomes RCS translate instead — slide sideways without changing attitude.",
  },
  twist: {
    title: "Twist handle",
    basic: "Rotate the grip. That yaws Eagle so the windows face the gold ring before you settle.",
    astronaut: "Yaw is still twist. Keep the nose pointed at the strobe, then the pad. Hold is for pitch and roll, not heading.",
  },
  hat: {
    title: "Coolie hat",
    basic:
      "Eight-way hat on top of the stick. Push it forward to look down on the gold ring. Left/right orbits. The view stays until you hat it back.",
    astronaut:
      "In flight the hat peeks — release and the view snaps back, and it will not kick you out of the window. On this briefing it is a D-pad: worlds left/right, modes up/down.",
  },
  trigger: {
    title: "Trigger",
    basic: "Index finger, front of the grip. Press to start the descent or fly again after a landing.",
    astronaut: "Short press starts or continues. Hold the trigger in flight to abort.",
  },
  thumb: {
    title: "Thumb button",
    basic: "The fat button under your thumb, left side of the stick. Chase camera or the LM window.",
    astronaut: "Same toggle: chase or window. Button 6 resets chase if the hat left you looking at the dirt.",
  },
  cut: {
    title: "Button 3 — CUT",
    basic: "",
    astronaut:
      "Upper-left on the stick head, around the hat. Engine stop — the CONTACT LIGHT click. Pull the slider to idle to release it.",
  },
  hold: {
    title: "Button 4 — HLD",
    basic: "",
    astronaut: "Upper-right on the stick head. AGC attitude hold: pitch and roll settle upright. Press again for PGNCS rate command.",
  },
  rcs: {
    title: "Button 5 — RCS",
    basic: "",
    astronaut: "Lower-left on the stick head. Hold it and the stick translates Eagle on RCS. The tank is small. Empty, and you tilt again.",
  },
  cam: {
    title: "Button 6 — CAM",
    basic: "",
    astronaut: "Lower-right on the stick head. One press: chase camera, hat peek cleared, orbit zero.",
  },
  baseNav: {
    title: "Base 7 / 8 / 9",
    basic: "",
    astronaut: "Front row on the base, right of the slider. 7 cycles world, 8 cycles mode, 9 aborts or flies again. You can brief without a mouse.",
  },
  baseSys: {
    title: "Base 10 / 11 / 12",
    basic: "",
    astronaut: "Second row on the base. 10 mutes, 11 inverts the throttle slider, 12 inverts pitch. Same as the buttons under Start.",
  },
};

const PART_TO_BTN = {
  trigger: 0,
  thumb: 1,
  cut: 2,
  hold: 3,
  rcs: 4,
  cam: 5,
  baseNav: [6, 7, 8],
  baseSys: [9, 10, 11],
};

export class StickTour {
  constructor() {
    this.astronaut = false;
    this.index = 0;
    this.part = TOUR_BASIC[0];
    this._lastAuto = 0;
    this._thrWas = 0;
    this._bound = false;
  }

  bind() {
    if (this._bound) return;
    const root = document.getElementById("stick-tour");
    if (!root) return;
    this._bound = true;
    root.querySelectorAll("[data-part]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        this.show(el.dataset.part);
      });
    });
    document.getElementById("tour-prev")?.addEventListener("click", () => this.step(-1));
    document.getElementById("tour-next")?.addEventListener("click", () => this.step(1));
    this.render();
  }

  order() {
    return this.astronaut ? TOUR_ASTRONAUT : TOUR_BASIC;
  }

  setAstronaut(on) {
    const next = !!on;
    if (next === this.astronaut) return;
    this.astronaut = next;
    const order = this.order();
    this.index = Math.max(0, order.indexOf(this.part));
    if (this.index < 0) this.index = 0;
    this.part = order[this.index];
    this.render();
  }

  step(dir) {
    const order = this.order();
    this.index = (this.index + dir + order.length) % order.length;
    this.part = order[this.index];
    this.render();
  }

  show(part) {
    const order = this.order();
    const i = order.indexOf(part);
    if (i < 0) return;
    this.index = i;
    this.part = part;
    this.render();
  }

  render() {
    const order = this.order();
    const copy = TOUR_COPY[this.part];
    const title = document.getElementById("tour-title");
    const body = document.getElementById("tour-body");
    const step = document.getElementById("tour-step");
    const deck = document.getElementById("tour-deck");
    const root = document.getElementById("stick-tour");
    if (title) title.textContent = copy?.title || "";
    if (body) body.textContent = (this.astronaut ? copy?.astronaut : copy?.basic) || copy?.astronaut || "";
    if (step) step.textContent = `${this.index + 1} / ${order.length}`;
    if (deck) deck.textContent = this.astronaut ? "ASTRONAUT DECK" : "STANDARD DECK";
    if (root) root.classList.toggle("astronaut", this.astronaut);
    document.querySelectorAll("#stick-diagram [data-part]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.part === this.part);
    });
    document.querySelectorAll(".tour-callout").forEach((el) => {
      el.classList.toggle("on", el.dataset.part === this.part);
    });
  }

  syncLive(input, menuOpen) {
    if (!input || !menuOpen) return;
    const now = performance.now();
    const knob = document.getElementById("diag-slider-knob");
    if (knob) {
      const y = 318 - input.throttle * 62;
      knob.setAttribute("cy", y.toFixed(1));
    }
    const stick = document.getElementById("diag-stick");
    if (stick) {
      const tilt = input.roll * 10 - input.pitch * 4;
      stick.setAttribute("transform", `rotate(${tilt.toFixed(2)} 168 248)`);
    }
    const grip = document.getElementById("diag-twist");
    if (grip) grip.setAttribute("transform", `rotate(${(input.yaw * 18).toFixed(2)} 168 188)`);

    document.querySelectorAll("#stick-diagram [data-part]").forEach((el) => {
      el.classList.toggle("live", this._partLive(el.dataset.part, input));
    });

    if (now - this._lastAuto < 380) return;
    const auto = this._autoPart(input);
    if (auto && auto !== this.part) {
      this._lastAuto = now;
      this.show(auto);
    }
    this._thrWas = input.throttle;
  }

  _partLive(part, input) {
    if (part === "stick") return Math.hypot(input.roll, input.pitch) > 0.12;
    if (part === "twist") return Math.abs(input.yaw) > 0.12;
    if (part === "hat") return input.hatHeld;
    if (part === "slider") return input.throttle > 0.04;
    if (part === "trigger") return input.triggerPressed || input.btn[0];
    if (part === "thumb") return input.thumbPressed || input.btn[1];
    const map = PART_TO_BTN[part];
    if (typeof map === "number") return !!input.btn[map];
    if (Array.isArray(map)) return map.some((i) => input.btn[i]);
    return false;
  }

  _autoPart(input) {
    if (input.triggerEdge || input.btnEdge[0]) return "trigger";
    if (input.thumbEdge || input.btnEdge[1]) return "thumb";
    if (this.astronaut && input.btnEdge[2]) return "cut";
    if (this.astronaut && input.btnEdge[3]) return "hold";
    if (this.astronaut && (input.btnEdge[4] || input.translateMode)) return "rcs";
    if (this.astronaut && input.btnEdge[5]) return "cam";
    if (this.astronaut && (input.btnEdge[6] || input.btnEdge[7] || input.btnEdge[8])) return "baseNav";
    if (this.astronaut && (input.btnEdge[9] || input.btnEdge[10] || input.btnEdge[11])) return "baseSys";
    if (input.hatHeld && (input.hatNavX || input.hatNavY || Math.hypot(input.hatX, input.hatY) > 0.6)) return "hat";
    if (Math.abs(input.yaw) > 0.45) return "twist";
    if (Math.hypot(input.roll, input.pitch) > 0.55) return "stick";
    if (Math.abs(input.throttle - this._thrWas) > 0.08) return "slider";
    return null;
  }
}