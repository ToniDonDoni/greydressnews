import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { GrooveSynth as LegacyGrooveSynth, BPM as LEGACY_BPM } from '../dist/legacy-groove.mjs';
import { SCORE_LEFT_HAND, SCORE_METADATA, SCORE_RIGHT_HAND } from '../dist/waltz-score.mjs';
import {
  WaltzSynth,
  SAMPLE_RATE,
  BAR_SECONDS,
  BPM,
  MIN_BPM,
  MAX_BPM,
  BEATS_PER_BAR,
  SECTION_A_BARS,
  SECTION_B_BARS,
  PHRASE_CYCLE_BARS,
} from '../dist/groove-core.mjs';

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
assert(html.includes('<script type="module" src="music.mjs"></script>'),'The procedural waltz must load as a module');
const musicSource = fs.readFileSync(path.join(dist,'music.mjs'),'utf8');
assert(musicSource.includes('legacy-groove.mjs'),'The original groove must remain available');
assert(musicSource.includes('music-theme-change'),'The alternate theme must be gesture-selectable');
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
for(const asset of ['assets/cafe.jpg','assets/lamp0.png','assets/lamp1.png','assets/windows.json','assets/ElGrayPimenovLeiterWindow2.png','assets/ElGrayPimenovLeiterWindow2-depth.png','assets/ElGrayPimenovLeiterWindow2-depth.json','groove-core.mjs','waltz-score.mjs','legacy-groove.mjs'])assert(fs.existsSync(path.join(dist,asset)),`Missing asset: ${asset}`);
const windows=JSON.parse(fs.readFileSync(path.join(dist,'assets/windows.json'),'utf8'));
assert(windows.length>0&&windows.every(w=>w.x>=0&&w.x<1024&&w.y>=0&&w.y<1024&&/^#[0-9a-f]{6}$/i.test(w.color)),'Invalid window data');

assert.equal(LEGACY_BPM, 74, 'The original groove tempo must be preserved');
const legacySynth = new LegacyGrooveSynth(112026, LEGACY_BPM);
assert.equal(legacySynth.barSeconds, 240 / 74, 'The original groove must retain its 4/4 bar length');
const legacyPlan = legacySynth.planBar(0);
assert(legacyPlan.events.some((event) => event.kind === 'kick'));
assert(legacyPlan.events.some((event) => event.kind === 'snare'));
assert(legacyPlan.events.some((event) => event.kind === 'bass'));
const legacyBar = legacySynth.renderBar(0);
assert.equal(legacyBar.left.length, legacyBar.right.length);
assert(legacyBar.left.some((sample) => Math.abs(sample) > 0.001),
  'The restored original groove must render audible audio');

const first=new WaltzSynth(112026),same=new WaltzSynth(112026),different=new WaltzSynth(112027);
const a=first.renderBar(0),b=same.renderBar(0),c=different.renderBar(0);
assert.deepEqual(a.left,b.left,'A fixed seed must reproduce the waveform');
assert.notDeepEqual(a.left,c.left,'Different seeds must create expressive timing variation');
assert.equal(a.left.length,a.right.length,'Stereo lengths must match');
assert(a.left.length>BAR_SECONDS*SAMPLE_RATE,'Bars must include overlapping piano and room tails');

assert.equal(BPM,165,'The score tempo must be used');
assert.equal(BEATS_PER_BAR,3,'The score meter must be 3/4');
assert.equal(BAR_SECONDS,180/165,'A bar must contain exactly three quarter-note beats');
assert.equal(SECTION_A_BARS,18,'The first score section must span about 20 seconds');
assert.equal(SECTION_B_BARS,15,'The second score section must span about 16 seconds');
assert.equal(PHRASE_CYCLE_BARS,33,'The two score sections must form a 33-bar cycle');

assert.equal(SCORE_METADATA.measures, PHRASE_CYCLE_BARS);
assert.equal(SCORE_METADATA.bpm, BPM);
assert.equal(SCORE_METADATA.meter, '3/4');
assert.equal(SCORE_METADATA.rightHandOctaveShiftFromMeasure, SECTION_A_BARS + 1);
assert.equal(SCORE_METADATA.rightHandOctaveShiftSemitones, 12);
assert.equal(SCORE_RIGHT_HAND.length, PHRASE_CYCLE_BARS);
assert.equal(SCORE_LEFT_HAND.length, PHRASE_CYCLE_BARS);
assert.equal(SCORE_RIGHT_HAND.reduce((sum, bar) => sum + bar.length, 0), 124,
  'The transcription must contain all 124 right-hand notes');
assert.equal(SCORE_LEFT_HAND.reduce((sum, bar) => sum + bar.length, 0), 157,
  'The transcription must contain all 157 left-hand notes');

const sectionProbe = new WaltzSynth(112026);
assert.equal(sectionProbe.planBar(0).section, 'A');
assert.equal(sectionProbe.planBar(17).section, 'A');
assert.equal(sectionProbe.planBar(18).section, 'B');
assert.equal(sectionProbe.planBar(32).section, 'B');
assert.equal(sectionProbe.planBar(33).section, 'A', 'The 33-measure score must loop');

const tuple = (event) => [event.note, event.beat, event.durationBeats, event.velocity];
for (let measure = 0; measure < PHRASE_CYCLE_BARS; measure++) {
  const plan = sectionProbe.planBar(measure);
  assert.deepEqual(
    plan.events.filter((event) => event.role === 'melody').map(tuple),
    SCORE_RIGHT_HAND[measure],
    'Right-hand transcription mismatch in measure ' + (measure + 1),
  );
  assert.deepEqual(
    plan.events.filter((event) => event.role !== 'melody').map(tuple),
    SCORE_LEFT_HAND[measure],
    'Left-hand transcription mismatch in measure ' + (measure + 1),
  );
  assert(plan.events.every((event) => event.kind === 'piano'),
    'The arrangement must contain piano only, with no hip-hop drum voices');
}

assert.equal(sectionProbe.planBar(0).events.filter((event) => event.role === 'melody').length, 4);
assert.equal(sectionProbe.planBar(0).events.some((event) => event.role === 'bass'), false,
  'The opening measure must preserve its right-hand-only entry');
assert.equal(sectionProbe.planBar(1).events.some((event) => event.role === 'bass'), true);

const secondOpening = sectionProbe.planBar(18);
assert.equal(secondOpening.events.some((event) => event.role === 'bass'), false,
  'Measure 19 begins with a sustained left-hand dyad');
assert.deepEqual(
  secondOpening.events.filter((event) => event.role === 'chord').map(tuple),
  [[54, 0, 3, 52], [58, 0, 3, 52]],
);
assert.deepEqual(
  sectionProbe.planBar(19).events.filter((event) => event.role === 'melody').map((event) => event.note),
  [89, 85, 82, 85, 82, 85],
);
assert.deepEqual(
  sectionProbe.planBar(19).events.filter((event) => event.role === 'bass').map((event) => event.note),
  [42],
);
assert.deepEqual(
  sectionProbe.planBar(25).events.filter((event) => event.role === 'melody').map((event) => event.note),
  [87, 82, 79, 82, 79, 82],
);
assert.deepEqual(
  sectionProbe.planBar(32).events.filter((event) => event.role === 'melody').map((event) => event.note),
  [89, 80, 87, 80, 85, 80],
);
assert.deepEqual(
  sectionProbe.planBar(33).events.filter((event) => event.role === 'melody').map(tuple),
  SCORE_RIGHT_HAND[0],
  'The first measure must follow the complete 33-measure transcription',
);

const synth=new WaltzSynth(112026),bars=PHRASE_CYCLE_BARS,total=Math.ceil((bars*BAR_SECONDS+3.25)*SAMPLE_RATE);
const left=new Float32Array(total),right=new Float32Array(total);
for(let bar=0;bar<bars;bar++){
  const out=synth.renderBar(bar),offset=Math.round(bar*BAR_SECONDS*SAMPLE_RATE);
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
  assert(Math.sqrt(energy/(end-start))>.004,'Unexpected silent waltz bar: '+bar);
}
assert(peak<.95,'The overlapping piano mix must retain signal headroom');
assert(synth.cache.size<=60,'The piano note cache must stay bounded');

// A new tempo changes the three-beat bar length and chord-beat spacing.
const slow=new WaltzSynth(112026,60),fast=new WaltzSynth(112026,120);
assert.equal(slow.barSeconds,3);
assert.equal(fast.barSeconds,1.5);
const slowChord=slow.planBar(1).events.find(e=>e.role==='chord');
const fastChord=fast.planBar(1).events.find(e=>e.role==='chord');
assert(slowChord.time>fastChord.time,'A lower BPM must delay waltz chord beats');
assert.equal(slow.renderBar(1).left.length,Math.ceil((slow.barSeconds+3.25)*SAMPLE_RATE));
assert.equal(fast.renderBar(1).left.length,Math.ceil((fast.barSeconds+3.25)*SAMPLE_RATE));
fast.setBpm(90);
assert.equal(fast.barSeconds,180/90,'Tempo changes must affect the next 3/4 bar');
assert.equal(fast.renderBar(2).left.length,Math.ceil((fast.barSeconds+3.25)*SAMPLE_RATE));
assert.throws(()=>fast.setBpm(0),RangeError);
assert.throws(()=>fast.setBpm(NaN),RangeError);
assert.throws(()=>fast.setBpm(181),RangeError);
console.log('Checked generated piano bars, 3/4 meter, alternating themes, bounded cache, and audio headroom. Peak: '+peak.toFixed(3)+'.');
