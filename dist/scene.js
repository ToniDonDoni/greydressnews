'use strict';
const canvas=document.getElementById('scene'),ctx=canvas.getContext('2d',{alpha:false});
const rand=(a,b)=>a+Math.random()*(b-a),TAU=Math.PI*2;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches,time=0,last=null,ready=false,windows=[],particles=[],rain=[],lamps=[];
let base,images,blinkNext=rand(4,10),blinkStart=-100;
const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
function windowSprite(w){
  const c=document.createElement('canvas');c.width=23;c.height=32;const d=c.getContext('2d');
  const g=d.createRadialGradient(11,16,1,11,16,18);g.addColorStop(0,w.color+'55');g.addColorStop(1,w.color+'00');d.fillStyle=g;d.fillRect(0,0,23,32);
  d.fillStyle=w.color;d.fillRect(5,5,13,22);
  for(let n=0;n<170;n++){d.fillStyle=Math.random()>.5?'#fff0bd55':'#445d6e55';d.fillRect(rand(5,18),rand(5,27),rand(.4,1.4),rand(.4,1.4));}
  return c;
}
function resetRhythm(){
  lamps=[{x:167,y:150,r:63,period:rand(5,7.5),phase:rand(0,TAU),amp:rand(.035,.062),on:true,brightness:1},
         {x:812,y:111,r:76,period:rand(6.5,9.5),phase:rand(0,TAU),amp:rand(.035,.065),on:true,brightness:1}];
  windows.forEach(w=>{w.on=Math.random()>.26;w.level=w.on?rand(.5,1):0;w.next=time+rand(2,15);w.phase=rand(0,TAU);});
  particles=Array.from({length:210},()=>({life:rand(5,9),age:rand(0,9),phase:rand(0,TAU),offset:rand(-10,10),r:rand(.55,1.65),drift:rand(-10,10)}));
  rain=Array.from({length:65},()=>({x:rand(35,966),y:rand(0,606),speed:rand(16,46),len:rand(5,16),alpha:rand(.025,.13)}));
  blinkNext=time+rand(5,13);
}
function drawLamp(l,i,dt){
  const sway=(Math.sin(time*TAU/l.period+l.phase)+.22*Math.sin(time*TAU/(l.period*2.73)+l.phase))*l.amp;
  l.sway=sway;l.brightness+=(Number(l.on)-l.brightness)*Math.min(1,dt*5);
  ctx.save();ctx.translate(l.x,0);ctx.rotate(sway);
  ctx.drawImage(images[i],-l.r-3,0);
  // A soft light pulse sits within the painted light and follows the pendulum.
  if(l.brightness<.99){ctx.save();ctx.globalAlpha=(1-l.brightness)*.78;ctx.fillStyle='#203342';ctx.beginPath();ctx.ellipse(0,l.y,l.r,l.r*.77,0,0,TAU);ctx.fill();ctx.restore();}
  const power=l.brightness*(.9+.07*Math.sin(time*1.23+i*3)+.03*Math.sin(time*3.81+i));
  ctx.globalCompositeOperation='screen';const glow=ctx.createRadialGradient(0,l.y,4,0,l.y,130);
  glow.addColorStop(0,`rgba(255,188,82,${power*.18})`);glow.addColorStop(.4,`rgba(245,159,67,${power*.07})`);glow.addColorStop(1,'rgba(240,155,65,0)');ctx.fillStyle=glow;ctx.fillRect(-140,l.y-140,280,280);ctx.restore();
}
function render(dt){
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(base,0,0);
  // Markov-like on/off dwell times: continuous animation without a reset seam.
  for(const w of windows){
    if(time>w.next){w.on=!w.on;w.next=time+rand(w.on?4:2,w.on?22:13);w.target=w.on?rand(.5,1):0;}
    const target=w.on?(w.target??.85):0;w.level+=(target-w.level)*Math.min(1,dt*2.2);
    ctx.globalAlpha=Math.max(0,w.level*(.94+.06*Math.sin(time*.7+w.phase)));ctx.drawImage(w.sprite,w.x-5,w.y-5);
  }ctx.globalAlpha=1;
  // Rain stays inside the unobstructed patches of window glass.
  ctx.save();ctx.beginPath();ctx.rect(555,399,410,82);ctx.rect(36,475,158,87);ctx.clip();ctx.lineWidth=.8;
  for(const r of rain){r.y+=dt*r.speed;if(r.y>610){r.y=0;r.x=rand(36,965);}ctx.strokeStyle=`rgba(182,208,204,${r.alpha})`;ctx.beginPath();ctx.moveTo(r.x,r.y);ctx.lineTo(r.x-1.6,r.y+r.len);ctx.stroke();}ctx.restore();
  lamps.forEach((l,i)=>drawLamp(l,i,dt));
  // Tiny cream pigment particles rise, curl, disperse, and respawn invisibly.
  for(const p of particles){
    p.age+=dt;if(p.age>p.life){p.age=0;p.life=rand(5,9);p.offset=rand(-8,8);p.drift=rand(-13,13);}
    const u=p.age/p.life;if(u>1)continue;
    const x=180+p.offset+Math.sin(u*9+p.phase)*u*12+p.drift*u+Math.sin(time*.28)*u*11;
    const y=795-u*126;const alpha=Math.sin(Math.PI*u)*.38;
    ctx.fillStyle=`rgba(232,221,194,${alpha})`;ctx.beginPath();ctx.ellipse(x,y,p.r*(1+u),p.r*(1+u)*1.2,0,0,TAU);ctx.fill();
  }
  // A rare blink: lids close and reopen together over 250 milliseconds.
  if(time>blinkNext){blinkStart=time;blinkNext=time+rand(6,17);}
  const b=(time-blinkStart)/.25;
  if(b>=0&&b<1){const closure=Math.sin(b*Math.PI);for(const [x,y,rx,ry] of [[310,357,27,13],[429,348,28,15]]){
    ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.12,0,TAU);ctx.clip();
    ctx.fillStyle='#cd975e';ctx.fillRect(x-rx-2,y-ry-2,rx*2+4,(ry*2+4)*closure*.56);ctx.fillRect(x-rx-2,y+ry-(ry*2+4)*closure*.48,rx*2+4,ry*2+4);ctx.restore();
  }}
  window.teaserDepth?.sourceChanged();
}
function frame(now){
  if(!ready)return;
  const dt=last===null?0:Math.min((now-last)/1000,.065);last=now;
  if(!paused&&!document.hidden){time+=dt;render(dt);}
  requestAnimationFrame(frame);
}
function updatePause(){
  document.getElementById('pause').setAttribute('aria-label',paused?'Resume animation':'Pause animation');
  document.getElementById('pauseIcon').innerHTML=paused?'<path d="m8 5 11 7-11 7Z"/>':'<path d="M8 5v14M16 5v14"/>';
}
document.getElementById('pause').onclick=()=>{paused=!paused;last=null;updatePause();};
document.getElementById('shuffle').onclick=()=>{if(!ready)return;resetRhythm();render(0);};
document.getElementById('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.getElementById('painting').requestFullscreen();}catch{document.getElementById('fullscreen').title='Full screen is unavailable in this browser';}};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();document.getElementById('pause').click();}});
canvas.addEventListener('pointerdown',e=>{
  if(!ready)return;const r=canvas.getBoundingClientRect(),size=Math.min(r.width,r.height);
  const x=(e.clientX-r.left-(r.width-size)/2)/size*1024,y=(e.clientY-r.top-(r.height-size)/2)/size*1024;
  for(const l of lamps){const cx=l.x-Math.sin(l.sway||0)*l.y,cy=Math.cos(l.sway||0)*l.y;if(Math.hypot(x-cx,y-cy)<88){l.on=!l.on;if(paused){l.brightness=+l.on;render(0);}break;}}
});
document.addEventListener('visibilitychange',()=>{last=null;});
reduced.addEventListener('change',e=>{paused=e.matches;updatePause();});
Promise.all([load('assets/cafe.jpg'),load('assets/lamp0.png'),load('assets/lamp1.png'),fetch('assets/windows.json').then(r=>{if(!r.ok)throw Error('windows');return r.json();})]).then(([bg,l0,l1,data])=>{
  base=bg;images=[l0,l1];windows=data.map(w=>({...w,sprite:windowSprite(w)}));resetRhythm();ready=true;render(0);canvas.classList.add('ready');updatePause();requestAnimationFrame(frame);
}).catch(()=>{document.getElementById('loading').textContent='Could not turn on the lights. Please reload.';});
