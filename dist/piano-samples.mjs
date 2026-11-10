// Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0.
// Audio files: https://tonejs.github.io/audio/salamander/
// Recording and license: https://github.com/sfzinstruments/SalamanderGrandPiano
// We load a small set of natural recordings and repitch the nearest key.

export const SAMPLE_BASE_URL = './assets/piano-';

export const PIANO_KEYS = [
  ['Fs1', 30],
  ['A1', 33],
  ['C2', 36],
  ['Fs2', 42],
  ['C3', 48],
  ['Fs3', 54],
  ['C4', 60],
  ['Ds4', 63],
  ['Fs4', 66],
  ['A4', 69],
  ['C5', 72],
  ['Fs5', 78],
  ['C6', 84],
  ['Fs6', 90],
];

let sampleDownload = null;

export function preloadPiano() {
  if (!sampleDownload) {
    sampleDownload = Promise.all(
      PIANO_KEYS.map(async ([name, midi]) => {
        const response = await fetch(SAMPLE_BASE_URL + name + '.mp3');
        if (!response.ok) throw Error('Could not download piano sample: ' + name);
        return [midi, await response.arrayBuffer()];
      }),
    );
  }
  return sampleDownload;
}

// Download bytes without creating an AudioContext or playing sound.
void preloadPiano().catch(() => {});

export class PianoSampler {
  constructor(context, output) {
    this.context = context;
    this.output = output;
    this.buffers = new Map();
    this.loading = null;
  }

  load() {
    if (!this.loading) {
      this.loading = preloadPiano().then(async (samples) => {
        const decoded = await Promise.all(
          samples.map(async ([midi, bytes]) => [
            midi,
            await this.context.decodeAudioData(bytes.slice(0)),
          ]),
        );
        this.buffers = new Map(decoded);
      });
    }
    return this.loading;
  }

  closestSample(note) {
    let best = PIANO_KEYS[0][1];
    for (const [, midi] of PIANO_KEYS) {
      if (Math.abs(midi - note) < Math.abs(best - note)) best = midi;
    }
    return best;
  }

  play(event, barStart, bpm) {
    const midi = this.closestSample(event.note);
    const buffer = this.buffers.get(midi);
    if (!buffer) return;

    const at = barStart + event.time;
    const playbackRate = 2 ** ((event.note - midi) / 12);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const envelope = this.context.createGain();
    const level = event.gain * (event.role === 'melody' ? 0.85 : 0.75);
    const hold = at + Math.max(0.14, ((event.durationBeats * 60) / bpm) * 0.9);
    const release = event.role === 'melody' ? 0.22 : 0.17;
    const end = Math.min(at + buffer.duration / playbackRate, hold + release * 7);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.012);
    envelope.gain.setValueAtTime(level, hold);
    envelope.gain.setTargetAtTime(0.0001, hold, release);
    source.connect(envelope).connect(this.output);
    source.start(at);
    source.stop(Math.max(at + 0.02, end));
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
    };
  }

  scheduleBar(plan, at, bpm) {
    for (const event of plan.events) this.play(event, at, bpm);
  }
}
