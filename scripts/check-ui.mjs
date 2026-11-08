import assert from 'node:assert/strict';

const sources=[],buffers=[],contexts=[],gainTargets=[],documentHandlers={};
globalThis.document={
  getElementById(){throw Error('Audio must not depend on visible controls');},
  addEventListener(name,handler){documentHandlers[name]=handler;}
};
const node=()=>({
  connect(){return this;},disconnect(){},
  frequency:{value:0},Q:{value:0},threshold:{value:0},knee:{value:0},
  ratio:{value:0},attack:{value:0},release:{value:0}
});
class MockAudioContext{
  constructor(){
    this.currentTime=10;
    this.state='suspended';
    this.destination=node();
    contexts.push(this);
  }
  createGain(){
    const gain=node();
    gain.gain={
      value:0,
      cancelScheduledValues(){},
      setTargetAtTime(value){this.value=value;gainTargets.push(value);}
    };
    return gain;
  }
  createBiquadFilter(){return node();}
  createDynamicsCompressor(){return node();}
  createBuffer(channels,length,sampleRate){
    const buffer={channels,length,sampleRate,copyToChannel(){}};
    buffers.push(buffer);
    return buffer;
  }
  createBufferSource(){
    const source={
      connect(){},disconnect(){},buffer:null,
      start(at){this.startedAt=at;}
    };
    sources.push(source);
    return source;
  }
  async resume(){this.state='running';}
}
globalThis.window={AudioContext:MockAudioContext};
const realSetInterval=globalThis.setInterval;
globalThis.setInterval=()=>1;
try{
  await import('../dist/music.mjs');
  assert.equal(sources.length,0,'No audio should play before the first click');
  assert.equal(contexts.length,0,'Web Audio should initialize only after interaction');
  assert.equal(typeof documentHandlers.click,'function','The page must have a click-to-play handler');

  documentHandlers.click({isTrusted:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sources.length,0,'Synthetic clicks must not start music');

  documentHandlers.click({isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(contexts[0]?.state,'running','Trusted first click must unlock Web Audio');
  assert(sources.length>=2,'The first click must schedule multiple groove bars');
  assert.equal(gainTargets.at(-1),.8,'The default output gain must be 80 percent');
  assert(Math.abs(sources[1].startedAt-sources[0].startedAt-240/74)<1e-8,
    'The original 74 BPM groove must be preserved');
  assert(buffers.every(buffer=>buffer.sampleRate===24000),'The sample rate must be preserved');

  const initial=sources.length;
  documentHandlers.click({isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sources.length,initial,'Later clicks must not retrigger the groove');
  assert.equal(contexts.length,1,'Only one AudioContext should be created');
  assert.equal(gainTargets.at(-1),.8,'Further clicks must not change volume');
  console.log('Silent load, first trusted click, hidden UI, fixed 80 percent volume, and one-time scheduling passed.');
}finally{
  globalThis.setInterval=realSetInterval;
}
