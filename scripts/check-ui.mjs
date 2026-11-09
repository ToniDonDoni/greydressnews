import assert from 'node:assert/strict';
import { PIANO_KEYS, SAMPLE_BASE_URL } from '../dist/piano-samples.mjs';

// The sampler fetches recordings but never creates an AudioContext before a gesture.
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
try {
  await import('../dist/music.mjs');
  assert.equal(networkRequests, PIANO_KEYS.length, 'Sample downloading must begin during page load');
  assert.equal(contexts.length, 0, 'AudioContext must wait for a trusted gesture');
  assert.equal(sources.length, 0, 'Loading recordings must not start sound');

  for (const name of ['pointerdown', 'touchstart', 'touchend', 'click']) {
    assert.equal(typeof documentHandlers[name], 'function', name + ' must support playback');
  }

  documentHandlers.click({ isTrusted: false });
  await flush();
  assert.equal(sources.length, 0, 'Synthetic gestures must not start sound');

  documentHandlers.pointerdown({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start'],
    'Resume and the silent mobile-unlock source must start inside the gesture');
  await flush();
  await flush();
  assert.equal(contexts[0].state, 'running');
  assert(sources.length > 10, 'The first click must start many sampled piano notes');
  assert(sources.slice(1).every((source) => source.buffer.sampleRate === 44100),
    'Every audible note must use an actual decoded piano recording');
  assert(sources.slice(1).some((source) => source.playbackRate.value !== 1),
    'Unrecorded notes must be repitched from the nearest piano sample');
  assert(gainTargets.includes(0.8), 'The default master gain must remain 80 percent');
  assert.equal(buffers[0]?.length, 1, 'The mobile unlock must use one silent frame');

  const initial = sources.length;
  documentHandlers.touchstart({ isTrusted: true });
  documentHandlers.click({ isTrusted: true });
  await flush();
  assert.equal(sources.length, initial, 'Later gestures must not restart the music');
  assert.equal(contexts.length, 1, 'Only one AudioContext should exist');
  assert.equal(networkRequests, PIANO_KEYS.length, 'Samples must be fetched only once');

  sources.length = 0; contexts.length = 0; gainTargets.length = 0; calls.length = 0;
  await import('../dist/music.mjs?touch-only');
  documentHandlers.touchstart({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start']);
  await flush();
  await flush();
  assert(sources.length > 10, 'Touch-only playback must schedule piano samples');
  assert(gainTargets.includes(0.8), 'Touch-only playback must keep 80 percent master gain');

  sources.length = 0; contexts.length = 0; gainTargets.length = 0; calls.length = 0;
  await import('../dist/music.mjs?touchend-only');
  documentHandlers.touchend({ isTrusted: true });
  assert.deepEqual(calls.slice(0, 2), ['resume', 'source.start']);
  await flush();
  await flush();
  assert(sources.length > 10, 'Touchend-only playback must schedule piano samples');

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
  sources.length = 0; contexts.length = 0; gainTargets.length = 0; calls.length = 0;
  await import('../dist/music.mjs?retry-after-block');
  documentHandlers.pointerdown({ isTrusted: true });
  await flush();
  assert.equal(retries, 1, 'The first attempt must request audio activation');
  documentHandlers.touchend({ isTrusted: true });
  await flush();
  await flush();
  assert.equal(retries, 2, 'Another trusted gesture must retry a blocked resume');
  assert(sources.length > 10, 'Retry must schedule real piano samples');
  assert(gainTargets.includes(0.8), 'Retry playback must keep the fixed master gain');

  console.log('Sample loading, real piano buffer playback, repitching, gesture activation, mobile retry, and no repeated network downloads passed.');
} finally {
  globalThis.setInterval = realSetInterval;
}
