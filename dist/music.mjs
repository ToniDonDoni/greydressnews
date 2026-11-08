import {GrooveSynth,SAMPLE_RATE,BPM} from './groove-core.mjs';

const DEFAULT_VOLUME=.8;
let context,master,synth,nextBar=0,nextTime=0,timer=null,starting=false,playing=false;

function schedule(){
  if(!playing||context.state!=='running')return;
  if(nextTime<context.currentTime-.1)nextTime=context.currentTime+.04;
  while(nextTime<context.currentTime+8){
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
}

async function start(){
  if(starting||playing)return;
  starting=true;
  try{
    if(!context){
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
      nextTime=context.currentTime+.07;
    }
    await context.resume();
    if(context.state!=='running')throw Error('Audio blocked');
    playing=true;
    schedule();
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(DEFAULT_VOLUME,context.currentTime,.09);
    timer=setInterval(schedule,150);
  }catch(error){
    playing=false;
    clearInterval(timer);
    timer=null;
    console.error('Groove could not start:',error);
  }finally{
    starting=false;
  }
}

// The first trusted click unlocks Web Audio without displaying playback controls.
document.addEventListener('click',event=>{
  if(!event.isTrusted||playing||starting)return;
  void start();
});
document.addEventListener('visibilitychange',()=>{if(playing)schedule();});
// Resume after mobile audio interruptions on the next user gesture.
document.addEventListener('pointerdown',()=>{
  if(playing&&context?.state!=='running'){
    void context.resume().then(schedule).catch(error=>console.error('Groove resume failed:',error));
  }
});
