import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'output/parallax-check');fs.mkdirSync(out,{recursive:true});
const url=process.env.TEASER_URL||'http://127.0.0.1:9892/';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const errors=[],requests=[];
try{
  let context=await browser.newContext({viewport:{width:1100,height:1000},deviceScaleFactor:1});
  let page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(url);await page.waitForFunction(()=>window.teaserDepth?.status().textureVersion>0);
  assert.equal(await page.locator('#music').getAttribute('aria-pressed'),'false','Page load should be silent');
  assert.equal(await page.locator('#volume').isVisible(),false,'Volume should start hidden');
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#music').getAttribute('aria-pressed')==='true');
  assert(await page.locator('#volume').isVisible(),'First page click did not reveal volume');
  await page.getByRole('button',{name:'Pause hip-hop',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#music').getAttribute('aria-pressed')==='false');
  const firstArt=await page.locator('#painting').boundingBox();
  await page.mouse.click(firstArt.x+firstArt.width*.5,firstArt.y+firstArt.height*.4);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#music').getAttribute('aria-pressed'),'false','Later page click undid a manual pause');
  const clean=await page.locator('#scene').evaluate(c=>c.toDataURL());
  const box=await page.locator('#painting').boundingBox();
  await page.mouse.move(box.x+box.width*.08,box.y+box.height*.5);await page.waitForTimeout(450);
  const left=await page.locator('#depth-view').screenshot({path:path.join(out,'left.png')});
  const leftState=await page.evaluate(()=>teaserDepth.status());
  assert(leftState.x<-.7,'Pointer did not move camera left');
  await page.mouse.move(box.x+box.width*.92,box.y+box.height*.5);await page.waitForTimeout(450);
  const right=await page.locator('#depth-view').screenshot({path:path.join(out,'right.png')});
  assert((await page.evaluate(()=>teaserDepth.status())).x>.7,'Pointer did not move camera right');
  assert.equal(await page.locator('#scene').evaluate(c=>c.toDataURL()),clean,'Warped output leaked into the source painting');
  // Compare image pixels inside the cat, excluding the controls and slider.
  const changed=await page.evaluate(async({a,b})=>{
    async function decode(encoded){const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return {width:img.width,height:img.height,pixels:g.getImageData(0,0,img.width,img.height).data};}
    const one=await decode(a),two=await decode(b);let changed=0,total=0;
    for(let y=Math.floor(one.height*.2);y<one.height*.72;y++)for(let x=Math.floor(one.width*.18);x<one.width*.65;x++){
      const i=(y*one.width+x)*4;let d=0;for(let k=0;k<3;k++)d+=Math.abs(one.pixels[i+k]-two.pixels[i+k]);if(d>30)changed++;total++;
    }
    return changed/total;
  },{a:left.toString('base64'),b:right.toString('base64')});
  assert(changed>.05,'The cat image did not visibly change with the viewpoint');
  const dial=page.locator('#depth-toggle');
  await dial.press('Home');for(let i=0;i<4;i++)await dial.press('ArrowRight');
  await page.waitForTimeout(350);
  assert(Math.abs((await page.evaluate(()=>teaserDepth.status())).x-.6)<.03,'Dial arrow keys did not update camera');
  await dial.press('Home');
  const dialBox=await dial.boundingBox();
  await page.mouse.move(dialBox.x+dialBox.width/2,dialBox.y+dialBox.height/2);await page.mouse.down();
  await page.mouse.move(dialBox.x+dialBox.width/2+85,dialBox.y+dialBox.height/2,{steps:5});
  assert((await page.evaluate(()=>teaserDepth.status())).targetX>.6,'Mouse drag did not turn the dial');
  await page.mouse.up();await page.waitForTimeout(450);
  assert((await page.evaluate(()=>teaserDepth.status())).enabled,'Dial drag accidentally toggled 3D off');
  assert(Math.abs((await page.evaluate(()=>teaserDepth.status())).x)<.02,'Mouse dial release did not center');
  // The original lamp click still reaches the 2D source under the overlay.
  const sceneBox=await page.locator('#scene').boundingBox();
  await page.mouse.click(sceneBox.x+sceneBox.width*167/1024,sceneBox.y+sceneBox.height*150/1024);
  assert.notEqual(await page.locator('#scene').evaluate(c=>c.toDataURL()),clean,'Lamp toggle no longer changes the scene');
  await page.locator('#depth-toggle').click();
  assert.equal(await page.locator('#depth-view').isVisible(),false);
  await page.locator('#depth-toggle').click();
  assert.equal(await page.locator('#depth-view').isVisible(),true);
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();
  const before=await page.evaluate(()=>({time:performance.now(),...teaserDepth.status()}));
  await page.waitForTimeout(3000);
  const after=await page.evaluate(()=>({time:performance.now(),...teaserDepth.status()}));
  const measuredDisplayFps=(after.displayFrames-before.displayFrames)*1000/(after.time-before.time);
  assert(after.sourceFrames>before.sourceFrames,'The original animation stopped');
  assert(after.textureVersion>=before.textureVersion,'Live texture did not update');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Play hip-hop',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#soundbar').classList.contains('playing'));
  for(const [width,height] of [[390,844],[320,844],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    const bounds=await page.locator('.depth-control').boundingBox(),art=await page.locator('#painting').boundingBox();
    assert(bounds.width===58&&bounds.height>=44,'Dial touch target changed');
    assert(Math.abs(bounds.x+bounds.width/2-art.x-art.width/2)<1,'Dial is not centered');
    assert(art.y+art.height-bounds.y-bounds.height<=16,'Dial is not at the bottom');
    assert(bounds.x>=0&&bounds.x+bounds.width<=width,'Depth controls overflow the phone');
    for(const selector of ['.soundbar','.toolbar','.tempo-control']){
      const other=await page.locator(selector).boundingBox();
      const overlap=bounds.x<other.x+other.width&&bounds.x+bounds.width>other.x&&bounds.y<other.y+other.height&&bounds.y+bounds.height>other.y;
      assert(!overlap,`Dial overlaps ${selector} at ${width}x${height}`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,`phone-${width}.png`),fullPage:true});
  }
  assert.equal(requests.filter(r=>r.endsWith('/assets/cafe-depth.png')).length,1,'Depth was fetched more than once');
  assert(requests.every(r=>new URL(r).origin===new URL(url).origin),'An external runtime request was made');
  await context.close();

  // Use real browser touch dispatch, so scroll arbitration can cancel pointers.
  context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.__touchCancels=0;document.addEventListener('pointercancel',()=>window.__touchCancels++);});
  await page.goto(url);await page.waitForFunction(()=>window.teaserDepth?.status().textureVersion>0);
  assert.equal(await page.locator('#music').getAttribute('aria-pressed'),'false');
  await page.touchscreen.tap(40,40);
  await page.waitForFunction(()=>document.querySelector('#music').getAttribute('aria-pressed')==='true');
  assert(await page.locator('#volume').isVisible(),'First touch on empty page space did not start music and reveal volume');
  await page.getByRole('button',{name:'Pause animation',exact:true}).tap();
  assert.equal(await page.locator('#music').getAttribute('aria-pressed'),'true','Later animation control tap paused music');
  const touchSession=await context.newCDPSession(page);
  const touchBox=await page.locator('#painting').boundingBox();
  const from={x:touchBox.x+touchBox.width*.2,y:touchBox.y+touchBox.height*.35};
  const to={x:touchBox.x+touchBox.width*.8,y:touchBox.y+touchBox.height*.65};
  const touch=async(type,point)=>touchSession.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{...point,id:1,radiusX:4,radiusY:4}]:[]});
  await touch('touchStart',from);
  for(let i=1;i<=10;i++){
    await touch('touchMove',{x:from.x+(to.x-from.x)*i/10,y:from.y+(to.y-from.y)*i/10});
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(180);
  const dragged=await page.evaluate(()=>({state:teaserDepth.status(),cancels:window.__touchCancels}));
  assert(dragged.state.targetX>.5&&dragged.state.targetY>.2,`Touch drag lost its endpoint: ${JSON.stringify(dragged)}`);
  assert(dragged.state.x>.35&&dragged.state.y>.1,'Touch drag did not visibly turn the painting');
  assert.equal(dragged.cancels,0,'Browser scrolling cancelled the active camera drag');
  await page.screenshot({path:path.join(out,'touch-drag.png'),fullPage:true});
  await touch('touchEnd');await page.waitForTimeout(500);
  let touchState=await page.evaluate(()=>teaserDepth.status());
  assert(Math.abs(touchState.x)<.02&&Math.abs(touchState.y)<.02,'Finger release did not return the view to center');
  // A cancelled gesture must also release capture and return to center.
  await touch('touchStart',from);await touch('touchMove',to);await touch('touchCancel');await page.waitForTimeout(500);
  touchState=await page.evaluate(()=>teaserDepth.status());
  assert(Math.abs(touchState.x)<.02&&Math.abs(touchState.y)<.02,'Cancelled gesture left the camera stuck');
  // Drag the small dial beyond its bounds; capture retains the same gesture.
  const touchDial=await page.locator('#depth-toggle').boundingBox();
  const dialFrom={x:touchDial.x+touchDial.width/2,y:touchDial.y+touchDial.height/2};
  await touch('touchStart',dialFrom);
  for(let i=1;i<=8;i++){await touch('touchMove',{x:dialFrom.x-i*10,y:dialFrom.y});await page.waitForTimeout(20);}
  assert((await page.evaluate(()=>teaserDepth.status())).targetX<-.6,'Finger did not drag the 3D dial');
  await touch('touchEnd');await page.waitForTimeout(450);
  touchState=await page.evaluate(()=>teaserDepth.status());
  assert(touchState.enabled,'Finger drag accidentally toggled 3D');
  assert(Math.abs(touchState.x)<.02,'Finger dial release did not center');
  await page.locator('#depth-toggle').tap();
  assert.equal(await page.locator('#depth-view').isVisible(),false,'Touch toggle stopped working');
  assert.notEqual(await page.locator('#scene').evaluate(c=>getComputedStyle(c).touchAction),'none','Depth off still blocks ordinary page gestures');
  await context.close();

  // Directly tapping the music button first must not start and immediately pause.
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.teaserDepth?.status().ready);
  await page.getByRole('button',{name:'Play hip-hop',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('#music').getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'Pause hip-hop',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('#music').getAttribute('aria-pressed')==='false');
  await page.touchscreen.tap(40,40);await page.waitForTimeout(150);
  assert.equal(await page.locator('#music').getAttribute('aria-pressed'),'false','Later touch restarted manually paused music');
  await context.close();

  context=await browser.newContext({viewport:{width:800,height:900},reducedMotion:'reduce'});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.teaserDepth?.status().ready);
  assert.equal((await page.evaluate(()=>teaserDepth.status())).enabled,false,'Reduced motion should start with parallax off');
  await page.locator('#depth-toggle').click();
  await page.waitForFunction(()=>teaserDepth.status().textureVersion>0);
  await context.close();

  context=await browser.newContext();
  await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args)};});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#scene').classList.contains('ready'));
  assert((await page.evaluate(()=>teaserDepth.status())).error);
  assert.equal(await page.locator('#depth-view').isVisible(),false);
  assert.equal(await page.locator('#depth-toggle').isDisabled(),true);
  await context.close();assert.deepEqual(errors,[]);
  const report={passed:true,measuredDisplayFps,changedCatPixelFraction:changed,singleStaticDepthRequest:true,noExternalRuntimeRequests:true,sourcePaintingUnwarped:true,animationAndLampPreserved:true,reducedMotion:true,webglFallback:true,phoneWidths:[390,320],touchDrag:true,touchReleaseAndCancel:true,touchDial:true,dialKeyboard:true,dialBottomCenter:true,noControlOverlap:true,firstClickMusic:true,firstTouchMusic:true,manualMusicPausePreserved:true,errors};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
