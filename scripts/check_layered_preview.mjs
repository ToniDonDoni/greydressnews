import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/layered_preview_check');
const url = process.env.LAYERED_PREVIEW_URL || 'http://127.0.0.1:8767/';
fs.mkdirSync(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => window.layeredGlassDiagnostics?.samplers?.length === 3);
  const initialized = await page.evaluate(() => window.layeredGlassDiagnostics);
  assert.deepEqual(initialized.samplers, [0, 1, 2], 'Base, depth, and glass samplers must use distinct texture units');
  assert.equal(initialized.currentProgramActive, true, 'Sampler uniforms must be set on the active program');
  assert.equal(initialized.glError, 0, 'WebGL setup must not report an error');

  async function pixelAtOpacity(opacity) {
    return page.evaluate((value) => window.layeredGlassDiagnostics.sampleAtOpacity(value, 1170, 500), opacity);
  }

  const transparent = await pixelAtOpacity(0);
  const opaque = await pixelAtOpacity(1);
  const channelDelta = Math.max(...transparent.slice(0, 3).map((channel, i) => Math.abs(channel - opaque[i])));
  assert(channelDelta > 12, `Glass slider did not change the pane pixel enough: ${channelDelta}; alpha0=${transparent}; alpha1=${opaque}`);

  const baseOnly = await page.evaluate(async () => {
    const image = new Image();
    image.src = 'assets/no_logo.png';
    await image.decode();
    const target = document.createElement('canvas');
    target.width = image.naturalWidth;
    target.height = image.naturalHeight;
    const context = target.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0.025 * target.width, 0.025 * target.height,
      0.95 * target.width, 0.95 * target.height, 0, 0, target.width, target.height);
    return Array.from(context.getImageData(1170, 500, 1, 1).data.slice(0, 3));
  });
  const baseDelta = Math.max(...transparent.slice(0, 3).map((channel, i) => Math.abs(channel - baseOnly[i])));
  assert(baseDelta <= 4, `Alpha 0 must show the warped base at the sampled pane pixel; delta=${baseDelta}`);
  await pixelAtOpacity(0.68);

  await page.locator('#depth-view').screenshot({ path: path.join(output, 'glass-alpha-068.png') });
  const report = {
    passed: true,
    samplers: initialized.samplers,
    gl_error: initialized.glError,
    pixel: { canvas_xy: [1170, 500], alpha_0: transparent, alpha_1: opaque, base_only: baseOnly, max_channel_delta: channelDelta, alpha0_base_delta: baseDelta },
    page_errors: pageErrors,
  };
  assert.deepEqual(pageErrors, [], 'The preview page must not throw JavaScript errors');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
