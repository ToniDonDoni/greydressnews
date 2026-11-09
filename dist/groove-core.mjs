import { SCORE_LEFT_HAND, SCORE_RIGHT_HAND } from './waltz-score.mjs';

// Procedural felt-piano waltz inspired by the supplied D-flat major score.
export const SAMPLE_RATE = 24000;
export const BPM = 165;
export const BEATS_PER_BAR = 3;
export const BAR_SECONDS = (BEATS_PER_BAR * 60) / BPM;
export const MIN_BPM = 50;
export const MAX_BPM = 180;
export const SECTION_A_BARS = 18;
export const SECTION_B_BARS = 15;
export const PHRASE_CYCLE_BARS = SECTION_A_BARS + SECTION_B_BARS;

const TAU = Math.PI * 2;
const midiHz = (note) => 440 * 2 ** ((note - 69) / 12);

export function randomGenerator(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

// MIDI velocities retain the dynamics marked in the score.
const VELOCITY_GAIN = Object.freeze({ melody: 0.82, bass: 1.05, chord: 0.58 });

function gainFor(role, velocity) {
  return (velocity / 127) * VELOCITY_GAIN[role];
}

function makePianoNote(note, velocityLayer) {
  const frequency = midiHz(note);
  const seconds = note < 48 ? 3.35 : note < 72 ? 2.9 : 2.45;
  const length = Math.ceil(seconds * SAMPLE_RATE);
  const output = new Float32Array(length);
  const random = randomGenerator((note * 7919 + velocityLayer * 104729) >>> 0);
  const brightness = [0.78, 0.96, 1.14][velocityLayer];
  const hammerLevel = [0.018, 0.03, 0.045][velocityLayer];
  const inharmonicity = 0.00016 + Math.max(0, 48 - note) * 0.000002;
  const partials = note < 48 ? 10 : 8;
  const strings = [-0.0011, 0, 0.00125];
  const stringWeights = [0.23, 0.54, 0.23];
  const partialData = [];

  for (let harmonic = 1; harmonic <= partials; harmonic++) {
    const frequencyOfPartial =
      frequency * harmonic * Math.sqrt(1 + inharmonicity * harmonic * harmonic);
    const amplitude = (1 / harmonic ** 1.38) * (1 + ((brightness - 1) * (harmonic - 1)) / partials);
    const damping = 0.86 + Math.max(0, note - 60) * 0.012 + harmonic * harmonic * 0.052;
    partialData.push({
      amplitude,
      damping,
      frequencies: strings.map((detune) => frequencyOfPartial * (1 + detune)),
    });
  }

  for (let index = 0; index < length; index++) {
    const time = index / SAMPLE_RATE;
    const attack = 1 - Math.exp(-time * 1050);
    let sample = 0;

    for (const partial of partialData) {
      const envelope = Math.exp(-time * partial.damping) * partial.amplitude;
      let stringSignal = 0;
      for (let string = 0; string < strings.length; string++) {
        stringSignal += Math.sin(TAU * partial.frequencies[string] * time) * stringWeights[string];
      }
      sample += stringSignal * envelope;
    }

    const hammerNoise = (random() * 2 - 1) * Math.exp(-time * 235) * hammerLevel;
    const hammerTone =
      Math.sin(TAU * frequency * 7.6 * time) * Math.exp(-time * 105) * hammerLevel * 0.55;
    const soundboard = Math.sin(TAU * frequency * 0.997 * time) * Math.exp(-time * 1.7) * 0.018;

    output[index] = (sample * 0.29 + hammerNoise + hammerTone + soundboard) * attack;
  }

  const fadeSamples = Math.min(length, Math.floor(SAMPLE_RATE * 0.09));
  for (let index = 0; index < fadeSamples; index++) {
    output[length - fadeSamples + index] *= 1 - index / fadeSamples;
  }
  return output;
}

function addRoom(left, right) {
  const length = left.length;
  const leftDelays = [0.0297, 0.0371, 0.0411, 0.0437].map((value) =>
    Math.round(value * SAMPLE_RATE),
  );
  const rightDelays = [0.0311, 0.0383, 0.0427, 0.0473].map((value) =>
    Math.round(value * SAMPLE_RATE),
  );

  for (const [channel, delays] of [
    [left, leftDelays],
    [right, rightDelays],
  ]) {
    const dry = channel.slice();
    const wet = new Float32Array(length);
    for (let line = 0; line < delays.length; line++) {
      const delay = delays[line];
      const buffer = new Float32Array(delay);
      const feedback = 0.68 - line * 0.025;
      const level = 0.075 - line * 0.009;
      let cursor = 0;
      for (let index = 0; index < length; index++) {
        const delayed = buffer[cursor];
        buffer[cursor] = dry[index] + delayed * feedback;
        wet[index] += delayed * level;
        cursor++;
        if (cursor === delay) cursor = 0;
      }
    }
    for (let index = 0; index < length; index++) {
      channel[index] = dry[index] + wet[index] * 0.82;
    }
  }
}

export class WaltzSynth {
  constructor(seed = 12573, bpm = BPM) {
    this.rng = randomGenerator(seed);
    this.cache = new Map();
    this.setBpm(bpm);
  }

  setBpm(bpm) {
    const value = Number(bpm);
    if (!Number.isFinite(value) || value < MIN_BPM || value > MAX_BPM) {
      throw RangeError('BPM out of range');
    }
    this.bpm = value;
  }

  get barSeconds() {
    return (BEATS_PER_BAR * 60) / this.bpm;
  }

  piano(note, velocity) {
    const layer = velocity < 54 ? 0 : velocity < 67 ? 1 : 2;
    const key = String(note) + ':' + String(layer);
    if (!this.cache.has(key)) {
      this.cache.set(key, makePianoNote(note, layer));
    }
    return this.cache.get(key);
  }

  planBar(bar) {
    const cyclePosition = ((bar % PHRASE_CYCLE_BARS) + PHRASE_CYCLE_BARS) % PHRASE_CYCLE_BARS;
    const section = cyclePosition < SECTION_A_BARS ? 'A' : 'B';
    const sectionBar = section === 'A' ? cyclePosition : cyclePosition - SECTION_A_BARS;
    const rightHand = SCORE_RIGHT_HAND[cyclePosition];
    const leftHand = SCORE_LEFT_HAND[cyclePosition];
    const step = 60 / this.bpm;
    const events = [];

    const add = (note, beat, durationBeats, velocity, role, pan) => {
      const humanize = beat === 0 ? 0 : (this.rng() - 0.5) * 0.006;
      events.push({
        kind: 'piano',
        role,
        note,
        beat,
        durationBeats,
        time: Math.max(0, beat * step + humanize),
        gain: gainFor(role, velocity),
        pan,
        velocity,
      });
    };

    for (const [note, beat, duration, velocity] of rightHand) {
      add(note, beat, duration, velocity, 'melody', section === 'A' ? 0.18 : 0.2);
    }

    const leftHandByBeat = new Map();
    for (const note of leftHand) {
      const beat = note[1];
      if (!leftHandByBeat.has(beat)) leftHandByBeat.set(beat, []);
      leftHandByBeat.get(beat).push(note);
    }

    for (const note of leftHand) {
      const [pitch, beat, duration, velocity] = note;
      const simultaneous = leftHandByBeat.get(beat);
      const isBass = beat === 0 && duration < 1 && simultaneous.length === 1;
      if (isBass) {
        add(pitch, beat, duration, velocity, 'bass', -0.18);
      } else {
        const chordIndex = simultaneous.indexOf(note);
        const pan = (chordIndex - (simultaneous.length - 1) / 2) * 0.2;
        add(pitch, beat, duration, velocity, 'chord', pan);
      }
    }

    return { bar, section, sectionBar, events };
  }

  renderBar(bar) {
    const plan = this.planBar(bar);
    const length = Math.ceil((this.barSeconds + 3.25) * SAMPLE_RATE);
    const left = new Float32Array(length);
    const right = new Float32Array(length);

    for (const event of plan.events) {
      const sound = this.piano(event.note, event.velocity);
      const start = Math.round(event.time * SAMPLE_RATE);
      const gainLeft = event.gain * Math.sqrt((1 - event.pan) * 0.5);
      const gainRight = event.gain * Math.sqrt((1 + event.pan) * 0.5);
      const end = Math.min(sound.length, length - start);
      for (let index = 0; index < end; index++) {
        const value = sound[index];
        left[start + index] += value * gainLeft;
        right[start + index] += value * gainRight;
      }
    }

    addRoom(left, right);
    for (let index = 0; index < length; index++) {
      left[index] = Math.tanh(left[index] * 1.08) * 0.86;
      right[index] = Math.tanh(right[index] * 1.08) * 0.86;
    }

    return { left, right, plan };
  }
}

// Preserve the old export name for any external code using the previous engine API.
export { WaltzSynth as GrooveSynth };
