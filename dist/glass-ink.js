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

  const IMAGE = { width: 1672, height: 941 };
  const GLASS = { left: 1095, top: 0, right: 1672, bottom: 941 };
  const HOUSE = { left: 0, top: 0, right: 605, bottom: 941 };
  const MUSIC_HINT = { x: 1580, y: 470, width: 280, height: 230 };
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

  let musicPointer = null;
  let musicPoints = [];
  let musicHintVisible = false;

  function drawMusicHint() {
    if (!hintContext || !hintCanvas) return;
    hintContext.clearRect(0, 0, hintCanvas.width, hintCanvas.height);
    const { x, y, width, height } = MUSIC_HINT;
    const haloRadius = Math.max(width, height) * 0.9;
    hintContext.save();
    hintContext.globalCompositeOperation = 'screen';

    const halo = hintContext.createRadialGradient(x, y, 12, x, y, haloRadius);
    halo.addColorStop(0, 'rgba(255,229,171,0.025)');
    halo.addColorStop(0.68, 'rgba(255,224,157,0.08)');
    halo.addColorStop(1, 'rgba(255,224,157,0)');
    hintContext.fillStyle = halo;
    hintContext.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);

    // Mirror the letter around its own vertical centerline.
    hintContext.translate(x * 2, 0);
    hintContext.scale(-1, 1);

    hintContext.beginPath();
    hintContext.moveTo(x + width * 0.45, y);
    hintContext.lineTo(x - width * 0.42, y);
    hintContext.ellipse(
      x,
      y,
      width * 0.42,
      height * 0.42,
      0,
      Math.PI,
      Math.PI * 2 + Math.PI / 3,
      false,
    );
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

  function recognizeMusicLetterE(points, width, height) {
    if (!Array.isArray(points) || points.length < 18 || width <= 0 || height <= 0) return false;

    const samples = [];
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const x = point.x * width;
      const y = point.y * height;
      if (x < -8 || x > width + 8 || y < -8 || y > height + 8) return false;
      const previous = samples[samples.length - 1];
      if (!previous || (x - previous.x) ** 2 + (y - previous.y) ** 2 >= 2.25) {
        samples.push({ x, y });
      }
    }
    if (samples.length < 18) return false;

    const xs = samples.map((point) => point.x);
    const ys = samples.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const diameterX = maxX - minX;
    const diameterY = maxY - minY;
    const maxDimension = Math.max(diameterX, diameterY);
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;

    if (maxDimension < 36 || maxDimension > Math.min(width, height) * 0.52) return false;
    if (diameterX < 1 || diameterY < 1) return false;

    const aspect = diameterX / diameterY;
    if (aspect < 0.72 || aspect > 2.8) return false;

    const normalized = samples.map((point) => ({
      x: (point.x - minX) / diameterX,
      y: (point.y - minY) / diameterY,
    }));

    // A handwritten e needs a broad, mostly horizontal crossbar through its middle.
    let bestBar = { span: 0, yRange: Infinity, reversals: 1, score: -Infinity };
    let barRun = [];
    function inspectBar(run) {
      if (run.length < 5) return;
      const runXs = run.map((point) => point.x);
      const runYs = run.map((point) => point.y);
      const span = Math.max(...runXs) - Math.min(...runXs);
      const yRange = Math.max(...runYs) - Math.min(...runYs);
      const direction = Math.sign(run[run.length - 1].x - run[0].x);
      if (!direction) return;

      let movingSteps = 0;
      let reversals = 0;
      for (let index = 1; index < run.length; index++) {
        const dx = run[index].x - run[index - 1].x;
        if (Math.abs(dx) < 0.008) continue;
        movingSteps++;
        if (dx * direction < -0.012) reversals++;
      }
      const reversalRatio = movingSteps ? reversals / movingSteps : 1;
      const score = span - yRange * 0.5 - reversalRatio * 0.25;
      if (score > bestBar.score) {
        bestBar = { span, yRange, reversals: reversalRatio, score };
      }
    }

    for (const point of normalized) {
      if (point.y >= 0.28 && point.y <= 0.72) {
        barRun.push(point);
      } else {
        inspectBar(barRun);
        barRun = [];
      }
    }
    inspectBar(barRun);
    if (bestBar.span < 0.56 || bestBar.yRange > 0.36 || bestBar.reversals > 0.36) return false;

    // The loop must travel around the bowl, not just make a horizontal stroke.
    if (!normalized.some((point) => point.y < 0.3)) return false;
    if (!normalized.some((point) => point.y > 0.7)) return false;

    const angles = normalized
      .filter((point) => Math.hypot(point.x - 0.5, point.y - 0.5) > 0.12)
      .map((point) => (Math.atan2(point.y - 0.5, point.x - 0.5) + TAU) % TAU)
      .sort((a, b) => a - b);
    if (angles.length < 12) return false;

    let largestGap = 0;
    for (let index = 0; index < angles.length; index++) {
      const next = index + 1 < angles.length ? angles[index + 1] : angles[0] + TAU;
      largestGap = Math.max(largestGap, next - angles[index]);
    }
    const angularCoverage = TAU - largestGap;
    if (angularCoverage < Math.PI * 1.12) return false;

    let pathLength = 0;
    for (let index = 1; index < samples.length; index++) {
      pathLength += Math.hypot(
        samples[index].x - samples[index - 1].x,
        samples[index].y - samples[index - 1].y,
      );
    }
    if (pathLength < maxDimension * 1.7 || pathLength > maxDimension * 6.8) return false;

    const endpointGap = Math.hypot(
      samples[0].x - samples[samples.length - 1].x,
      samples[0].y - samples[samples.length - 1].y,
    );
    if (endpointGap < maxDimension * 0.04) return false;

    const box = painting.getBoundingClientRect();
    for (const point of samples) {
      const image = imagePoint(box.left + point.x, box.top + point.y);
      if (!inGlass(image)) return false;
    }
    const center = imagePoint(box.left + centerX, box.top + centerY);
    if (!inGlass(center)) return false;

    return true;
  }
  // The yellow letter is visual-only. Music recognition never depends on its visibility.
  function startMusicGesture(event) {
    if (musicPointer !== null || event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point || !inGlass(imagePoint(event.clientX, event.clientY))) return;
    musicPointer = event.pointerId;
    musicPoints = [point];
    try {
      painting.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events have no active pointer to capture.
    }
  }

  function moveMusicGesture(event) {
    if (event.pointerId !== musicPointer) return;
    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [event];
    const box = painting.getBoundingClientRect();
    let last = musicPoints[musicPoints.length - 1];
    for (const sample of samples) {
      const point = normalizedPoint(sample.clientX, sample.clientY);
      if (!point) continue;
      const dx = (point.x - last.x) * box.width;
      const dy = (point.y - last.y) * box.height;
      if (dx * dx + dy * dy >= 4) {
        musicPoints.push(point);
        last = point;
      }
    }
  }

  function finishMusicGesture(event) {
    if (event.pointerId !== musicPointer) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (point) musicPoints.push(point);
    const box = painting.getBoundingClientRect();
    const recognized = recognizeMusicLetterE(musicPoints, box.width, box.height);
    musicPointer = null;
    musicPoints = [];
    if (recognized) {
      setMusicHint(false);
      document.dispatchEvent(new CustomEvent('music-theme-change', { detail: { theme: 'waltz' } }));
    }
  }

  function cancelMusicGesture(event) {
    if (event && event.pointerId !== musicPointer) return;
    musicPointer = null;
    musicPoints = [];
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
    recognizeMusicLetterE(points) {
      const box = painting.getBoundingClientRect();
      return recognizeMusicLetterE(points, box.width, box.height);
    },
    clear,
  };
})();
