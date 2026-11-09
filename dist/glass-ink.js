'use strict';

// Finger ink for the rain-streaked glass. The stroke is stored in source-image
// space and rides the same near-plane parallax transform as the photograph.
(() => {
  const painting = document.getElementById('painting');
  const layer = document.getElementById('ink-layer');
  const canvas = document.getElementById('glass-ink');
  const liveCanvas = document.getElementById('glass-ink-live');
  const hintCanvas = document.getElementById('music-hint');
  if (!painting || !layer || !canvas || !liveCanvas) return;
  const context = canvas.getContext('2d', { alpha: true, desynchronized: false });
  const liveContext = liveCanvas.getContext('2d', { alpha: true, desynchronized: false });
  const hintContext = hintCanvas?.getContext('2d', { alpha: true, desynchronized: false });
  if (!context || !liveContext) return;

  const IMAGE = { width: 1920, height: 1077 };
  const GLASS = { left: 1240, top: 0, right: 1920, bottom: 970 };
  const HOUSE = { left: 0, top: 0, right: 720, bottom: 970 };
  const MUSIC_HINT = { x: 1580, y: 470, radius: 126 };
  const SHADER = { zoom: 0.95, offset: 0.025 };
  const TAU = Math.PI * 2;
  const FALLBACK_NEAR_SHIFT_UV = 0.045 * (236 / 255 - 0.38) * (1 - Math.pow(0.4, 7));
  let activePointer = null;
  let strokePoints = [];
  let strokeMoved = false;
  let strokeWidth = 0;

  // Keep the finger mark the same physical size on a phone and on a desktop:
  // about 4.2-8 CSS pixels, converted back into source-image pixels.
  function brushWidth() {
    const box = painting.getBoundingClientRect();
    const target = clamp(box.width * 0.0065, 4.2, 8);
    const scale = (box.width / IMAGE.width) * 1.0526316;
    return target / Math.max(0.0001, scale);
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function cameraX() {
    const value = window.parallaxView && window.parallaxView.x;
    return Number.isFinite(value) ? value : 0;
  }

  function nearShiftUv() {
    const value = window.parallaxView && window.parallaxView.nearShiftUv;
    return Number.isFinite(value) ? value : FALLBACK_NEAR_SHIFT_UV;
  }

  let circlePointer = null;
  let circlePoints = [];
  let musicHintVisible = false;

  function drawMusicHint() {
    if (!hintContext || !hintCanvas) return;
    hintContext.clearRect(0, 0, hintCanvas.width, hintCanvas.height);
    const { x, y, radius } = MUSIC_HINT;
    hintContext.save();
    hintContext.globalCompositeOperation = 'screen';

    const halo = hintContext.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.8);
    halo.addColorStop(0, 'rgba(255,229,171,0.025)');
    halo.addColorStop(0.68, 'rgba(255,224,157,0.08)');
    halo.addColorStop(1, 'rgba(255,224,157,0)');
    hintContext.fillStyle = halo;
    hintContext.fillRect(x - radius * 1.8, y - radius * 1.8, radius * 3.6, radius * 3.6);

    hintContext.beginPath();
    hintContext.arc(x, y, radius, 0, TAU);
    hintContext.shadowColor = 'rgba(255,226,160,0.9)';
    hintContext.shadowBlur = 38;
    hintContext.lineWidth = 10;
    hintContext.strokeStyle = 'rgba(255,223,153,0.24)';
    hintContext.stroke();

    hintContext.shadowBlur = 12;
    hintContext.lineWidth = 2.2;
    hintContext.strokeStyle = 'rgba(255,241,203,0.62)';
    hintContext.stroke();
    hintContext.restore();
  }

  function setMusicHint(visible) {
    musicHintVisible = Boolean(visible);
    if (!hintCanvas) return;
    if (musicHintVisible) drawMusicHint();
    hintCanvas.classList.toggle('is-visible', musicHintVisible);
  }

  function toggleMusicHint() {
    setMusicHint(!musicHintVisible);
  }

  function isHousePoint(point) {
    return (
      point !== null &&
      point.x >= HOUSE.left &&
      point.x <= HOUSE.right &&
      point.y >= HOUSE.top &&
      point.y <= HOUSE.bottom
    );
  }

  function handleHouseDoubleClick(event) {
    if (!event.isTrusted) return;
    const point = imagePoint(event.clientX, event.clientY);
    if (isHousePoint(point)) toggleMusicHint();
  }

  function normalizedPoint(clientX, clientY) {
    const box = painting.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    };
  }

  function recognizeMusicCircle(points, width, height) {
    if (!Array.isArray(points) || points.length < 14 || width <= 0 || height <= 0) return false;

    const samples = [];
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const x = point.x * width;
      const y = point.y * height;
      if (x < -8 || x > width + 8 || y < -8 || y > height + 8) return false;
      const previous = samples[samples.length - 1];
      if (!previous || (x - previous.x) ** 2 + (y - previous.y) ** 2 >= 4) {
        samples.push({ x, y });
      }
    }
    if (samples.length < 14) return false;

    const xs = samples.map((point) => point.x);
    const ys = samples.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const diameterX = maxX - minX;
    const diameterY = maxY - minY;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const radius = (diameterX + diameterY) * 0.25;

    if (radius < 22 || radius > Math.min(width, height) * 0.24) return false;
    const aspect = diameterX / Math.max(1, diameterY);
    if (aspect < 0.62 || aspect > 1.62) return false;

    const box = painting.getBoundingClientRect();
    for (const point of samples) {
      const image = imagePoint(box.left + point.x, box.top + point.y);
      if (!inGlass(image)) return false;
    }
    const center = imagePoint(box.left + centerX, box.top + centerY);
    if (!inGlass(center)) return false;

    const radii = samples.map((point) => Math.hypot(point.x - centerX, point.y - centerY));
    const meanRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    const radialError =
      Math.sqrt(radii.reduce((sum, value) => sum + (value - meanRadius) ** 2, 0) / radii.length) /
      meanRadius;
    if (radialError > 0.36) return false;

    let pathLength = 0;
    let totalTurn = 0;
    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1];
      const current = samples[index];
      pathLength += Math.hypot(current.x - previous.x, current.y - previous.y);
      const previousAngle = Math.atan2(previous.y - centerY, previous.x - centerX);
      const currentAngle = Math.atan2(current.y - centerY, current.x - centerX);
      let delta = currentAngle - previousAngle;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      totalTurn += delta;
    }

    const closure = Math.hypot(
      samples[0].x - samples[samples.length - 1].x,
      samples[0].y - samples[samples.length - 1].y,
    );
    if (closure > Math.max(18, meanRadius * 0.45)) return false;
    if (pathLength < meanRadius * 3.8 || pathLength > meanRadius * 9.5) return false;
    if (Math.abs(totalTurn) < Math.PI * 1.45 || Math.abs(totalTurn) > Math.PI * 2.65) return false;
    return true;
  }

  // The yellow hint is visual-only. Music-circle recognition never depends on its visibility.
  function startMusicGesture(event) {
    if (circlePointer !== null || event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point || !inGlass(imagePoint(event.clientX, event.clientY))) return;
    circlePointer = event.pointerId;
    circlePoints = [point];
    try {
      painting.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events have no active pointer to capture.
    }
  }

  function moveMusicGesture(event) {
    if (event.pointerId !== circlePointer) return;
    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [event];
    const box = painting.getBoundingClientRect();
    let last = circlePoints[circlePoints.length - 1];
    for (const sample of samples) {
      const point = normalizedPoint(sample.clientX, sample.clientY);
      if (!point) continue;
      const dx = (point.x - last.x) * box.width;
      const dy = (point.y - last.y) * box.height;
      if (dx * dx + dy * dy >= 4) {
        circlePoints.push(point);
        last = point;
      }
    }
  }

  function finishMusicGesture(event) {
    if (event.pointerId !== circlePointer) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (point) circlePoints.push(point);
    const box = painting.getBoundingClientRect();
    const recognized = recognizeMusicCircle(circlePoints, box.width, box.height);
    circlePointer = null;
    circlePoints = [];
    if (recognized) {
      setMusicHint(false);
      document.dispatchEvent(new CustomEvent('music-theme-change', { detail: { theme: 'waltz' } }));
    }
  }

  function cancelMusicGesture(event) {
    if (event && event.pointerId !== circlePointer) return;
    circlePointer = null;
    circlePoints = [];
  }

  function imagePoint(clientX, clientY) {
    const box = painting.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const u = clamp((clientX - box.left) / box.width, 0, 1);
    const v = clamp((clientY - box.top) / box.height, 0, 1);
    const shift = nearShiftUv() * cameraX();
    return {
      x: clamp((SHADER.zoom * u + SHADER.offset - shift) * IMAGE.width, 0, IMAGE.width),
      y: clamp((SHADER.zoom * v + SHADER.offset) * IMAGE.height, 0, IMAGE.height),
      u,
      v,
    };
  }

  function screenPoint(imageX, imageY) {
    const box = painting.getBoundingClientRect();
    const shift = nearShiftUv() * cameraX();
    const u = (imageX / IMAGE.width + shift - SHADER.offset) / SHADER.zoom;
    const v = (imageY / IMAGE.height - SHADER.offset) / SHADER.zoom;
    return { x: box.left + u * box.width, y: box.top + v * box.height };
  }

  function inGlass(point) {
    return (
      point !== null &&
      point.x >= GLASS.left &&
      point.x <= GLASS.right &&
      point.y >= GLASS.top &&
      point.y <= GLASS.bottom
    );
  }

  function clipGlass(target) {
    target.beginPath();
    target.rect(GLASS.left, GLASS.top, GLASS.right - GLASS.left, GLASS.bottom - GLASS.top);
    target.clip();
  }

  function paintDot(target, point) {
    target.save();
    target.setTransform(canvas.width / IMAGE.width, 0, 0, canvas.height / IMAGE.height, 0, 0);
    clipGlass(target);
    target.beginPath();
    target.arc(point.x, point.y, strokeWidth * 1.3, 0, TAU);
    target.fillStyle = 'rgba(208,220,226,0.07)';
    target.fill();
    target.beginPath();
    target.arc(point.x, point.y, strokeWidth * 0.52, 0, TAU);
    target.fillStyle = 'rgba(205,216,222,0.22)';
    target.fill();
    target.restore();
  }

  function paintStroke(target, points) {
    if (points.length === 1) {
      paintDot(target, points[0]);
      return;
    }
    target.save();
    target.setTransform(canvas.width / IMAGE.width, 0, 0, canvas.height / IMAGE.height, 0, 0);
    clipGlass(target);
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.beginPath();
    target.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      target.lineTo(points[index].x, points[index].y);
    }
    target.strokeStyle = 'rgba(208,220,226,0.07)';
    target.lineWidth = strokeWidth * 2.6;
    target.stroke();
    target.strokeStyle = 'rgba(205,216,222,0.21)';
    target.lineWidth = strokeWidth;
    target.stroke();
    target.restore();
  }

  function redrawLive() {
    liveContext.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    paintStroke(liveContext, strokePoints);
  }

  function commitStroke() {
    if (!strokePoints.length) return;
    context.drawImage(liveCanvas, 0, 0);
    liveContext.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  }

  function start(event) {
    if (activePointer !== null || event.isPrimary === false) return false;
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    const point = imagePoint(event.clientX, event.clientY);
    if (!inGlass(point)) return false;
    activePointer = event.pointerId;
    strokeWidth = brushWidth();
    strokePoints = [{ x: point.x, y: point.y }];
    strokeMoved = false;
    paintStroke(liveContext, strokePoints);
    try {
      painting.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events have no active pointer to capture.
    }
    return true;
  }

  function move(event) {
    if (event.pointerId !== activePointer) return;
    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [event];
    let last = strokePoints[strokePoints.length - 1];
    for (const sample of samples) {
      const point = imagePoint(sample.clientX, sample.clientY);
      if (!point) continue;
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if (dx * dx + dy * dy >= 0.5625) {
        last = { x: point.x, y: point.y };
        strokePoints.push(last);
        strokeMoved = true;
      }
    }
    if (strokeMoved) redrawLive();
    if (event.cancelable) event.preventDefault();
  }

  function finish(event, commit) {
    if (event.pointerId !== activePointer) return;
    if (commit) commitStroke();
    activePointer = null;
    strokePoints = [];
    strokeMoved = false;
    if (painting.hasPointerCapture(event.pointerId)) {
      painting.releasePointerCapture(event.pointerId);
    }
  }

  function cancel() {
    if (activePointer !== null) commitStroke();
    activePointer = null;
    strokePoints = [];
    strokeMoved = false;
    liveContext.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  }

  function clear() {
    cancel();
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  painting.addEventListener('dblclick', handleHouseDoubleClick);
  painting.addEventListener('pointerdown', start, { passive: true });
  painting.addEventListener('pointerdown', startMusicGesture, { passive: true });
  painting.addEventListener('pointermove', moveMusicGesture, { passive: true });
  painting.addEventListener('pointerup', finishMusicGesture);
  painting.addEventListener('pointercancel', cancelMusicGesture);
  painting.addEventListener('lostpointercapture', cancelMusicGesture);
  painting.addEventListener('pointermove', move, { passive: false });
  painting.addEventListener('pointerup', (event) => finish(event, true));
  painting.addEventListener('pointercancel', (event) => finish(event, true));
  painting.addEventListener('lostpointercapture', (event) => finish(event, true));
  painting.addEventListener('dragstart', (event) => event.preventDefault());
  window.addEventListener('blur', () => {
    cancel();
    cancelMusicGesture();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancel();
      cancelMusicGesture();
    }
  });

  window.glassInk = {
    glass: GLASS,
    get active() {
      return activePointer !== null;
    },
    get musicHintVisible() {
      return musicHintVisible;
    },
    imagePoint,
    screenPoint,
    recognizeMusicCircle(points) {
      const box = painting.getBoundingClientRect();
      return recognizeMusicCircle(points, box.width, box.height);
    },
    clear,
  };
})();
