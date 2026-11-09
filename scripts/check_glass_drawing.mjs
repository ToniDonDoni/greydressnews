import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'output/glass_drawing_check');
fs.mkdirSync(out,{recursive:true});
const url=process.env.TEASER_URL||'http://127.0.0.1:8000/';
const errors=[];

function inspectInk(){
  const canvases={};
  for(const id of ['glass-ink','glass-ink-live']){
    const canvas=document.getElementById(id);
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const glassLeft=1240/1920*canvas.width, glassBottom=970/1077*canvas.height;
    let count=0,outside=0,maxAlpha=0,r=0,g=0,b=0,minX=canvas.width,maxX=-1,minY=canvas.height,maxY=-1;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        const offset=(y*canvas.width+x)*4;
        const alpha=data[offset+3];
        if(!alpha)continue;
        count++;
        if(x<glassLeft||y>glassBottom)outside++;
        if(x<minX)minX=x;
        if(x>maxX)maxX=x;
        if(y<minY)minY=y;
        if(y>maxY)maxY=y;
        if(alpha>maxAlpha){
          maxAlpha=alpha;r=data[offset];g=data[offset+1];b=data[offset+2];
        }
      }
    }
    canvases[id]={
      count,outside,max_alpha:maxAlpha,
      color:[r,g,b],
      bounds:count?[minX,minY,maxX,maxY]:null,
    };
  }
  return canvases;
}

async function waitForReady(page){
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#depth-view');
    const loading=document.querySelector('#loading');
    return canvas?.width>0&&canvas?.height>0&&loading?.classList.contains('hidden');
  });
}

async function transformOf(page){
  return page.evaluate(()=>{
    const layer=document.querySelector('#ink-layer');
    const matrix=new DOMMatrixReadOnly(getComputedStyle(layer).transform);
    return {
      a:matrix.a,d:matrix.d,e:matrix.e,f:matrix.f,
      camera:window.parallaxView.x,
      width:document.querySelector('#painting').getBoundingClientRect().width,
      height:document.querySelector('#painting').getBoundingClientRect().height,
      near_shift_uv:window.parallaxView.nearShiftUv,
    };
  });
}

function makeLetterEPath(box, centerX=.82, centerY=.46, wobble=.0){
  const width=Math.min(box.width,box.height)*.34;
  const height=width*.88;
  const local=[];
  for(let step=0;step<=32;step++){
    const t=step/32;
    local.push({
      x:.95+(.08-.95)*t,
      y:.5+wobble*.035*Math.sin(Math.PI*2*t),
    });
  }
  for(let step=1;step<=64;step++){
    const angle=Math.PI+(4*Math.PI/3)*step/64;
    const radius=.42*(1+wobble*.12*Math.sin(3*angle));
    local.push({
      x:.5+radius*Math.cos(angle),
      y:.5+radius*Math.sin(angle),
    });
  }
  return local.map(point=>({
    x:centerX+(point.x-.5)*width/box.width,
    y:centerY+(point.y-.5)*height/box.height,
  }));
}

async function drawMousePath(page, points, box){
  const x=normalized=>box.x+box.width*normalized;
  const y=normalized=>box.y+box.height*normalized;
  await page.mouse.move(x(points[0].x),y(points[0].y));
  await page.mouse.down();
  for(const point of points.slice(1)){
    await page.mouse.move(x(point.x),y(point.y));
  }
  await page.mouse.up();
}

const browser=await chromium.launch({
  headless:true,
  args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader'],
});
try{
  const page=await browser.newPage({viewport:{width:1200,height:820},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url);
  await waitForReady(page);

  assert.equal(await page.locator('#glass-ink').count(),1,'The ink canvas must exist');
  assert.equal(await page.locator('#glass-ink-live').count(),1,'The live ink canvas must exist');
  const glass=await page.evaluate(()=>window.glassInk.glass);
  assert.deepEqual(glass,{left:1240,top:0,right:1920,bottom:970},'Unexpected glass rectangle');

  const painting=await page.locator('#painting').boundingBox();
  assert(painting,'The painting container is not visible');
  const x=normalized=>painting.x+painting.width*normalized;
  const y=normalized=>painting.y+painting.height*normalized;

  await page.mouse.move(x(.72),y(.45));
  await page.waitForTimeout(700);
  const before=await transformOf(page);
  assert(before.camera>.3,'The camera did not follow the pointer into the glass');
  assert(Math.abs(before.a-1.0526316)<1e-4,'The ink layer must use the shader 5 percent zoom');
  assert(Math.abs(before.f+painting.height*.0263158)<.75,'The ink layer vertical offset is wrong');

  await page.mouse.down();
  for(let step=1;step<=30;step++){
    await page.mouse.move(x(.72+.006*step),y(.45+.001*step));
  }
  await page.waitForTimeout(80);
  const during=await page.evaluate(()=>({
    camera:window.parallaxView.x,
    active:window.glassInk.active,
    live:document.querySelector('#glass-ink-live').getContext('2d').getImageData(0,0,1920,1077).data.some(value=>value),
  }));
  assert(during.active,'The stroke must stay active while the pointer is down');
  assert(during.live,'The live stroke canvas must contain ink during the gesture');
  assert(during.camera>before.camera+.1,'Drawing on the glass must also move the camera');
  await page.mouse.up();
  await page.waitForTimeout(600);

  const after=await transformOf(page);
  const expectedShift=(after.camera-before.camera)*after.near_shift_uv/.95*after.width;
  const actualShift=after.e-before.e;
  assert(Math.abs(actualShift-expectedShift)<2,
    `Ink layer shift ${actualShift.toFixed(2)}px does not match near-plane shift ${expectedShift.toFixed(2)}px`);

  const desktopInk=await page.evaluate(inspectInk);
  const committed=desktopInk['glass-ink'];
  assert(committed.count>1000,'The drawn stroke is missing or too small');
  assert.equal(desktopInk['glass-ink-live'].count,0,'The live canvas must be cleared after the stroke');
  assert.equal(committed.outside,0,'Ink must not appear outside the glass');
  assert(committed.max_alpha>=20&&committed.max_alpha<=100,
    `Stroke alpha ${committed.max_alpha} is outside the intended translucent range`);
  const [red,green,blue]=committed.color;
  assert(Math.max(red,green,blue)-Math.min(red,green,blue)<=30,'The stroke must be neutral/cool gray');
  assert(blue>=red,'The stroke must not be warmer than the glass');
  assert(committed.bounds[2]-committed.bounds[0]>100,'The stroke is not continuous across the gesture');

  await page.locator('#painting').screenshot({path:path.join(out,'desktop-drawn.png')});

  // Tap: a single contact leaves a dot.
  await page.evaluate(()=>window.glassInk.clear());
  await page.mouse.move(x(.82),y(.4));
  await page.waitForTimeout(500);
  const tapImage=await page.evaluate(({clientX,clientY})=>window.glassInk.imagePoint(clientX,clientY),{
    clientX:x(.82),clientY:y(.4),
  });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  const tapInk=await page.evaluate(inspectInk);
  const tapCenterAlpha=await page.evaluate(({imageX,imageY})=>{
    const canvas=document.querySelector('#glass-ink');
    return canvas.getContext('2d').getImageData(
      Math.round(imageX/1920*canvas.width),
      Math.round(imageY/1077*canvas.height),
      1,1).data[3];
  },{imageX:tapImage.x,imageY:tapImage.y});
  assert(tapInk['glass-ink'].count>20,'A tap on the glass must leave a dot');
  assert(tapInk['glass-ink'].bounds[2]-tapInk['glass-ink'].bounds[0]<60,'A tap must not draw a line');
  assert(tapCenterAlpha>0,'The tap ink is not registered under the pointer');

  // A vertical stroke crossing the ticker must be clipped at y=970.
  await page.evaluate(()=>window.glassInk.clear());
  await page.mouse.move(x(.82),y(.84));
  await page.mouse.down();
  for(let step=1;step<=12;step++)await page.mouse.move(x(.82),y(.84+.01*step));
  await page.mouse.up();
  await page.waitForTimeout(300);
  const clipped=await page.evaluate(inspectInk);
  assert(clipped['glass-ink'].count>20,'The clipped stroke disappeared');
  assert.equal(clipped['glass-ink'].outside,0,'Ink crossed the glass or ticker boundary');

  // Pointer gestures outside the glass pan without drawing.
  await page.evaluate(()=>window.glassInk.clear());
  const outsideBefore=await page.evaluate(()=>window.parallaxView.x);
  await page.mouse.move(x(.35),y(.5));
  await page.mouse.down();
  for(let step=1;step<=10;step++)await page.mouse.move(x(.35+.02*step),y(.5));
  await page.mouse.up();
  await page.waitForTimeout(250);
  const outsideInk=await page.evaluate(inspectInk);
  const outsideAfter=await page.evaluate(()=>window.parallaxView.x);
  assert.equal(outsideInk['glass-ink'].count,0,'A gesture outside the glass must not draw');
  assert(Math.abs(outsideAfter-outsideBefore)>.1,'A gesture outside the glass must still pan the view');

  // The recognizer accepts a rough lowercase e, not the old circle gesture.
  const letterE = makeLetterEPath(painting,.82,.46,.65);
  const roughLetterE = makeLetterEPath(painting,.82,.46,.9);
  const closedCircle = Array.from({length:49},(_,index)=>{
    const angle=Math.PI*2*index/48;
    const radius=Math.min(painting.width,painting.height)*.12;
    return {
      x:.82+Math.cos(angle)*radius/painting.width,
      y:.46+Math.sin(angle)*radius/painting.height,
    };
  });
  const outsideLetterE = makeLetterEPath(painting,.42,.46,.25);
  const openLine = Array.from({length:24},(_,index)=>({
    x:.75+index*.003,
    y:.46+(index%2)*.003,
  }));
  const irregularLoop = Array.from({length:49},(_,index)=>{
    const angle=Math.PI*2*index/48;
    const radius=Math.min(painting.width,painting.height)*.12*(1+.55*Math.sin(3*angle));
    return {
      x:.82+Math.cos(angle)*radius/painting.width,
      y:.46+Math.sin(angle)*radius/painting.height,
    };
  });
  const recognition = await page.evaluate(({letterE,roughLetterE,closedCircle,outsideLetterE,openLine,irregularLoop})=>({
    letterE:window.glassInk.recognizeMusicLetterE(letterE),
    roughLetterE:window.glassInk.recognizeMusicLetterE(roughLetterE),
    closedCircle:window.glassInk.recognizeMusicLetterE(closedCircle),
    outsideLetterE:window.glassInk.recognizeMusicLetterE(outsideLetterE),
    openLine:window.glassInk.recognizeMusicLetterE(openLine),
    irregularLoop:window.glassInk.recognizeMusicLetterE(irregularLoop),
  }),{letterE,roughLetterE,closedCircle,outsideLetterE,openLine,irregularLoop});
  assert.equal(recognition.letterE,true,'A handwritten lowercase e on the rain glass must be recognized');
  assert.equal(recognition.roughLetterE,true,'A loosely drawn lowercase e must be accepted');
  assert.equal(recognition.closedCircle,false,'The previous circle gesture must no longer select the waltz');
  assert.equal(recognition.outsideLetterE,false,'A letter outside the glass must be ignored');
  assert.equal(recognition.openLine,false,'An open line must not change the music');
  assert.equal(recognition.irregularLoop,false,'An irregular loop without an e crossbar must be ignored');

  assert.equal(await page.evaluate(() => window.musicPlayback.theme), 'legacy',
    'The original groove must remain the default theme');
  assert.equal(await page.evaluate(() => window.glassInk.musicHintVisible), false,
    'The house hint must be hidden by default');

  await page.mouse.dblclick(x(0.52), y(0.45), { delay: 90 });
  assert.equal(await page.evaluate(() => window.glassInk.musicHintVisible), false,
    'Double-clicking the presenter must not reveal the house hint');

  const desktopLetterE = makeLetterEPath(painting,.82,.46,.65);
  await drawMousePath(page,desktopLetterE,painting);
  await page.waitForFunction(() => window.musicPlayback?.theme === 'waltz');
  assert.equal(await page.evaluate(() => window.glassInk.musicHintVisible), false,
    'The waltz must switch while the optional hint has never been shown');
  const letterEInk = await page.evaluate(inspectInk);
  assert(letterEInk['glass-ink'].count > 1000, 'The selection letter must leave a glass-ink mark');
  assert.equal(letterEInk['glass-ink'].outside, 0, 'The selection letter must remain clipped to the glass');
  await page.locator('#painting').screenshot({
    path: path.join(out, 'desktop-music-letter-e-without-hint.png'),
  });

  // The house double-click only reveals a visual letter; it does not unlock music.
  const hintPage = await browser.newPage({
    viewport: { width: 1200, height: 820 },
    deviceScaleFactor: 1,
  });
  hintPage.on('pageerror', error => errors.push(String(error)));
  await hintPage.goto(url);
  await waitForReady(hintPage);
  const hintPainting = await hintPage.locator('#painting').boundingBox();
  assert(hintPainting, 'The hint artwork is not visible');
  const hx = normalized => hintPainting.x + hintPainting.width * normalized;
  const hy = normalized => hintPainting.y + hintPainting.height * normalized;
  assert.equal(await hintPage.evaluate(() => window.musicPlayback.theme), 'legacy',
    'The original groove must also be the default on the hint page');
  await hintPage.mouse.dblclick(hx(0.52), hy(0.45), { delay: 90 });
  assert.equal(await hintPage.evaluate(() => window.glassInk.musicHintVisible), false,
    'Double-clicking the presenter must not reveal the house hint');
  await hintPage.mouse.dblclick(hx(0.22), hy(0.45), { delay: 90 });
  await hintPage.waitForFunction(() => window.glassInk?.musicHintVisible === true);
  const hintStats = await hintPage.evaluate(() => {
    const canvas = document.querySelector('#music-hint');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let color = [0, 0, 0];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (!data[offset + 3]) continue;
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (data[offset + 3] > 100) color = data.slice(offset, offset + 3);
      }
    }
    const alphaAt = (x, y) => data[(Math.round(y) * canvas.width + Math.round(x)) * 4 + 3];
    const arcXOffset = 280 * 0.42 * 0.5;
    const arcYOffset = 230 * 0.42 * Math.sqrt(3) / 2;
    const lowerLeftArcAlpha = alphaAt(1580 - arcXOffset, 470 + arcYOffset);
    const lowerRightArcAlpha = alphaAt(1580 + arcXOffset, 470 + arcYOffset);

    return {
      count,
      bounds: [minX, minY, maxX, maxY],
      color,
      lowerLeftArcAlpha,
      lowerRightArcAlpha,
    };
  });
  assert(hintStats.count > 1000, 'The sunlit hint must draw visible pixels');
  assert(hintStats.bounds[0] >= 1240 && hintStats.bounds[2] <= 1920,
    'The sunlit hint must stay inside the glass horizontally');
  assert(hintStats.bounds[3] <= 970, 'The sunlit hint must stay above the ticker');
  assert(hintStats.bounds[2] - hintStats.bounds[0] > 180,
    'The letter hint must have a readable horizontal crossbar');
  assert(hintStats.bounds[3] - hintStats.bounds[1] > 120,
    'The letter hint must include its looped bowl');
  assert(hintStats.color[0] > hintStats.color[1] && hintStats.color[1] > hintStats.color[2],
    'The hint must use a pale warm-yellow color');
  assert(hintStats.lowerLeftArcAlpha > hintStats.lowerRightArcAlpha + 35,
    'The letter hint bowl must be mirrored toward the left side of its vertical axis');
  await hintPage.locator('#painting').screenshot({
    path: path.join(out, 'desktop-music-letter-e-hint.png'),
  });

  // An open stroke is not a letter e and leaves the optional hint visible.
  await hintPage.mouse.move(hx(0.75), hy(0.46));
  await hintPage.mouse.down();
  for (let step = 1; step <= 18; step++) {
    await hintPage.mouse.move(hx(0.75 + 0.003 * step), hy(0.46 + (step % 2) * 0.002));
  }
  await hintPage.mouse.up();
  assert.equal(await hintPage.evaluate(() => window.musicPlayback.theme), 'legacy',
    'An open stroke must not switch the theme');
  assert.equal(await hintPage.evaluate(() => window.glassInk.musicHintVisible), true,
    'An unsuccessful stroke must leave the hint visible');

  const hintedLetterE = makeLetterEPath(hintPainting,.82,.46,.55);
  await drawMousePath(hintPage,hintedLetterE,hintPainting);
  await hintPage.waitForFunction(() => window.musicPlayback?.theme === 'waltz');
  assert.equal(await hintPage.evaluate(() => window.glassInk.musicHintVisible), false,
    'A successful letter e must dismiss the optional hint');
  const hintedLetterEInk = await hintPage.evaluate(inspectInk);
  assert(hintedLetterEInk['glass-ink'].count > 1000,
    'A hinted letter e must also leave a glass-ink mark');
  await hintPage.close();

  // Mobile touch: tap and drag must both work, and the drag must move the camera.
  const mobileContext=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,
  });
  const mobilePage=await mobileContext.newPage();
  mobilePage.on('pageerror',error=>errors.push(String(error)));
  await mobilePage.goto(url);
  await waitForReady(mobilePage);
  const mobileBox=await mobilePage.locator('#painting').boundingBox();
  assert(mobileBox,'Mobile artwork did not render');
  const mx=normalized=>mobileBox.x+mobileBox.width*normalized;
  const my=normalized=>mobileBox.y+mobileBox.height*normalized;
  const tapPoint=await mobilePage.evaluate(({clientX,clientY})=>window.glassInk.imagePoint(clientX,clientY),{
    clientX:mx(.82),clientY:my(.45),
  });
  await mobilePage.touchscreen.tap(mx(.82),my(.45));
  await mobilePage.waitForTimeout(300);
  const mobileTap=await mobilePage.evaluate(inspectInk);
  assert(mobileTap['glass-ink'].count>20,'A mobile tap on the glass must draw');

  await mobilePage.evaluate(()=>window.glassInk.clear());
  const cdp=await mobileContext.newCDPSession(mobilePage);
  const touchStart={x:mx(.70),y:my(.45)};
  const touchEnd={x:mx(.90),y:my(.45)};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchStart]});
  for(let step=1;step<=18;step++){
    await cdp.send('Input.dispatchTouchEvent',{
      type:'touchMove',
      touchPoints:[{x:touchStart.x+(touchEnd.x-touchStart.x)*step/18,y:touchStart.y}],
    });
    await mobilePage.waitForTimeout(16);
  }
  const mobileDuring=await mobilePage.evaluate(()=>({
    camera:window.parallaxView.x,
    active:window.glassInk.active,
  }));
  assert(mobileDuring.active,'A mobile one-finger stroke did not stay active');
  assert(mobileDuring.camera>.1,'A mobile drag on the glass did not move the camera');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await mobilePage.waitForTimeout(500);
  const mobileInk=await mobilePage.evaluate(inspectInk);
  assert(mobileInk['glass-ink'].count>1000,'A mobile drag did not leave a continuous stroke');
  assert.equal(mobileInk['glass-ink'].outside,0,'Mobile ink escaped the glass');
  await mobilePage.locator('#painting').screenshot({path:path.join(out,'mobile-drawn.png')});

  // A finger-drawn lowercase e on the rain glass selects the waltz on mobile too.
  const mobileLetterE = makeLetterEPath(mobileBox,.82,.46,.7);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x:mx(mobileLetterE[0].x),y:my(mobileLetterE[0].y)}],
  });
  for(const point of mobileLetterE.slice(1)){
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x:mx(point.x),y:my(point.y)}],
    });
    await mobilePage.waitForTimeout(8);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobilePage.waitForFunction(() => window.musicPlayback?.theme === 'waltz');
  assert.equal(await mobilePage.evaluate(() => window.musicPlayback.theme), 'waltz',
    'A loosely drawn mobile letter e must select the piano waltz');
  assert.equal(await mobilePage.evaluate(() => window.glassInk.musicHintVisible), false,
    'Mobile music selection must not require the optional hint');
  const mobileLetterEInk = await mobilePage.evaluate(inspectInk);
  assert(mobileLetterEInk['glass-ink'].count > 1000,
    'A mobile selection letter must also leave a glass-ink mark');
  await mobilePage.locator('#painting').screenshot({
    path: path.join(out, 'mobile-music-letter-e.png'),
  });
  await mobileContext.close();

  // A lost WebGL context must be reported below the artwork, not silently
  // replaced by the static image.
  const lost=await page.evaluate(()=>{
    const view=document.querySelector('#depth-view');
    const status=document.querySelector('#status');
    const gl=view.getContext('webgl');
    const extension=gl.getExtension('WEBGL_lose_context');
    if(!extension)return {supported:false};
    extension.loseContext();
    return new Promise(resolve=>setTimeout(()=>resolve({
      supported:true,
      display:view.style.display,
      hidden:status.hidden,
      text:status.textContent,
    }),200));
  });
  if(lost.supported){
    assert.equal(lost.display,'none','A lost depth canvas must be hidden');
    assert.equal(lost.hidden,false,'A lost WebGL context must show a status message');
    assert(lost.text.includes('WebGL context lost'),'The status message must name the WebGL failure');
  }

  assert.deepEqual(errors,[],'The page emitted errors');
  const report={
    passed:true,
    glass_rectangle:glass,
    desktop:{
      camera_before:before.camera,
      camera_during:during.camera,
      camera_after:after.camera,
      ink_shift_px:Math.round(actualShift*100)/100,
      expected_near_shift_px:Math.round(expectedShift*100)/100,
      ink:committed,
    },
    mobile:{
      tap_pixels:mobileTap['glass-ink'].count,
      tap_image_point:tapPoint,
      drag_pixels:mobileInk['glass-ink'].count,
      camera_during:mobileDuring.camera,
    },
    page_errors:errors,
  };
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  await browser.close();
}
