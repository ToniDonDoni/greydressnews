import {GrooveSynth,SAMPLE_RATE,BPM} from './groove-core.mjs';

const DEFAULT_VOLUME=.8;
let context,master,synth,nextBar=0,nextTime=0,timer=null;
let starting=false,playing=false,primed=false;

function queueBar(){
  const {left,right}=synth.renderBar(nextBar++);
  const buffer=context.createBuffer(2,left.length,SAMPLE_RATE);
  buffer.copyToChannel(left,0);
  buffer.copyToChannel(right,1);
  const source=context.createBufferSource();
  source.buffer=buffer;
  source.connect(master);
  source.onended=()=>{source.disconnect();source.buffer=null;};
  source.start(nextTime);
  nextTime+=synth.barSeconds;
}

function schedule(){
  if(!playing||context.state!=='running')return;
  if(nextTime<context.currentTime-.1)nextTime=context.currentTime+.04;
  while(nextTime<context.currentTime+8)queueBar();
}

function initialize(){
  if(context)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)throw Error('Web Audio is not supported');
  context=new Audio({latencyHint:'playback'});
  master=context.createGain();
  master.gain.value=0;
  const low=context.createBiquadFilter();
  low.type='lowpass';low.frequency.value=6900;low.Q.value=.45;
  const high=context.createBiquadFilter();
  high.type='highpass';high.frequency.value=28;
  const compressor=context.createDynamicsCompressor();
  compressor.threshold.value=-13;compressor.knee.value=14;
  compressor.ratio.value=3;compressor.attack.value=.008;compressor.release.value=.16;
  master.connect(high).connect(low).connect(compressor).connect(context.destination);
  const seed=new Uint32Array(1);
  crypto.getRandomValues(seed);
  synth=new GrooveSynth(seed[0],BPM);
  nextTime=context.currentTime+.06;
}

function start(){
  if(starting||playing)return;
  starting=true;
  try{
    initialize();
    // Resume inside the user gesture, not after the first await.
    const resume=context.resume();
    // Prime a real source inside the same gesture for mobile Safari autoplay.
    if(!primed){
      queueBar();
      primed=true;
    }
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(DEFAULT_VOLUME,context.currentTime,.09);
    Promise.resolve(resume).then(()=>{
      if(context.state!=='running')throw Error('Audio blocked');
      playing=true;
      schedule();
      if(timer===null)timer=setInterval(schedule,150);
    }).catch(error=>{
      console.error('Groove could not start:',error);
    }).finally(()=>{starting=false;});
  }catch(error){
    starting=false;
    console.error('Groove could not start:',error);
  }
}

function onGesture(event){
  if(!event.isTrusted)return;
  if(!playing&&!starting){
    start();
  }else if(playing&&context?.state!=='running'){
    // Audio may be interrupted when a mobile device locks or changes output.
    void context.resume().then(schedule).catch(error=>{
      console.error('Groove could not resume:',error);
    });
  }
}

// Taps on a non-clickable image do not always produce a delegated click on iOS.
// Listen at the start of the gesture, while browser audio activation is available.
document.addEventListener('pointerdown',onGesture,{capture:true,passive:true});
document.addEventListener('touchstart',onGesture,{capture:true,passive:true});
// Some Android WebViews only expose the end of the touch as an activation.
document.addEventListener('touchend',onGesture,{capture:true,passive:true});
document.addEventListener('click',onGesture,{capture:true});
document.addEventListener('keydown',onGesture,{capture:true});
document.addEventListener('visibilitychange',()=>{if(playing)schedule();});
