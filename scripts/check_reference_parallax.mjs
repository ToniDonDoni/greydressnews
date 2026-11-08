import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'specs/evidence/depth-report.json'),'utf8'));
const out=path.join(root,'output/reference-parallax-check');
fs.mkdirSync(out,{recursive:true});
const url=process.env.TEASER_URL||'http://127.0.0.1:8000/';
const errors=[];
const browser=await chromium.launch({
  headless:true,
  args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader'],
});
try{
  const page=await browser.newPage({viewport:{width:1200,height:820},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(String(error)));
  // Observe real Web Audio sources without replacing or mocking the synthesizer.
  await page.addInitScript(()=>{
    window.__grooveProbe={started:0,nonSilent:0,running:false,gainTargets:[]};
    const nativeSetTarget=AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime=function(value,...args){
      window.__grooveProbe.gainTargets.push(value);
      return nativeSetTarget.call(this,value,...args);
    };
    const nativeStart=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      const data=this.buffer?.getChannelData(0);
      if(data){
        let magnitude=0;
        for(let i=0;i<data.length;i+=256)magnitude+=Math.abs(data[i]);
        if(magnitude>.01)window.__grooveProbe.nonSilent++;
      }
      window.__grooveProbe.started++;
      return nativeStart.apply(this,args);
    };
    const nativeResume=AudioContext.prototype.resume;
    AudioContext.prototype.resume=async function(...args){
      const result=await nativeResume.apply(this,args);
      window.__grooveProbe.running=this.state==='running';
      return result;
    };
  });
  await page.goto(url);
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#depth-view');
    const loading=document.querySelector('#loading');
    return canvas?.width>0&&canvas?.height>0&&loading?.classList.contains('hidden');
  });

  const browserDepth=await page.evaluate(async samples=>{
    const image=new Image();
    image.src='assets/ElGrayPimenovLeiterWindow2-depth.png';
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');
    context.drawImage(image,0,0);
    const values={};
    for(const [name,sample] of Object.entries(samples)){
      const [x,y]=sample.xy;
      values[name]={actual:context.getImageData(x,y,1,1).data[0],expected:sample.expected_depth};
    }
    return {size:[canvas.width,canvas.height],values};
  },evidence.sample_points);
  assert.deepEqual(browserDepth.size,[1024,574],'The browser loaded an unexpected depth-map size');
  for(const [name,sample] of Object.entries(browserDepth.values)){
    assert.equal(sample.actual,sample.expected,name+' has an incorrect browser-loaded depth value');
  }

  const painting=await page.locator('#painting').boundingBox();
  assert(painting,'The painting container is not visible');
  async function capture(name,normalizedX){
    await page.mouse.move(painting.x+painting.width*(normalizedX+1)/2,painting.y+painting.height*.5);
    await page.waitForTimeout(900);
    const screenshot=await page.locator('#depth-view').screenshot({path:path.join(out,name+'.png')});
    await page.evaluate(async({key,encoded})=>{
      const image=new Image();
      image.src='data:image/png;base64,'+encoded;
      await image.decode();
      const copy=document.createElement('canvas');
      copy.width=image.naturalWidth;copy.height=image.naturalHeight;
      const context=copy.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,0,0);
      window.__depthCaptures=window.__depthCaptures||{};
      window.__depthCaptures[key]={width:copy.width,height:copy.height,data:context.getImageData(0,0,copy.width,copy.height).data};
    },{key:name,encoded:screenshot.toString('base64')});
  }
  await capture('center',0);
  await capture('left',-.98);
  await capture('right',.98);

  const measured=await page.evaluate(samples=>{
    const left=window.__depthCaptures.left,right=window.__depthCaptures.right;
    const width=left.width,height=left.height;
    function luminance(frame,x,y){
      const i=(y*width+x)*4;
      return frame.data[i]*.299+frame.data[i+1]*.587+frame.data[i+2]*.114;
    }
    function score(sample,dx,radius){
      const cx=Math.round(sample.xy[0]*width/1024);
      const cy=Math.round(sample.xy[1]*height/574);
      let total=0,count=0;
      for(let oy=-radius;oy<=radius;oy++){
        const y=cy+oy;
        if(y<0||y>=height)continue;
        for(let ox=-radius;ox<=radius;ox++){
          const x=cx+ox,shifted=x+dx;
          if(x<0||x>=width||shifted<0||shifted>=width)continue;
          total+=Math.abs(luminance(left,x,y)-luminance(right,shifted,y));
          count++;
        }
      }
      return count?total/count:Infinity;
    }
    function findShift(sample){
      let best={dx:0,score:Infinity};
      for(let dx=-125;dx<=125;dx++){
        const value=score(sample,dx,18);
        if(value<best.score)best={dx,score:value};
      }
      return {signed_px:best.dx,absolute_px:Math.abs(best.dx),mean_absolute_error:Math.round(best.score*100)/100};
    }
    return {
      far:findShift(samples.left_house),
      midground:findShift(samples.presenter),
      near:findShift(samples.glass),
    };
  },evidence.sample_points);

  assert(measured.near.absolute_px>measured.midground.absolute_px+20,
    'Near glass does not move sufficiently more than the midground');
  assert(measured.midground.absolute_px>measured.far.absolute_px+8,
    'Midground does not move sufficiently more than the far plane');

  // Confirm unobtrusive first-click playback through the actual browser Web Audio engine.
  for(const id of ['music','musicLabel','volume','soundbar','bpm','bpmValue']){
    assert.equal(await page.locator('#'+id).count(),0,'Audio control must not exist: '+id);
  }
  assert.equal(await page.locator('button,input[type="range"]').count(),0,
    'The image must not display any playback or volume control');
  const initialProbe=await page.evaluate(()=>window.__grooveProbe);
  assert.equal(initialProbe.started,0,'The groove must remain silent until user interaction');

  await page.mouse.click(painting.x+painting.width*.5,painting.y+painting.height*.5);
  await page.waitForFunction(()=>window.__grooveProbe?.running
    &&window.__grooveProbe.started>=2
    &&window.__grooveProbe.gainTargets.some(value=>Math.abs(value-.8)<1e-8));
  const audioProbe=await page.evaluate(()=>window.__grooveProbe);
  assert(audioProbe.started>=2,'The groove scheduler did not start Web Audio buffer sources');
  assert(audioProbe.nonSilent>=2,'The generated audio buffers were silent');
  assert(audioProbe.gainTargets.some(value=>Math.abs(value-.8)<1e-8),
    'The audio output must use 80 percent default gain');
  await page.mouse.click(painting.x+painting.width*.62,painting.y+painting.height*.42);
  await page.waitForTimeout(60);
  const afterSecondClick=await page.evaluate(()=>window.__grooveProbe);
  assert.equal(afterSecondClick.started,audioProbe.started,
    'Later artwork clicks must not restart the groove');

  const report={
    groove:{
      audio_probe:audioProbe,
      no_audio_before_interaction:true,
      no_visible_audio_controls:true,
      first_trusted_page_click_starts:true,
      later_page_click_does_not_restart:true,
      default_volume_gain:.8,
    },
    passed:true,
    camera_positions:[-.98,.98],
    browser_depth_samples:browserDepth,
    measured_displacement_px:measured,
    expected_displacement_px:evidence.expected_displacement_between_camera_extremes_px,
    ordering:'near > midground > far',
    page_errors:errors,
  };
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  await browser.close();
}
