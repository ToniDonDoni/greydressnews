'use strict';

// Finger ink for the rain-streaked glass. The stroke is stored in source-image
// space and rides the same near-plane parallax transform as the photograph.
(() => {
  const painting = document.getElementById('painting');
  const layer = document.getElementById('ink-layer');
  const canvas = document.getElementById('glass-ink');
  const liveCanvas = document.getElementById('glass-ink-live');
  if (!painting || !layer || !canvas || !liveCanvas) return;
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const liveContext = liveCanvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context || !liveContext) return;

  const IMAGE = { width: 1920, height: 1077 };
  const GLASS = { left: 1240, top: 0, right: 1920, bottom: 970 };
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
      v
    };
  }

  function screenPoint(imageX, imageY) {
    const box = painting.getBoundingClientRect();
    const shift = nearShiftUv() * cameraX();
    const u = ((imageX / IMAGE.width) + shift - SHADER.offset) / SHADER.zoom;
    const v = ((imageY / IMAGE.height) - SHADER.offset) / SHADER.zoom;
    return { x: box.left + u * box.width, y: box.top + v * box.height };
  }

  function inGlass(point) {
    return point !== null
      && point.x >= GLASS.left && point.x <= GLASS.right
      && point.y >= GLASS.top && point.y <= GLASS.bottom;
  }

  function clipGlass(target) {
    target.beginPath();
    target.rect(GLASS.left, GLASS.top, GLASS.right - GLASS.left, GLASS.bottom - GLASS.top);
    target.clip();
  }

  function paintDot(target, point) {
    target.save();
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
    liveContext.clearRect(0, 0, IMAGE.width, IMAGE.height);
    paintStroke(liveContext, strokePoints);
  }

  function commitStroke() {
    if (!strokePoints.length) return;
    context.drawImage(liveCanvas, 0, 0);
    liveContext.clearRect(0, 0, IMAGE.width, IMAGE.height);
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
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
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
    liveContext.clearRect(0, 0, IMAGE.width, IMAGE.height);
  }

  function clear() {
    cancel();
    context.clearRect(0, 0, IMAGE.width, IMAGE.height);
  }

  painting.addEventListener('pointerdown', start, { passive: true });
  painting.addEventListener('pointermove', move, { passive: false });
  painting.addEventListener('pointerup', event => finish(event, true));
  painting.addEventListener('pointercancel', event => finish(event, true));
  painting.addEventListener('lostpointercapture', event => finish(event, true));
  painting.addEventListener('dragstart', event => event.preventDefault());
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
  });

  window.glassInk = {
    glass: GLASS,
    get active() { return activePointer !== null; },
    imagePoint,
    screenPoint,
    clear
  };
})();
