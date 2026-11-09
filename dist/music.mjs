import { WaltzSynth, SAMPLE_RATE, BPM } from './groove-core.mjs';
import { PianoSampler } from './piano-samples.mjs';

const DEFAULT_VOLUME = 0.8;
let context,
  master,
  synth,
  piano,
  nextBar = 0,
  nextTime = 0,
  timer = null;
let playing = false,
  primed = false,
  loading = null,
  pianoReady = false,
  fallback = false;

function queueFallbackBar() {
  const { left, right } = synth.renderBar(nextBar);
  const buffer = context.createBuffer(2, left.length, SAMPLE_RATE);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(master);
  source.onended = () => {
    source.disconnect();
    source.buffer = null;
  };
  source.start(nextTime);
}

function queueBar() {
  if (fallback) {
    queueFallbackBar();
  } else {
    piano.scheduleBar(synth.planBar(nextBar), nextTime, synth.bpm);
  }
  nextBar++;
  nextTime += synth.barSeconds;
}

function schedule() {
  if (!playing || context.state !== 'running') return;
  if (nextTime < context.currentTime - 0.1) nextTime = context.currentTime + 0.04;
  while (nextTime < context.currentTime + 8) queueBar();
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
  low.frequency.value = 8200;
  low.Q.value = 0.45;
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 30;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 14;
  compressor.ratio.value = 2.6;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.24;
  master.connect(high).connect(low).connect(compressor).connect(context.destination);
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  synth = new WaltzSynth(seed[0], BPM);
  piano = new PianoSampler(context, master);
}

function maybePlay() {
  if (playing || context?.state !== 'running' || (!pianoReady && !fallback)) return;
  playing = true;
  nextTime = context.currentTime + 0.06;
  schedule();
  if (timer === null) timer = setInterval(schedule, 150);
}

function primeMobileAudio() {
  if (primed) return;
  // A one-frame silent source starts within the gesture, even while MP3s decode.
  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(master);
  source.start(context.currentTime);
  primed = true;
}

function start() {
  try {
    initialize();
    // Autoplay permission must be requested during the trusted gesture.
    const resumed = context.resume();
    primeMobileAudio();
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(DEFAULT_VOLUME, context.currentTime, 0.09);

    if (!loading) {
      loading = piano
        .load()
        .then(() => {
          pianoReady = true;
          maybePlay();
        })
        .catch((error) => {
          console.warn('Piano samples unavailable; using procedural fallback:', error);
          fallback = true;
          maybePlay();
        });
    }

    void Promise.resolve(resumed)
      .then(maybePlay)
      .catch((error) => {
        console.error('Waltz could not resume:', error);
      });
  } catch (error) {
    console.error('Waltz could not start:', error);
  }
}

function onGesture(event) {
  if (!event.isTrusted) return;
  if (!playing) {
    start();
  } else if (context?.state !== 'running') {
    void context.resume().then(schedule).catch((error) => {
      console.error('Waltz could not resume:', error);
    });
  }
}

document.addEventListener('pointerdown', onGesture, { capture: true });
document.addEventListener('pointerup', onGesture, { capture: true });
document.addEventListener('touchstart', onGesture, { capture: true });
document.addEventListener('touchend', onGesture, { capture: true });
document.addEventListener('click', onGesture, { capture: true });
document.addEventListener('keydown', onGesture, { capture: true });
document.addEventListener('visibilitychange', () => {
  if (playing) schedule();
});
