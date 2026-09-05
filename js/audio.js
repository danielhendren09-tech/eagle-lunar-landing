/**
 * Tiny Web Audio synth — no sound files to download.
 * Engine rumble is filtered noise. Alarms are square-wave beeps,
 * the same idea as the real Apollo caution tones (just much simpler).
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.unlocked = false;
    this.muted = false;
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
    this.unlocked = true;
  }

  setEngine(throttle) {
    if (!this.engineGain || this.muted) return;
    const t = this.ctx.currentTime;
    const level = throttle > 0.02 ? 0.04 + throttle * 0.12 : 0;
    this.engineGain.gain.setTargetAtTime(level, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(80 + throttle * 220, t, 0.1);
  }

  beep(freq, dur = 0.12, gain = 0.08) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  alarm() {
    this.beep(880, 0.18, 0.1);
    setTimeout(() => this.beep(660, 0.18, 0.1), 200);
    setTimeout(() => this.beep(880, 0.18, 0.1), 400);
  }

  contact() {
    this.beep(1400, 0.25, 0.09);
  }

  success() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.07), i * 140));
  }

  crash() {
    this.beep(90, 0.6, 0.14);
  }
}
