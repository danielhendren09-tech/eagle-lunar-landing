/**
 * Tiny Web Audio synth — no sound files to download.
 * Engine rumble is filtered noise. Alarms are square-wave beeps.
 * Background music is a slow space pad (layered sines + gentle LFO).
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.unlocked = false;
    this.muted = false;
    this.musicOn = true;
  }

  async unlock() {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 90;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    src.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    src.start();

    this._startMusic();
    this.unlocked = true;
  }

  _startMusic() {
    if (!this.ctx || this.musicGain) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.ctx.destination);

    // Slow ambient pad: root + fifth + high airy partials, gently detuned.
    const voices = [
      { f: 55, type: "sine", g: 0.045 },
      { f: 82.5, type: "sine", g: 0.032 },
      { f: 110, type: "triangle", g: 0.018 },
      { f: 165, type: "sine", g: 0.012 },
      { f: 220.5, type: "sine", g: 0.008 },
    ];
    const t0 = this.ctx.currentTime;
    voices.forEach((v, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600 + i * 120;
      osc.type = v.type;
      osc.frequency.value = v.f;
      gain.gain.value = v.g;

      // Slow amplitude breathe
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.04 + i * 0.011;
      lfoGain.gain.value = v.g * 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t0);
      lfo.start(t0);
      this.musicNodes.push(osc, lfo, gain, filter);
    });

    // Sparse soft sparkle notes
    this._sparkleTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const notes = [330, 392, 440, 494, 523, 587];
      const f = notes[Math.floor(Math.random() * notes.length)];
      this._tone(f, 1.8, 0.018, "sine");
    }, 4200);

    this.musicGain.gain.setTargetAtTime(0.55, t0, 2.5);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.musicGain || !this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on && !this.muted ? 0.55 : 0, this.ctx.currentTime, 0.4);
  }

  setEngine(throttle) {
    if (!this.engineGain || this.muted) return;
    const t = this.ctx.currentTime;
    const level = throttle > 0.02 ? 0.04 + throttle * 0.12 : 0;
    this.engineGain.gain.setTargetAtTime(level, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(80 + throttle * 220, t, 0.1);
  }

  _tone(freq, dur, gain, type = "sine") {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  beep(freq, dur = 0.12, gain = 0.08) {
    this._tone(freq, dur, gain, "square");
  }

  alarm() {
    this.beep(880, 0.18, 0.1);
    setTimeout(() => this.beep(660, 0.18, 0.1), 200);
    setTimeout(() => this.beep(880, 0.18, 0.1), 400);
  }

  /** Probe-light ping used in mission modes. */
  contact() {
    this.beep(1400, 0.25, 0.09);
  }

  /** One soft free-mode touchdown chime — then silence. */
  softLand() {
    if (!this.ctx || this.muted) return;
    this._tone(523.25, 0.35, 0.06, "sine");
    setTimeout(() => this._tone(659.25, 0.45, 0.05, "sine"), 120);
    setTimeout(() => this._tone(783.99, 0.7, 0.035, "sine"), 260);
  }

  hoop() {
    if (!this.ctx || this.muted) return;
    this._tone(880, 0.12, 0.05, "sine");
    setTimeout(() => this._tone(1175, 0.22, 0.04, "sine"), 80);
  }

  hoopComplete() {
    [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => this._tone(f, 0.28, 0.045, "sine"), i * 110));
  }

  success() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.07), i * 140));
  }

  crash() {
    this.beep(90, 0.6, 0.14);
  }
}
