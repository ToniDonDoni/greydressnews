import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const geometry=JSON.parse(fs.readFileSync(path.join(root,'test/glass_layers.json'),'utf8')).geometry;
const out=path.join(root,'output/glass_drawing_check');
fs.mkdirSync(out,{recursive:true});
const url=process.env.TEASER_URL||'http://127.0.0.1:8000/';
const errors=[];

function inspectInk(){
  const canvases={};
  for(const id of ['glass-ink','glass-ink-live']){
    const canvas=document.getElementById(id);
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const glass=window.glassInk.glass;
    let count=0,outside=0,maxAlpha=0,r=0,g=0,b=0,minX=canvas.width,maxX=-1,minY=canvas.height,maxY=-1;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        const offset=(y*canvas.width+x)*4;
        const alpha=data[offset+3];
        if(!alpha)continue;
        count++;
        if(x<glass.left||x>=glass.right||y<glass.top||y>=glass.bottom)outside++;
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
  const originalSize=await page.locator('#poster').evaluate(image=>({
    width:image.naturalWidth,
    height:image.naturalHeight,
  }));

  assert.equal(await page.locator('#glass-ink').count(),1,'The ink canvas must exist');
  assert.equal(await page.locator('#glass-ink-live').count(),1,'The live ink canvas must exist');
  const glass=await page.evaluate(()=>window.glassInk.glass);
  assert.deepEqual(glass,{
    left:Math.round(geometry.pane.left*originalSize.width),
    top:Math.round(geometry.pane.top*originalSize.height),
    right:Math.round(geometry.pane.right*originalSize.width),
    bottom:Math.round(geometry.pane.bottom*originalSize.height),
  },'Unexpected glass rectangle');

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
    live:(()=>{
      const canvas=document.querySelector('#glass-ink-live');
      return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some(value=>value);
    })(),
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
      Math.round(imageX),
      Math.round(imageY),
      1,1).data[3];
  },{imageX:tapImage.x,imageY:tapImage.y});
  assert(tapInk['glass-ink'].count>20,'A tap on the glass must leave a dot');
  assert(tapInk['glass-ink'].bounds[2]-tapInk['glass-ink'].bounds[0]<60,'A tap must not draw a line');
  assert(tapCenterAlpha>0,'The tap ink is not registered under the pointer');

  // A vertical stroke crossing the ticker must be clipped at the image edge.
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
    let strongMinX = canvas.width;
    let strongMaxX = -1;
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
        if (data[offset + 3] > 100) {
          color = data.slice(offset, offset + 3);
          strongMinX = Math.min(strongMinX, x);
          strongMaxX = Math.max(strongMaxX, x);
        }
      }
    }
    const maxAlphaNear = (centerX, centerY) => {
      let maxAlpha = 0;
      for (let y = Math.round(centerY) - 5; y <= Math.round(centerY) + 5; y++) {
        for (let x = Math.round(centerX) - 5; x <= Math.round(centerX) + 5; x++) {
          maxAlpha = Math.max(maxAlpha, data[(y * canvas.width + x) * 4 + 3]);
        }
      }
      return maxAlpha;
    };
    const hint=window.glassGeometry.hint;
    const hintCenterX=hint.center_x*canvas.width;
    const hintCenterY=hint.center_y*canvas.height;
    const arcXOffset=hint.width*canvas.width*hint.style.ellipse_radius_factor*Math.sqrt(3)/2;
    const arcYOffset=hint.height*canvas.height*hint.style.ellipse_radius_factor*0.5;
    const lowerLeftArcAlpha=maxAlphaNear(hintCenterX-arcXOffset,hintCenterY+arcYOffset);
    const lowerRightArcAlpha=maxAlphaNear(hintCenterX+arcXOffset,hintCenterY+arcYOffset);

    return {
      count,
      bounds: [minX, minY, maxX, maxY],
      rightGap: canvas.width - 1 - maxX,
      strongCenterX: (strongMinX + strongMaxX) / 2,
      color,
      lowerLeftArcAlpha,
      lowerRightArcAlpha,
    };
  });
  assert(hintStats.count > 1000, 'The sunlit hint must draw visible pixels');
  const expectedHintCenterX = geometry.hint.center_x * originalSize.width;
  assert(Math.abs(hintStats.strongCenterX - expectedHintCenterX) < 15,
    `The hint must match its canonical normalized center (center ${hintStats.strongCenterX})`);
  assert(hintStats.rightGap >= geometry.hint.right_margin * originalSize.width,
    `The hint must leave at least 1/20 of the artwork width at the right edge (gap ${hintStats.rightGap}px)`);
  assert(hintStats.bounds[0] >= geometry.pane.left*originalSize.width && hintStats.bounds[2] <= geometry.pane.right*originalSize.width,
    'The sunlit hint must stay inside the glass horizontally');
  assert(hintStats.bounds[3] <= originalSize.height, 'The sunlit hint must stay above the ticker');
  assert(hintStats.bounds[2] - hintStats.bounds[0] > geometry.hint.width*originalSize.width*.6,
    'The letter hint must have a readable horizontal crossbar');
  assert(hintStats.bounds[3] - hintStats.bounds[1] > geometry.hint.height*originalSize.height*.5,
    'The letter hint must include its looped bowl');
  assert(hintStats.color[0] > hintStats.color[1] && hintStats.color[1] > hintStats.color[2],
    'The hint must use a pale warm-yellow color');
  assert(hintStats.lowerLeftArcAlpha > hintStats.lowerRightArcAlpha + 35,
    `The letter hint bowl must be mirrored left (left alpha ${hintStats.lowerLeftArcAlpha}, right alpha ${hintStats.lowerRightArcAlpha})`);
  await hintPage.locator('#painting').screenshot({
    path: path.join(out, 'desktop-music-letter-e-hint.png'),
  });

  await hintPage.mouse.dblclick(hx(0.22), hy(0.45), { delay: 90 });
  await hintPage.waitForFunction(() => window.glassInk?.musicHintVisible === false
    && !document.querySelector('#music-hint').classList.contains('is-visible'));
  await hintPage.waitForFunction(() => Number.parseFloat(
    getComputedStyle(document.querySelector('#music-hint')).opacity,
  ) <= 0.01);
  await hintPage.mouse.dblclick(hx(0.22), hy(0.45), { delay: 90 });
  await hintPage.waitForFunction(() => window.glassInk?.musicHintVisible === true
    && document.querySelector('#music-hint').classList.contains('is-visible'));

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

  // Resize the supplied artwork while preserving its composition. The logical
  // pane, house hit area, hint, and drawing canvases must follow the new pixels.
  const resizedPage=await browser.newPage({viewport:{width:1200,height:820},deviceScaleFactor:1});
  resizedPage.on('pageerror',error=>errors.push(String(error)));
  await resizedPage.goto(url);
  await waitForReady(resizedPage);
  const resized=await resizedPage.evaluate(async({width,height})=>{
    const poster=document.querySelector('#poster');
    const replacement=document.createElement('canvas');
    replacement.width=width;
    replacement.height=height;
    replacement.getContext('2d').drawImage(poster,0,0,replacement.width,replacement.height);
    poster.src=replacement.toDataURL('image/png');
    await poster.decode();
    return {width:poster.naturalWidth,height:poster.naturalHeight};
  },{width:Math.round(originalSize.width*.5),height:Math.round(originalSize.height*.5)});
  await resizedPage.waitForFunction(({width,height})=>{
    const hint=document.querySelector('#music-hint');
    return hint?.width===width&&hint?.height===height
      &&window.glassInk?.glass.right===width&&window.glassInk.glass.bottom===height;
  },resized);
  assert.deepEqual(resized,{
    width:Math.round(originalSize.width*.5),
    height:Math.round(originalSize.height*.5),
  },'The test image must use the lower-resolution dimensions');
  const resizedMetrics=await resizedPage.evaluate(()=>({
    image:[document.querySelector('#poster').naturalWidth,document.querySelector('#poster').naturalHeight],
    glass:window.glassInk.glass,
    hint:[document.querySelector('#music-hint').width,document.querySelector('#music-hint').height],
  }));
  assert.deepEqual(resizedMetrics.image,[resized.width,resized.height],'The alternate-resolution image did not load');
  assert.deepEqual(resizedMetrics.glass,{
    left:Math.round(geometry.pane.left*resized.width),
    top:Math.round(geometry.pane.top*resized.height),
    right:resized.width,
    bottom:resized.height,
  },'The pane bounds must scale from normalized geometry');
  assert.deepEqual(resizedMetrics.hint,[resized.width,resized.height],'Drawing canvases must match the loaded image size');
  const resizedPainting=await resizedPage.locator('#painting').boundingBox();
  assert(resizedPainting,'The resized artwork is not visible');
  const rx=normalized=>resizedPainting.x+resizedPainting.width*normalized;
  const ry=normalized=>resizedPainting.y+resizedPainting.height*normalized;
  await resizedPage.mouse.move(rx(.80),ry(.45));
  await resizedPage.mouse.down();
  await resizedPage.mouse.move(rx(.84),ry(.46));
  await resizedPage.mouse.up();
  const resizedInk=await resizedPage.evaluate(()=>{
    const ink=document.querySelector('#glass-ink');
    return ink.getContext('2d').getImageData(0,0,ink.width,ink.height).data.some(Boolean);
  });
  assert(resizedInk,'Drawing must work after the image resolution changes');
  await resizedPage.mouse.dblclick(rx(.22),ry(.45),{delay:90});
  const resizedHint=await resizedPage.evaluate(({centerX,centerY})=>{
    const canvas=document.querySelector('#music-hint');
    return {
      visible:window.glassInk.musicHintVisible,
      centerAlpha:canvas.getContext('2d').getImageData(centerX,centerY,1,1).data[3],
    };
  },{
    centerX:Math.round(geometry.hint.center_x*resized.width),
    centerY:Math.round(geometry.hint.center_y*resized.height),
  });
  assert.equal(resizedHint.visible,true,
    'The normalized house hit area must remain interactive after resizing');
  assert(resizedHint.centerAlpha>0,
    'The hint must redraw at its normalized center after resizing');
  await resizedPage.close();

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
    responsive:{
      image_size:[resized.width,resized.height],
      glass:resizedMetrics.glass,
      ink_visible:resizedInk,
      hint_center_alpha:resizedHint.centerAlpha,
    },
    page_errors:errors,
  };
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  await browser.close();
}
