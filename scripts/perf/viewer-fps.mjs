/* global document, performance, KeyboardEvent, requestAnimationFrame */
// Frame-rate measurement for the 3D viewers (M5.5). Starts the 3D view, then turns it 300 times with the keyboard,
// waiting for two animation frames after each key press (one to draw, one to confirm it was presented), and reports the frame interval statistics.
// Usage: PW_CHROMIUM_PATH=... node scripts/perf/viewer-fps.mjs http://localhost:4321/design/unit-cell-lab/
// Headless Chromium uses software rendering (SwiftShader), so this is a pessimistic bound for a laptop GPU.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2];
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url);
await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
await page.getByRole('button', { name: 'Start 3D view' }).click();
await page.waitForSelector('canvas');
await page.getByRole('group', { name: /3D view/ }).focus();
const stats = await page.evaluate(async () => {
  const host = document.querySelector('[data-camera]');
  const times = [];
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    times.push((performance.now() - t0) / 2); // two frames per sample
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.floor(p * (times.length - 1))];
  return { frames: times.length, median_ms: q(0.5), p95_ms: q(0.95), max_ms: times[times.length - 1] };
});
console.log(url, JSON.stringify(stats));
await browser.close();
