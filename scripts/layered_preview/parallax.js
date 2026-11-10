'use strict';

(() => {
  const painting = document.getElementById('painting');
  const poster = document.getElementById('poster');
  const canvas = document.getElementById('depth-view');
  const loading = document.getElementById('loading');
  const status = document.getElementById('status');
  const slider = document.getElementById('glass-alpha');
  const value = document.getElementById('glass-alpha-value');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { ready: false, x: 0, targetX: 0, opacity: 0.68 };
  const parallax = { strength: 0.045, iterations: 7, mix: 0.6, pivot: 0.38 };
  const nearGray = 236 / 255;
  const nearShiftUv = parallax.strength * (nearGray - parallax.pivot) * (1 - (1 - parallax.mix) ** parallax.iterations);
  let gl = null;
  let program = null;
  let uniforms = null;
  let dragPointer = null;
  let lastFrame = performance.now();

  window.parallaxView = { get x() { return state.x; }, nearShiftUv };

  function reportError(message) {
    state.ready = false;
    canvas.style.display = 'none';
    loading.classList.add('hidden');
    status.textContent = message;
    status.hidden = false;
  }

  function compile(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  }

  function loadImage(path) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error(`Could not load ${path}`));
      image.src = path;
    });
  }

  function makeTexture(unit, image) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  function initialize(base, depth, glass) {
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: true });
      if (!gl) throw Error('WebGL is unavailable');
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER,
        'attribute vec2 a; varying vec2 uv; void main(){ uv=(a+1.0)*0.5; gl_Position=vec4(a,0.0,1.0); }'));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 uv;
        uniform sampler2D baseTex;
        uniform sampler2D depthTex;
        uniform sampler2D glassTex;
        uniform vec2 camera;
        uniform float opacity;
        vec3 linearize(vec3 c) {
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
        }
        vec3 encodeSrgb(vec3 c) {
          return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
            step(vec3(0.0031308), c));
        }
        void main() {
          vec2 baseUv = uv * 0.95 + 0.025;
          vec2 shift = camera * vec2(0.045, 0.0);
          vec2 sceneUv = baseUv;
          vec2 glassUv = baseUv;
          for (int i = 0; i < 7; i++) {
            float z = texture2D(depthTex, clamp(sceneUv, 0.0, 1.0)).r;
            sceneUv = mix(sceneUv, baseUv - shift * (z - 0.38), 0.6);
            glassUv = mix(glassUv, baseUv - shift * (236.0 / 255.0 - 0.38), 0.6);
          }
          vec3 baseColor = texture2D(baseTex, clamp(sceneUv, 0.0, 1.0)).rgb;
          vec4 glass = texture2D(glassTex, clamp(glassUv, 0.0, 1.0));
          float alpha = glass.a * opacity;
          vec3 colorLinear = glass.rgb * opacity + linearize(baseColor) * (1.0 - alpha);
          gl_FragColor = vec4(encodeSrgb(colorLinear), 1.0);
        }
      `));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));

      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'a');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      uniforms = {
        baseTex: gl.getUniformLocation(program, 'baseTex'),
        depthTex: gl.getUniformLocation(program, 'depthTex'),
        glassTex: gl.getUniformLocation(program, 'glassTex'),
        camera: gl.getUniformLocation(program, 'camera'),
        opacity: gl.getUniformLocation(program, 'opacity'),
      };

      makeTexture(0, base);
      makeTexture(1, depth);
      makeTexture(2, glass);
      gl.uniform1i(uniforms.baseTex, 0);
      gl.uniform1i(uniforms.depthTex, 1);
      gl.uniform1i(uniforms.glassTex, 2);
      const samplerValues = [uniforms.baseTex, uniforms.depthTex, uniforms.glassTex].map((uniform) => gl.getUniform(program, uniform));
      const error = gl.getError();
      window.layeredGlassDiagnostics = {
        samplers: samplerValues,
        currentProgramActive: gl.getParameter(gl.CURRENT_PROGRAM) === program,
        glError: error,
        dimensions: [base.naturalWidth, base.naturalHeight],
        sampleAtOpacity(opacity, x, y) {
          slider.value = String(opacity);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          const pixel = new Uint8Array(4);
          gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          return Array.from(pixel);
        },
      };
      if (samplerValues.join(',') !== '0,1,2' || error !== gl.NO_ERROR) throw Error('Texture sampler setup failed');

      canvas.width = base.naturalWidth;
      canvas.height = base.naturalHeight;
      state.ready = true;
      draw();
      loading.classList.add('hidden');
    } catch (error) {
      reportError(`Depth view unavailable: ${error.message || error}`);
    }
  }

  function draw() {
    if (!state.ready) return;
    gl.useProgram(program);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.camera, state.x, 0);
    gl.uniform1f(uniforms.opacity, state.opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    painting.style.setProperty('--ink-shift-x', (((state.x * nearShiftUv) / 0.95) * 100).toFixed(5) + '%');
    if (window.layeredGlassDiagnostics) window.layeredGlassDiagnostics.cameraX = state.x;
  }

  function frame(now) {
    const dt = Math.min(100, Math.max(0, now - lastFrame));
    lastFrame = now;
    if (state.ready && Math.abs(state.x - state.targetX) > 0.0001) {
      const weight = reduced.matches ? 1 : 1 - Math.exp(-dt / 70);
      state.x += (state.targetX - state.x) * weight;
      draw();
    }
    requestAnimationFrame(frame);
  }

  function setTarget(clientX) {
    const bounds = painting.getBoundingClientRect();
    if (bounds.width <= 0) return;
    state.targetX = Math.max(-1, Math.min(1, ((clientX - bounds.left) / bounds.width) * 2 - 1));
  }

  slider.addEventListener('input', () => {
    state.opacity = Number(slider.value);
    value.value = state.opacity.toFixed(2);
    draw();
  });
  painting.addEventListener('pointermove', (event) => {
    if (!state.ready || reduced.matches) return;
    if (event.pointerType === 'mouse' || event.pointerId === dragPointer) setTarget(event.clientX);
  });
  painting.addEventListener('pointerdown', (event) => {
    if (!state.ready || reduced.matches || !event.isPrimary || event.pointerType === 'mouse') return;
    dragPointer = event.pointerId;
    painting.setPointerCapture(dragPointer);
    setTarget(event.clientX);
  });
  function release(event) {
    if (dragPointer === null || event.pointerId !== dragPointer) return;
    if (painting.hasPointerCapture(dragPointer)) painting.releasePointerCapture(dragPointer);
    dragPointer = null;
    state.targetX = 0;
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) painting.addEventListener(type, release);
  painting.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && dragPointer === null && !window.glassInk?.active) state.targetX = 0;
  });
  reduced.addEventListener('change', (event) => { if (event.matches) state.targetX = 0; });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    reportError('WebGL context lost. The static glass composite remains visible; reload to restore parallax.');
  });

  Promise.all([
    loadImage('assets/no_logo.png'),
    loadImage('assets/scene-depth.png'),
    loadImage('assets/glass-runtime.png'),
  ]).then(([base, depth, glass]) => initialize(base, depth, glass)).catch((error) => reportError(error.message));
  requestAnimationFrame(frame);
})();
