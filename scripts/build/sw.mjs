// Generates dist/sw.js with workbox-build generateSW (D-010). Run by postbuild.mjs.
// Precache: /, /offline/, 404.html and the CSS/JS those pages reference. Never precache .wasm or datasets.
import { generateSW } from 'workbox-build';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const pages = [
  ['/', 'index.html'],
  ['/offline/', 'offline/index.html'],
  ['/404.html', '404.html'],
];

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const entries = [];
const assets = new Set();
for (const [url, file] of pages) {
  const abs = path.join(dist, file);
  if (!fs.existsSync(abs)) throw new Error(`sw: missing ${file} in dist/`);
  const html = fs.readFileSync(abs);
  entries.push({ url, revision: md5(html) });
  for (const m of html.toString('utf8').matchAll(/(?:href|src)="(\/_astro\/[^"?#]+\.(?:css|js))"/g)) {
    assets.add(m[1]);
  }
}
for (const url of assets) entries.push({ url, revision: null }); // hashed file names

const { count, size, warnings } = await generateSW({
  swDest: path.join(dist, 'sw.js'),
  globDirectory: dist,
  globPatterns: [],
  additionalManifestEntries: entries,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 3,
        precacheFallback: { fallbackURL: '/offline/' },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/_astro/'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'astro-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'data' },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/pagefind/'),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'pagefind' },
    },
  ],
});
for (const w of warnings) console.warn('sw warning:', w);
console.log(`sw: precached ${count} files, ${(size / 1024).toFixed(1)} KB`);
