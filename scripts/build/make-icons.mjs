// Renders the app icons from an SVG with the Chromium that Playwright already provides.
// Usage: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/build/make-icons.mjs
// Outputs are committed (public/icons/*.png); re-run only when the artwork changes.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const NAVY = '#1f3a5f';
const svg = (size, inset) => {
  const s = size * (1 - 2 * inset);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${NAVY}"/>
<text x="${size / 2}" y="${size / 2 + s * 0.17}" font-family="sans-serif" font-size="${s * 0.46}" font-weight="700" text-anchor="middle" fill="#fff">DFT</text></svg>`;
};
const targets = [
  ['public/icons/icon-192.png', 192, 0.08],
  ['public/icons/icon-512.png', 512, 0.08],
  // maskable: artwork kept inside the central 80% safe zone
  ['public/icons/icon-maskable-512.png', 512, 0.2],
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
fs.mkdirSync('public/icons', { recursive: true });
for (const [file, size, inset] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size, inset)}</body>`);
  fs.writeFileSync(file, await page.screenshot({ type: 'png' }));
  console.log('wrote', file);
}
await browser.close();
