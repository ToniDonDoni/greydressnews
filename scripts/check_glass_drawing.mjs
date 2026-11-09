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
  await mobileContext.close();

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
