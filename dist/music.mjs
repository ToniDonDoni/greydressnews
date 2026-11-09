import {
  GrooveSynth as LegacyGrooveSynth,
  SAMPLE_RATE as LEGACY_SAMPLE_RATE,
  BPM as LEGACY_BPM,
} from './legacy-groove.mjs';
import {
  WaltzSynth,
  SAMPLE_RATE as WALTZ_SAMPLE_RATE,
  BPM as WALTZ_BPM,
} from './groove-core.mjs';
import { PianoSampler } from './piano-samples.mjs';

const DEFAULT_VOLUME = 0.8;
const SCHEDULING_AHEAD_SECONDS = 8;
const THEME_CROSSFADE_SECONDS = 0.075;
let context,
  master,
  legacyBus,
  waltzBus,
  waltzFallbackBus,
  legacySynth,
  waltzSynth,
  piano,
  nextBar = 0,
  nextTime = 0,
  timer = null;
let currentTheme = 'legacy';
let playing = false,
  primed = false,
  loading = null,
  pianoReady = false,
  fallback = false;

function rampGain(node, value, at) {
  node.gain.cancelScheduledValues(at);
  node.gain.setValueAtTime(node.gain.value, at);
  node.gain.linearRampToValueAtTime(value, at + THEME_CROSSFADE_SECONDS);
}

function updateThemeBuses() {
  const now = context.currentTime;
  const useSamples = currentTheme === 'waltz' && pianoReady && !fallback;
  const useFallback = currentTheme === 'waltz' && !useSamples;
  rampGain(legacyBus, currentTheme === 'legacy' ? 1 : 0, now);
  rampGain(waltzBus, useSamples ? 1 : 0, now);
  rampGain(waltzFallbackBus, useFallback ? 1 : 0, now);
}

function queueLegacyBar(bar) {
  const { left, right } = legacySynth.renderBar(bar);
  const buffer = context.createBuffer(2, left.length, LEGACY_SAMPLE_RATE);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(legacyBus);
  source.onended = () => {
    source.disconnect();
    source.buffer = null;
  };
  source.start(nextTime);
}

function queueWaltzFallbackBar(bar) {
  const { left, right } = waltzSynth.renderBar(bar);
  const buffer = context.createBuffer(2, left.length, WALTZ_SAMPLE_RATE);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(waltzFallbackBus);
  source.onended = () => {
    source.disconnect();
    source.buffer = null;
  };
  source.start(nextTime);
}

function queueBar() {
  if (currentTheme === 'legacy') {
    queueLegacyBar(nextBar);
    nextTime += legacySynth.barSeconds;
  } else {
    if (pianoReady && !fallback) {
      piano.scheduleBar(waltzSynth.planBar(nextBar), nextTime, waltzSynth.bpm);
    } else {
      queueWaltzFallbackBar(nextBar);
    }
    nextTime += waltzSynth.barSeconds;
  }
  nextBar++;
}

function schedule() {
  if (!playing || context.state !== 'running') return;
  if (nextTime < context.currentTime - 0.1) nextTime = context.currentTime + 0.04;

  // While the samples decode, queue only one fallback bar so it can crossfade
  // to recorded piano as soon as the sample bank is ready.
  const horizon =
    currentTheme === 'waltz' && !pianoReady && !fallback
      ? waltzSynth.barSeconds
      : SCHEDULING_AHEAD_SECONDS;
  while (nextTime < context.currentTime + horizon) queueBar();
}

function initialize() {
  if (context) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw Error('Web Audio is not supported');
  context = new Audio({ latencyHint: 'playback' });

  master = context.createGain();
  master.gain.value = 0;
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 6900;
  low.Q.value = 0.45;
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 28;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -13;
  compressor.knee.value = 14;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.16;
  master.connect(high).connect(low).connect(compressor).connect(context.destination);

  legacyBus = context.createGain();
  legacyBus.gain.value = currentTheme === 'legacy' ? 1 : 0;
  legacyBus.connect(master);
  waltzBus = context.createGain();
  waltzBus.gain.value = 0;
  waltzBus.connect(master);
  waltzFallbackBus = context.createGain();
  waltzFallbackBus.gain.value = currentTheme === 'waltz' ? 1 : 0;
  waltzFallbackBus.connect(master);

  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  legacySynth = new LegacyGrooveSynth(seed[0], LEGACY_BPM);
  waltzSynth = new WaltzSynth((seed[0] ^ 0x9e3779b9) >>> 0, WALTZ_BPM);
  piano = new PianoSampler(context, waltzBus);
}

function loadPianoSamples() {
  if (loading) return;
  loading = piano
    .load()
    .then(() => {
      pianoReady = true;
      if (currentTheme === 'waltz') {
        updateThemeBuses();
        schedule();
      }
    })
    .catch((error) => {
      console.warn('Piano samples unavailable; using procedural fallback:', error);
      fallback = true;
      if (currentTheme === 'waltz') {
        updateThemeBuses();
        schedule();
      }
    });
}

function maybePlay() {
  if (playing || context?.state !== 'running') return;
  playing = true;
  if (nextTime < context.currentTime - 0.1) nextTime = context.currentTime + 0.04;
  schedule();
  if (timer === null) timer = setInterval(schedule, 150);
}

function primeMobileAudio() {
  if (primed) return;
  // Schedule the original groove inside the trusted gesture, as the old player did.
  nextTime = context.currentTime + 0.06;
  queueBar();
  primed = true;
}

function start() {
  try {
    initialize();
    const resumed = context.resume();
    primeMobileAudio();
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(DEFAULT_VOLUME, context.currentTime, 0.09);
    loadPianoSamples();

    void Promise.resolve(resumed)
      .then(() => {
        if (context.state !== 'running') throw Error('Audio blocked');
        maybePlay();
      })
      .catch((error) => {
        console.error('Music could not start:', error);
      });
  } catch (error) {
    console.error('Music could not start:', error);
  }
}

function switchTheme(theme) {
  if (theme !== 'legacy' && theme !== 'waltz') return;
  if (theme === currentTheme) return;
  currentTheme = theme;
  if (!context) return;

  updateThemeBuses();
  nextBar = 0;
  nextTime = context.currentTime + 0.06;
  if (playing && context.state === 'running') schedule();
}

function onGesture(event) {
  if (!event.isTrusted) return;
  if (!context || !playing) {
    start();
  } else if (context.state !== 'running') {
    void context
      .resume()
      .then(() => {
        maybePlay();
        schedule();
      })
      .catch((error) => {
        console.error('Music could not resume:', error);
      });
  }
}

document.addEventListener('pointerdown', onGesture, { capture: true });
document.addEventListener('pointerup', onGesture, { capture: true });
document.addEventListener('touchstart', onGesture, { capture: true });
document.addEventListener('touchend', onGesture, { capture: true });
document.addEventListener('click', onGesture, { capture: true });
document.addEventListener('keydown', onGesture, { capture: true });
document.addEventListener('music-theme-change', (event) => {
  switchTheme(event.detail?.theme);
});
document.addEventListener('visibilitychange', () => {
  if (playing) schedule();
});

Object.defineProperty(window, 'musicPlayback', {
  configurable: true,
  value: Object.freeze({
    get theme() {
      return currentTheme;
    },
    get playing() {
      return playing;
    },
  }),
});
