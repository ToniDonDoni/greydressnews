import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GrooveSynth,SAMPLE_RATE,BAR_SECONDS,BPM,MIN_BPM,MAX_BPM} from '../dist/groove-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ignored=new Set(['.git','.venv','__pycache__','node_modules','output']);
const binary=new Set(['.png','.jpg','.bmp','.wav','.pyc']);
let checked=0;
function inspect(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(ignored.has(entry.name)||/\.sw[op]$/.test(entry.name))continue;
    const target=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),`Unexpected symbolic link: ${entry.name}`);
    if(entry.isDirectory()){inspect(target);continue;}
    if(binary.has(path.extname(target)))continue;
    const text=fs.readFileSync(target,'utf8');
    assert(!/[^\x00-\x7F]/.test(text),`Non-English source characters in ${path.relative(root,target)}`);
    assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),`Email address in ${path.relative(root,target)}`);
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),`Private key in ${entry.name}`);
    checked++;
  }
}
inspect(root);
const dist=path.join(root,'dist'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert(html.includes('lang="en"'),'The document must declare English');
assert(html.includes('id="poster"')&&html.includes('id="depth-view"'),'The static image and depth canvas must exist');
assert(html.includes('assets/ElGrayPimenovLeiterWindow2.png'),'The reference image must be used');
for(const id of ['music','musicLabel','volume','soundbar','bpm','bpmValue'])
  assert(!html.includes(`id="${id}"`),`Unexpected audio control: ${id}`);
assert(!/<(?:button|input)\b/i.test(html),'The artwork must not display music controls');
assert(html.includes('<script type="module" src="music.mjs"></script>'),'The procedural groove must load as a module');
assert(!html.includes('id="bpm"'),'The depth-study page must not show tempo controls');
assert(!html.includes('scene.js'),'The page must not load the unrelated procedural scene');
assert(!html.includes('<header>')&&!html.includes('the cafe is open'),'Removed top labels must stay hidden');
const css=fs.readFileSync(path.join(dist,'style.css'),'utf8');
assert(!css.includes('.soundbar'),'Removed music controls must have no CSS');
assert(!css.includes("content:'74 BPM'"),'Mobile tempo must not be hard-coded in CSS');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(?:https?:|data:)/.test(match[1]))continue;
  assert(fs.existsSync(path.join(dist,match[1])),`Missing local resource: ${match[1]}`);
}
for(const asset of ['assets/cafe.jpg','assets/lamp0.png','assets/lamp1.png','assets/windows.json','assets/ElGrayPimenovLeiterWindow2.png','assets/ElGrayPimenovLeiterWindow2-depth.png','assets/ElGrayPimenovLeiterWindow2-depth.json','groove-core.mjs'])assert(fs.existsSync(path.join(dist,asset)),`Missing asset: ${asset}`);
const windows=JSON.parse(fs.readFileSync(path.join(dist,'assets/windows.json'),'utf8'));
assert(windows.length>0&&windows.every(w=>w.x>=0&&w.x<1024&&w.y>=0&&w.y<1024&&/^#[0-9a-f]{6}$/i.test(w.color)),'Invalid window data');

const first=new GrooveSynth(112026),same=new GrooveSynth(112026),different=new GrooveSynth(112027);
const a=first.renderBar(0),b=same.renderBar(0),c=different.renderBar(0);
assert.deepEqual(a.left,b.left,'A fixed seed must reproduce the waveform');
assert.notDeepEqual(a.left,c.left,'Different seeds must create variation');
assert.equal(a.left.length,a.right.length,'Stereo lengths must match');
assert(a.left.length>BAR_SECONDS*SAMPLE_RATE,'Bars must include overlapping tails');

const synth=new GrooveSynth(112026),bars=32,total=Math.ceil((bars*BAR_SECONDS+3)*SAMPLE_RATE);
const left=new Float32Array(total),right=new Float32Array(total);
let glitches=0,breakdowns=0;
for(let bar=0;bar<bars;bar++){
  const out=synth.renderBar(bar),offset=Math.round(bar*BAR_SECONDS*SAMPLE_RATE);
  glitches+=out.plan.events.filter(e=>e.kind==='glitch').length;
  breakdowns+=Number(out.plan.breakdown);
  for(let i=0;i<out.left.length&&offset+i<total;i++){left[offset+i]+=out.left[i];right[offset+i]+=out.right[i];}
}
let peak=0;
for(let i=0;i<total;i++){
  assert(Number.isFinite(left[i])&&Number.isFinite(right[i]),'Invalid generated audio sample');
  peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
}
for(let bar=0;bar<bars;bar++){
  const start=Math.round(bar*BAR_SECONDS*SAMPLE_RATE),end=Math.round((bar+1)*BAR_SECONDS*SAMPLE_RATE);
  let energy=0;for(let i=start;i<end;i++)energy+=left[i]**2;
  assert(Math.sqrt(energy/(end-start))>.015,`Unexpected silent bar: ${bar}`);
}
assert(peak<.95,'The overlapping mix must retain signal headroom');
assert(glitches>0&&breakdowns>0,'Phrase variation must occur');
assert(synth.cache.size<=40,'The note cache must stay bounded');

// A new tempo changes both scheduled bar length and note event spacing.
assert.equal(BPM,74);
assert.equal(MIN_BPM,50);
assert.equal(MAX_BPM,140);
const slow=new GrooveSynth(112026,60),fast=new GrooveSynth(112026,120);
assert.equal(slow.barSeconds,4);
assert.equal(fast.barSeconds,2);
const slowKick=slow.planBar(0).events.filter(e=>e.kind==='kick')[1];
const fastKick=fast.planBar(0).events.filter(e=>e.kind==='kick')[1];
assert(slowKick.time>fastKick.time,'A lower BPM must delay drum events');
assert.equal(slow.renderBar(1).left.length,Math.ceil((slow.barSeconds+3)*SAMPLE_RATE));
assert.equal(fast.renderBar(1).left.length,Math.ceil((fast.barSeconds+3)*SAMPLE_RATE));
fast.setBpm(90);
assert.equal(fast.barSeconds,240/90,'Tempo changes must affect the next bar');
assert.equal(fast.renderBar(2).left.length,Math.ceil((fast.barSeconds+3)*SAMPLE_RATE));
assert.throws(()=>fast.setBpm(0),RangeError);
assert.throws(()=>fast.setBpm(NaN),RangeError);
assert.throws(()=>fast.setBpm(141),RangeError);
console.log(`Checked ${checked} text files, all local assets, and ${bars} generated bars. Peak: ${peak.toFixed(3)}. No invalid samples.`);
