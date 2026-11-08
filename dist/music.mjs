import{GrooveSynth,SAMPLE_RATE,BPM,MIN_BPM,MAX_BPM}from'./groove-core.mjs';
const button=document.getElementById('music'),label=document.getElementById('musicLabel'),volume=document.getElementById('volume'),tempo=document.getElementById('bpm'),tempoValue=document.getElementById('bpmValue');
let context,master,synth,nextBar=0,nextTime=0,timer=null,tempoTimer=null,busy=false,playing=false;
const scheduled=new Map();
let bpm=BPM,firstGestureUsed=false;
let volumeValue=.62;
try{const stored=localStorage.getItem('teaser-volume');if(stored!==null)volumeValue=Math.max(0,Math.min(1,Number(stored)||0));}catch{}
volume.value=Math.round(volumeValue*100);
try{
  const stored=localStorage.getItem('teaser-bpm'),value=Number(stored);
  if(stored!==null&&Number.isFinite(value)&&value>=MIN_BPM&&value<=MAX_BPM)bpm=Math.round(value);
}catch{}
if(tempo)tempo.value=String(bpm);
function ui(){
  button.setAttribute('aria-pressed',String(playing));
  button.setAttribute('aria-label',playing?'Pause hip-hop':'Play hip-hop');
  label.textContent=playing?'BOOM BAP':'PLAY THE GROOVE';
  if(tempoValue)tempoValue.textContent=`${bpm} BPM`;
  document.getElementById('soundbar').classList.toggle('playing',playing);
}
function schedule(){
  if(!playing||context.state!=='running')return;
  if(nextTime<context.currentTime-.1)nextTime=context.currentTime+.04;
  while(nextTime<context.currentTime+8){
    const bar=nextBar++,{left,right}=synth.renderBar(bar),buffer=context.createBuffer(2,left.length,SAMPLE_RATE);
    buffer.copyToChannel(left,0);buffer.copyToChannel(right,1);
    const source=context.createBufferSource();source.buffer=buffer;source.connect(master);
    scheduled.set(source,{bar,start:nextTime});
    source.onended=()=>{scheduled.delete(source);source.disconnect();source.buffer=null;};
    source.start(nextTime);
    nextTime+=synth.barSeconds;
  }
}
async function toggle(){
  if(busy)return;busy=true;button.disabled=true;
  try{
    if(!context){
      const Audio=contextConstructor();context=new Audio({latencyHint:'playback'});
      master=context.createGain();master.gain.value=0;
      const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=6900;low.Q.value=.45;
      const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=28;
      const compressor=context.createDynamicsCompressor();compressor.threshold.value=-13;compressor.knee.value=14;compressor.ratio.value=3;compressor.attack.value=.008;compressor.release.value=.16;
      master.connect(high).connect(low).connect(compressor).connect(context.destination);
      const seed=new Uint32Array(1);crypto.getRandomValues(seed);synth=new GrooveSynth(seed[0],bpm);
      nextTime=context.currentTime+.07;
    }
    if(playing){
      playing=false;clearInterval(timer);timer=null;
      master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(0,context.currentTime,.025);
      await new Promise(resolve=>setTimeout(resolve,130));await context.suspend();
    }else{
      clearTimeout(tempoTimer);tempoTimer=null;synth.setBpm(bpm);
      await context.resume();if(context.state!=='running')throw Error('Audio blocked');playing=true;
      schedule();master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(volumeValue*.95,context.currentTime,.09);
      timer=setInterval(schedule,150);
    }
    ui();
  }catch(e){
    playing=false;clearInterval(timer);timer=null;ui();label.textContent='TRY AGAIN';button.title='Could not start audio. Tap to try again.';
    console.error('Groove could not start:',e);
  }finally{busy=false;button.disabled=false;}
}
function contextConstructor(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Web Audio is not supported');return Audio;}
function applyTempo(){
  tempoTimer=null;
  if(!synth)return;
  synth.setBpm(bpm);
  const active=playing&&context.state==='running';
  const now=context.currentTime,cutAt=active?now+.12:now;
  // Keep the first unheard bar instead of jumping over the look-ahead queue.
  const unheard=[...scheduled.values()].find(item=>item.start>=cutAt);
  if(unheard)nextBar=unheard.bar;
  if(active){
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0,now,.025);
  }
  for(const source of scheduled.keys())try{source.stop(cutAt);}catch{}
  nextTime=cutAt+(active?.02:.07);
  if(active){
    schedule();
    master.gain.setTargetAtTime(volumeValue*.95,cutAt,.06);
  }
}
tempo?.addEventListener('input',()=>{
  bpm=Number(tempo.value);
  tempoValue.textContent=`${bpm} BPM`;
  try{localStorage.setItem('teaser-bpm',String(bpm));}catch{}
  clearTimeout(tempoTimer);
  // Avoid rendering a whole look-ahead queue on every drag event.
  tempoTimer=setTimeout(applyTempo,100);
});
// Consume the one-time shortcut before async audio startup or document bubbling.
button.addEventListener('click',()=>{firstGestureUsed=true;return toggle();});
document.addEventListener('click',event=>{
  if(firstGestureUsed||!event.isTrusted)return;
  firstGestureUsed=true;
  return toggle();
});
volume.addEventListener('input',()=>{
  volumeValue=Number(volume.value)/100;
  if(master&&playing)master.gain.setTargetAtTime(volumeValue*.95,context.currentTime,.025);
  try{localStorage.setItem('teaser-volume',String(volumeValue));}catch{}
});
document.addEventListener('visibilitychange',()=>{if(playing)schedule();});
// Mobile browsers may interrupt audio on a call or a device switch. A tap resumes it.
document.addEventListener('pointerdown',()=>{if(playing&&context?.state==='interrupted')context.resume().then(schedule).catch(()=>{});});
ui();
