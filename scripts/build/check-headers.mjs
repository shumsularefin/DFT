// Asserts firebase.json behaviour against a running Firebase Hosting emulator.
// Usage:
//   npm run build
//   npx -y firebase-tools@15.34.1 emulators:start --only hosting --project demo-dft   (other shell)
//   node scripts/build/check-headers.mjs [http://127.0.0.1:5000]
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5000';
const REVALIDATE = 'public, max-age=0, must-revalidate';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const astroFile = fs.readdirSync('dist/_astro').find((f) => /\.(js|css)$/.test(f));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failed++;
}
const get = (p) => fetch(base + p, { redirect: 'manual' });

const cases = [
  ['/', 200, REVALIDATE],
  ['/offline/', 200, REVALIDATE],
  [`/_astro/${astroFile}`, 200, IMMUTABLE],
  ['/sw.js', 200, 'no-cache, no-store, must-revalidate'],
  ['/manifest.webmanifest', 200, 'public, max-age=86400'],
  ['/does-not-exist/', 404, REVALIDATE],
];
for (const [p, status, cc] of cases) {
  const r = await get(p);
  check(`${p} status ${status}`, r.status === status, `got ${r.status}`);
  check(`${p} Cache-Control`, r.headers.get('cache-control') === cc, `got ${r.headers.get('cache-control')}`);
}

const redirect = await get('/offline');
check(
  '/offline redirects to /offline/',
  redirect.status === 301 && redirect.headers.get('location') === '/offline/',
  `got ${redirect.status} ${redirect.headers.get('location')}`,
);

const missing = await get('/does-not-exist/');
check('missing page serves the custom 404', (await missing.text()).includes('Page not found'));

const home = await get('/');
for (const [h, v] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
]) {
  check(`security header ${h}`, home.headers.get(h) === v, `got ${home.headers.get(h)}`);
}

// .wasm, /data/, /pagefind/ rules cannot be exercised yet: no such files exist in dist/ (later stages).
process.exit(failed ? 1 : 0);
