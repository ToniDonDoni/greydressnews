import assert from 'node:assert/strict';

const sources=[],buffers=[],contexts=[],gainTargets=[],documentHandlers={},calls=[];
globalThis.document={
  getElementById(){throw Error('Audio must not depend on visible controls');},
  addEventListener(name,handler){documentHandlers[name]=handler;}
};
const node=()=>({
  connect(){return this;},disconnect(){},
  frequency:{value:0},Q:{value:0},threshold:{value:0},knee:{value:0},
  ratio:{value:0},attack:{value:0},release:{value:0}
});
// TODO fix test always PASS because of mocking
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
      start(at){this.startedAt=at;calls.push('source.start');}
    };
    sources.push(source);
    return source;
  }
  resume(){
    calls.push('resume');
    this.state='running';
    return Promise.resolve();
  }
}
globalThis.window={AudioContext:MockAudioContext};
const realSetInterval=globalThis.setInterval;
globalThis.setInterval=()=>1;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
try{
  await import('../dist/music.mjs');
  assert.equal(sources.length,0,'Loading the page must not start sound');
  assert.equal(contexts.length,0,'AudioContext must await a user gesture');
  for(const name of ['pointerdown','touchstart','click']){
    assert.equal(typeof documentHandlers[name],'function',name+' must support playback');
  }

  documentHandlers.click({isTrusted:false});
  await flush();
  assert.equal(sources.length,0,'Synthetic gestures must not start sound');

  documentHandlers.pointerdown({isTrusted:true});
  assert.deepEqual(calls.slice(0,2),['resume','source.start'],
    'Audio resume and source start must run synchronously inside the user gesture');
  await flush();
  assert.equal(contexts[0]?.state,'running');
  assert(sources.length>=2,'The first gesture must schedule multiple groove bars');
  assert.equal(gainTargets.at(-1),.8,'The default output gain must be 80 percent');
  assert(Math.abs(sources[1].startedAt-sources[0].startedAt-240/74)<1e-8,
    'The original 74 BPM groove must be preserved');
  assert(buffers.every(buffer=>buffer.sampleRate===24000),'The sample rate must be preserved');

  const initial=sources.length;
  documentHandlers.touchstart({isTrusted:true});
  documentHandlers.click({isTrusted:true});
  await flush();
  assert.equal(sources.length,initial,'Subsequent gesture events must not restart the groove');
  assert.equal(contexts.length,1,'Only one AudioContext should exist');

  // Simulate a mobile device that sends touchstart but no click event.
  sources.length=0;contexts.length=0;gainTargets.length=0;calls.length=0;
  await import('../dist/music.mjs?touch-only');
  documentHandlers.touchstart({isTrusted:true});
  assert.deepEqual(calls.slice(0,2),['resume','source.start'],
    'A standalone touchstart must unlock audio before the handler returns');
  await flush();
  assert(sources.length>=2,'Touchstart alone must start actual audio');
  assert.equal(gainTargets.at(-1),.8,'Touch-only playback must use 80 percent gain');
  console.log('Trusted pointer and touch startup, synchronous mobile audio unlock, fixed gain, and single scheduling passed.');
}finally{
  globalThis.setInterval=realSetInterval;
}
