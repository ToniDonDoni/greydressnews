// Every sound is synthesized mathematically. No recordings, samples or network audio.
export const SAMPLE_RATE = 24000,
  BPM = 74,
  MIN_BPM = 50,
  MAX_BPM = 140,
  BAR_SECONDS = 240 / BPM;
const TAU = Math.PI * 2,
  hz = (m) => 440 * 2 ** ((m - 69) / 12);
export function randomGenerator(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function voice(seconds, fn) {
  const a = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
  for (let i = 0; i < a.length; i++) a[i] = fn(i / SAMPLE_RATE, i);
  return a;
}
function lowpass(a, cutoff) {
  let z = 0;
  const k = 1 - Math.exp((-TAU * cutoff) / SAMPLE_RATE);
  for (let i = 0; i < a.length; i++) {
    z += k * (a[i] - z);
    a[i] = z;
  }
  return a;
}
function fade(a, seconds = 0.012) {
  const n = Math.min(a.length, Math.ceil(seconds * SAMPLE_RATE));
  for (let i = 0; i < n; i++) a[a.length - n + i] *= 1 - i / n;
  return a;
}
export class GrooveSynth {
  constructor(seed = 12573, bpm = BPM) {
    this.rng = randomGenerator(seed);
    this.cache = new Map();
    this.bank = this.makeDrums();
    this.setBpm(bpm);
  }
  setBpm(bpm) {
    const value = Number(bpm);
    if (!Number.isFinite(value) || value < MIN_BPM || value > MAX_BPM)
      throw RangeError('BPM out of range');
    this.bpm = value;
  }
  get barSeconds() {
    return 240 / this.bpm;
  }
  makeDrums() {
    const r = this.rng;
    let phase = 0;
    const kick = voice(0.54, (t) => {
      phase += (TAU * (46 + 112 * Math.exp(-t * 42))) / SAMPLE_RATE;
      const body = Math.sin(phase) * Math.exp(-t * 9.4) * (1 - Math.exp(-t * 1100));
      return Math.tanh(body * 1.5) * 0.85 + (r() * 2 - 1) * Math.exp(-t * 260) * 0.19;
    });
    let n1 = 0,
      n2 = 0;
    const snare = voice(0.32, (t) => {
      const n = r() * 2 - 1;
      n1 += 0.27 * (n - n1);
      n2 += 0.045 * (n - n2);
      const noise = (n1 - n2) * Math.exp(-t * 20) * (1 - Math.exp(-t * 1500));
      const shell =
        (Math.sin(TAU * 178 * t) * 0.2 + Math.sin(TAU * 329 * t) * 0.07) * Math.exp(-t * 31);
      const clap =
        (t > 0.011 ? (r() * 2 - 1) * Math.exp(-(t - 0.011) * 75) * 0.07 : 0) +
        (t > 0.023 ? (r() * 2 - 1) * Math.exp(-(t - 0.023) * 75) * 0.05 : 0);
      return (noise * 2.0 + shell + clap) * 0.88;
    });
    const hat = (dur) => {
      let z = 0;
      return voice(dur, (t) => {
        const n = r() * 2 - 1;
        z += 0.7 * (n - z);
        return (n - z) * Math.exp(-t * (dur > 0.2 ? 15 : 65)) * (1 - Math.exp(-t * 2600)) * 0.9;
      });
    };
    const rim = voice(
      0.12,
      (t) =>
        (Math.sin(TAU * 1670 * t) + Math.sin(TAU * 2230 * t) * 0.6) * Math.exp(-t * 100) * 0.27,
    );
    const glitch = voice(0.12, (t, i) => {
      if (i % 7 === 0) n1 = r() * 2 - 1;
      return (Math.round(n1 * 9) / 9) * Math.exp(-t * 48) * 0.25;
    });
    return {
      kick: fade(kick),
      snare: fade(snare),
      hat: fade(hat(0.12)),
      open: fade(hat(0.36)),
      rim: fade(rim),
      glitch: fade(glitch),
    };
  }
  keys(note) {
    const key = 'k' + note;
    if (this.cache.has(key)) return this.cache.get(key);
    const f = hz(note),
      a = lowpass(
        voice(2.55, (t) => {
          const wobble = 0.0014 * Math.sin(TAU * 0.73 * t) + 0.0005 * Math.sin(TAU * 5.4 * t);
          const p = TAU * f * t * (1 + wobble);
          const env = (1 - Math.exp(-t * 260)) * Math.exp(-t * 2.25);
          return (
            (Math.sin(p + Math.sin(p * 2) * 1.1 * Math.exp(-t * 8)) * 0.63 +
              Math.sin(p * 1.0018) * 0.25 +
              Math.sin(p * 3) * 0.045) *
            env
          );
        }),
        2600,
      );
    this.cache.set(key, fade(a));
    return a;
  }
  bass(note) {
    const key = 'b' + note;
    if (this.cache.has(key)) return this.cache.get(key);
    const f = hz(note),
      a = voice(0.64, (t) => {
        const p = TAU * f * (t + 0.0015 * (1 - Math.exp(-t * 18)));
        const env = (1 - Math.exp(-t * 500)) * Math.exp(-t * 5.5);
        return (Math.sin(p) * 0.8 + Math.sin(p * 2) * 0.15 + Math.sin(p * 3) * 0.035) * env;
      });
    this.cache.set(key, fade(a));
    return a;
  }
  planBar(bar) {
    const r = this.rng,
      step = 60 / this.bpm / 4,
      phrase = Math.floor(bar / 4) % 4;
    const harmonies = [
      [53, 56, 60, 63, 67],
      [53, 57, 60, 62, 65],
      [51, 55, 58, 62, 65],
      [51, 55, 58, 62, 67],
    ];
    const roots = [29, 34, 27, 36],
      root = roots[phrase];
    const chord = harmonies[phrase],
      events = [];
    const breakdown = bar % 32 === 30,
      fill = bar % 8 === 7;
    // Late odd sixteenths make a laid-back MPC-style swing; downbeats remain stable.
    const at = (s) => Math.max(0, s * step + (s % 2 ? 0.057 : 0) + (r() - 0.5) * 0.008);
    const add = (kind, s, gain, pan = 0, note = null, rate = 1) =>
      events.push({ kind, time: at(s), gain, pan, note, rate });
    const patterns = [
      [0, 6, 10],
      [0, 7, 10, 14],
      [0, 6, 11],
      [0, 3, 10],
    ];
    const kicks = breakdown ? [0] : patterns[Math.floor(bar / 2) % patterns.length];
    for (const s of kicks) add('kick', s, s === 0 ? 0.95 : 0.72 + r() * 0.15);
    if (!breakdown) {
      add('snare', 4, 0.74 + r() * 0.05);
      add('snare', 12, 0.78 + r() * 0.05);
    }
    if (r() < 0.35 && !breakdown) add('snare', 11, 0.13, -0.08);
    for (let s = 0; s < 16; s += 2)
      if (!breakdown || s % 4 === 0)
        add('hat', s, (s % 4 === 0 ? 0.16 : 0.23) * (1 + r() * 0.18), s % 4 === 0 ? -0.2 : 0.16);
    if (r() < 0.65 && !breakdown) add('hat', r() < 0.5 ? 7 : 15, 0.1, 0.23);
    if (bar % 4 === 3 && !breakdown) add('open', 14, 0.12, 0.26);
    if (r() < 0.38) add('rim', r() < 0.5 ? 3 : 11, 0.11, -0.27);
    const chordStep = bar % 2 === 0 ? 0 : 2;
    chord.forEach((note, i) =>
      add('keys', chordStep + i * 0.045, 0.105 + (i === 0 ? 0.02 : 0), (i - 2) * 0.15, note),
    );
    if (!breakdown && bar % 2 === 0)
      chord
        .slice(1, 4)
        .forEach((note, i) => add('keys', 10 + i * 0.04, 0.048, (i - 1) * 0.2, note));
    add('bass', 0, 0.44, 0, root);
    if (!breakdown) {
      add('bass', 6, 0.29, 0, root);
      add('bass', 10, 0.37, 0, r() < 0.3 ? root + 7 : root);
      if (bar % 2 === 1) add('bass', 14, 0.23, 0, root + 12);
    }
    // Short chops and 12-bit/held-noise accents appear only at phrase ends.
    if (fill) {
      const count = r() < 0.55 ? 3 : 2;
      for (let i = 0; i < count; i++)
        add('snare', 14 + i * 0.5, 0.19 * (1 - i * 0.19), -0.1 + i * 0.1, null, 1 + i * 0.08);
      if (r() < 0.75)
        for (let i = 0; i < 3; i++)
          add('keys', 14 + i * 0.5, 0.055, (-1) ** i * 0.28, chord[2] + 12, 0.7 + i * 0.14);
      if (r() < 0.6) add('glitch', 15, 0.13, 0.3);
    }
    if (bar % 16 === 15 && r() < 0.6) add('glitch', 13, 0.12, -0.3);
    return { events, bar, breakdown, chord: phrase };
  }
  renderBar(bar) {
    const plan = this.planBar(bar),
      n = Math.ceil((this.barSeconds + 3.0) * SAMPLE_RATE);
    const left = new Float32Array(n),
      right = new Float32Array(n),
      step = 60 / this.bpm / 4;
    const mix = (sound, time, gain, pan, rate = 1) => {
      const start = Math.round(time * SAMPLE_RATE),
        gl = gain * Math.sqrt((1 - pan) * 0.5),
        gr = gain * Math.sqrt((1 + pan) * 0.5);
      const end = Math.min(n - start, Math.floor(sound.length / rate));
      for (let i = 0; i < end; i++) {
        const pos = i * rate,
          j = Math.floor(pos),
          v = (sound[j] || 0) * (1 - (pos - j)) + (sound[j + 1] || 0) * (pos - j);
        left[start + i] += v * gl;
        right[start + i] += v * gr;
      }
    };
    for (const e of plan.events) {
      const sound =
        e.kind === 'keys'
          ? this.keys(e.note)
          : e.kind === 'bass'
            ? this.bass(e.note)
            : this.bank[e.kind];
      mix(sound, e.time, e.gain, e.pan, e.rate);
      if (e.kind === 'keys') {
        mix(sound, e.time + step * 3, e.gain * 0.14, -e.pan - 0.15, e.rate * 0.999);
        mix(sound, e.time + step * 6, e.gain * 0.055, e.pan + 0.12, e.rate * 1.001);
      }
    }
    // Low-level band-limited dust; finite tails overlap the next bar seamlessly.
    let dust = 0;
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      if (t < this.barSeconds) {
        dust += 0.16 * (r() * 2 - 1 - dust);
        const edge = Math.min(1, t * 200, (this.barSeconds - t) * 200);
        left[i] += dust * 0.003 * edge;
        right[i] += dust * 0.003 * edge;
      }
      left[i] = Math.tanh(left[i] * 1.12) * 0.84;
      right[i] = Math.tanh(right[i] * 1.12) * 0.84;
    }
    return { left, right, plan };
  }
}
