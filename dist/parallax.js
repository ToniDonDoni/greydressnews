'use strict';

// Static relative depth is baked once; pointer movement only changes the view.
(() => {
  const painting=document.getElementById('painting');
  const photo=document.getElementById('poster');
  const view=document.getElementById('depth-view');
  const loading=document.getElementById('loading');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={ready:false,x:0,y:0,targetX:0,targetY:0,error:null};
  let gl=null,program=null,uniforms=null;
  let photoTexture=null,depthTexture=null,dragPointer=null;
  let previous=performance.now();

  function shader(type,code){
    const result=gl.createShader(type);gl.shaderSource(result,code);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(result));
    return result;
  }
  function texture(unit){
    gl.activeTexture(gl.TEXTURE0+unit);
    const result=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,result);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    return result;
  }
  function setTarget(x,y){
    state.targetX=Math.max(-1,Math.min(1,x));
    state.targetY=0;
  }
  function pointerTarget(event){
    const box=photo.getBoundingClientRect();
    setTarget((event.clientX-box.left)/box.width*2-1,0);
  }
  function draw(){
    gl.useProgram(program);
    gl.viewport(0,0,view.width,view.height);
    gl.uniform2f(uniforms.camera,state.x,state.y);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function frame(now){
    const dt=Math.min(100,Math.max(0,now-previous));previous=now;
    const moving=Math.abs(state.x-state.targetX)+Math.abs(state.y-state.targetY)>.0001;
    if(state.ready&&moving){
      const weight=reduced.matches?1:1-Math.exp(-dt/70);
      state.x+=(state.targetX-state.x)*weight;state.y+=(state.targetY-state.y)*weight;draw();
    }
    requestAnimationFrame(frame);
  }
  function fail(error){
    state.error=String(error.message||error);view.style.display='none';loading.textContent='Depth view unavailable; showing the original image.';
    loading.classList.add('visible');
  }
  function initialize(){
    try{
      gl=view.getContext('webgl',{alpha:false,antialias:true});
      if(!gl)throw Error('WebGL is unavailable');
      program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 uv;void main(){uv=(a+1.)*.5;gl_Position=vec4(a,0,1);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D photo;uniform sampler2D depth;uniform vec2 camera;
        void main(){
          vec2 base=uv*.95+.025;vec2 shift=camera*vec2(.045,0.);vec2 q=base;
          for(int i=0;i<7;i++){float z=texture2D(depth,clamp(q,0.,1.)).r;q=mix(q,base-shift*(z-.38),.6);}
          gl_FragColor=vec4(texture2D(photo,clamp(q,0.,1.)).rgb,1.);
        }`));
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      uniforms=Object.fromEntries(['photo','depth','camera'].map(name=>[name,gl.getUniformLocation(program,name)]));
      photoTexture=texture(0);gl.uniform1i(uniforms.photo,0);
      depthTexture=texture(1);gl.uniform1i(uniforms.depth,1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,photoTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,photo);
      const depth=new Image();
      depth.onload=()=>{
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,depth);
        view.width=photo.naturalWidth;view.height=photo.naturalHeight;
        state.ready=true;draw();loading.classList.add('hidden');
      };
      depth.onerror=()=>fail(Error('Depth map could not be loaded'));
      depth.src='assets/ElGrayPimenovLeiterWindow2-depth.png';
    }catch(error){fail(error);}
  }
  painting.addEventListener('pointermove',event=>{
    if(!state.ready||reduced.matches)return;
    if(event.pointerType==='mouse'||event.pointerId===dragPointer)pointerTarget(event);
  });
  painting.addEventListener('pointerdown',event=>{
    if(!state.ready||reduced.matches||!event.isPrimary||event.pointerType==='mouse')return;
    dragPointer=event.pointerId;painting.setPointerCapture(dragPointer);pointerTarget(event);
  });
  function release(event){
    if(dragPointer===null||event.pointerId!==dragPointer)return;
    if(painting.hasPointerCapture(dragPointer))painting.releasePointerCapture(dragPointer);
    dragPointer=null;setTarget(0,0);
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])painting.addEventListener(name,release);
  painting.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&dragPointer===null)setTarget(0,0)});
  reduced.addEventListener('change',event=>{if(event.matches)setTarget(0,0)});
  photo.onload=initialize;
  if(photo.complete&&photo.naturalWidth)initialize();
  photo.onerror=()=>fail(Error('Source image could not be loaded'));
  requestAnimationFrame(frame);
})();
