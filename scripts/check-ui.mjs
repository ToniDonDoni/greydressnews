import assert from 'node:assert/strict';
const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

// Sample downloads do not create an AudioContext or start audio before a gesture.
const sources = [];
const buffers = [];
const contexts = [];
const gainTargets = [];
const documentHandlers = {};
const calls = [];
let networkRequests = 0;
let retries = 0;
const flush = () => new Promise((resolve) => setImmediate(resolve));

globalThis.fetch = async (url) => {
  assert(url.startsWith(SAMPLE_BASE_URL), 'Samples must use the approved piano library');
  networkRequests++;
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) };
};
const { PIANO_KEYS } = await import('../dist/piano-samples.mjs');
globalThis.document = {
  getElementById() {
    throw Error('Audio must not depend on visible controls');
  },
  addEventListener(name, handler) {
    documentHandlers[name] = handler;
  },
};
const node = () => ({
  connect() {
    return this;
  },
  disconnect() {},
  frequency: { value: 0 },
  Q: { value: 0 },
  threshold: { value: 0 },
  knee: { value: 0 },
  ratio: { value: 0 },
  attack: { value: 0 },
  release: { value: 0 },
});
class MockAudioContext {
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 48000;
    this.state = 'suspended';
    this.destination = node();
    contexts.push(this);
  }
  createGain() {
    const gain = node();
    gain.gain = {
      value: 0,
      cancelScheduledValues() {},
      setValueAtTime(value) {
        this.value = value;
      },
      linearRampToValueAtTime(value) {
        this.value = value;
      },
      setTargetAtTime(value) {
        this.value = value;
        gainTargets.push(value);
      },
    };
    return gain;
  }
  createBiquadFilter() {
    return node();
  }
  createDynamicsCompressor() {
    return node();
  }
  createBuffer(channels, length, sampleRate) {
    const buffer = { channels, length, sampleRate, copyToChannel() {} };
    buffers.push(buffer);
    return buffer;
  }
  decodeAudioData() {
    return Promise.resolve({
      duration: 4,
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array([0.12, -0.21, 0.14, -0.08]),
    });
  }
  createBufferSource() {
    const source = {
      connect() {
        return this;
      },
      disconnect() {},
      buffer: null,
      playbackRate: { value: 1 },
      start(at) {
        this.startedAt = at;
        calls.push('source.start');
      },
      stop(at) {
        this.stoppedAt = at;
      },
    };
    sources.push(source);
    return source;
  }
  resume() {
    calls.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }
}
globalThis.window = { AudioContext: MockAudioContext };
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 1;

async function settle() {
  await flush();
  await flush();
  await flush();
}

try {
  await import('../dist/music.mjs');
  assert.equal(networkRequests, PIANO_KEYS.length, 'Sample downloading must begin during page load');
  assert.equal(contexts.length, 0, 'AudioContext must wait for a trusted gesture');
  assert.equal(sources.length, 0, 'Loading recordings must not start sound');

  for (const name of ['pointerdown', 'touchstart', 'touchend', 'click', 'music-theme-change']) {
    assert.equal(typeof documentHandlers[name], 'function', name + ' must be registered');
  }

  documentHandlers.click({ isTrusted: false });
  await settle();
  assert.equal(sources.length, 0, 'Synthetic gestures must not start sound');

  documentHandlers.pointerdown({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start'],
    'Resume and the original groove must start inside the gesture');
  await settle();
  assert.equal(contexts[0].state, 'running');
  assert.equal(window.musicPlayback.theme, 'legacy', 'The original groove must be the default');
  assert.equal(window.musicPlayback.playing, true, 'The first trusted gesture must start playback');
  assert(sources.length >= 2, 'The original groove must schedule its next bars');
  assert.equal(sources[0].buffer.sampleRate, 24000, 'The default must use the original synthesized groove');
  assert.equal(sources[0].buffer.length, Math.ceil((240 / 74 + 3) * 24000));
  assert(!sources.some((source) => source.buffer?.sampleRate === 44100),
    'The piano theme must not replace the default before a circle gesture');
  assert(gainTargets.includes(0.8), 'The default master gain must remain 80 percent');

  const legacySourceCount = sources.length;
  documentHandlers['music-theme-change']({ detail: { theme: 'waltz' } });
  await settle();
  assert.equal(window.musicPlayback.theme, 'waltz', 'The circle gesture event must select the waltz');
  const pianoSources = sources.slice(legacySourceCount).filter(
    (source) => source.buffer?.sampleRate === 44100,
  );
  assert(pianoSources.length > 10, 'Selecting the waltz must schedule recorded piano notes');
  assert(pianoSources.some((source) => source.playbackRate.value !== 1),
    'The score notes must be repitched from the nearest piano sample');

  const afterSwitch = sources.length;
  documentHandlers.touchstart({ isTrusted: true });
  documentHandlers.click({ isTrusted: true });
  await settle();
  assert.equal(sources.length, afterSwitch, 'Later gestures must not restart or duplicate playback');
  assert.equal(contexts.length, 1, 'Only one AudioContext should exist');
  assert.equal(networkRequests, PIANO_KEYS.length, 'Samples must be fetched only once');

  sources.length = 0;
  contexts.length = 0;
  gainTargets.length = 0;
  calls.length = 0;
  await import('../dist/music.mjs?touch-only');
  documentHandlers.touchstart({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start']);
  await settle();
  assert(sources.length >= 2, 'Touch-only activation must start the original groove');
  assert.equal(sources[0].buffer.sampleRate, 24000);
  assert.equal(window.musicPlayback.theme, 'legacy');
  assert(gainTargets.includes(0.8), 'Touch-only playback must keep 80 percent master gain');

  sources.length = 0;
  contexts.length = 0;
  gainTargets.length = 0;
  calls.length = 0;
  await import('../dist/music.mjs?touchend-only');
  documentHandlers.touchend({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start']);
  await settle();
  assert(sources.length >= 2, 'Touchend-only activation must start the original groove');
  assert.equal(sources[0].buffer.sampleRate, 24000);

  class RetryAudioContext extends MockAudioContext {
    resume() {
      calls.push('resume');
      retries++;
      if (retries === 1) return new Promise(() => {});
      this.state = 'running';
      return Promise.resolve();
    }
  }
  globalThis.window = { AudioContext: RetryAudioContext };
  sources.length = 0;
  contexts.length = 0;
  gainTargets.length = 0;
  calls.length = 0;
  await import('../dist/music.mjs?retry-after-block');
  documentHandlers.pointerdown({ isTrusted: true });
  await flush();
  assert.equal(retries, 1, 'The first attempt must request audio activation');
  documentHandlers.touchend({ isTrusted: true });
  await settle();
  assert.equal(retries, 2, 'Another trusted gesture must retry a blocked resume');
  assert(sources.length >= 2, 'Retry must start the original groove');
  assert.equal(sources[0].buffer.sampleRate, 24000);
  assert(gainTargets.includes(0.8), 'Retry playback must keep the fixed master gain');

  console.log('Default groove, circle-selected piano waltz, sample playback, gesture activation, mobile retry, and single-context scheduling passed.');
} finally {
  globalThis.setInterval = realSetInterval;
}
