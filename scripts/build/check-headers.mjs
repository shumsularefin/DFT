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

// D-103: DFT Studio has its own CSP (Pyodide from cdn.jsdelivr.net, frameable by the builder page only);
// every other page keeps the strict site CSP and X-Frame-Options DENY.
const csp = (r) => r.headers.get('content-security-policy') ?? '';
for (const p of ['/', '/builder/', '/tools/convergence/']) {
  const r = await get(p);
  check(
    `${p} strict CSP (no CDN)`,
    csp(r).includes("script-src 'self'") && !csp(r).includes('jsdelivr'),
    csp(r),
  );
  check(
    `${p} X-Frame-Options DENY`,
    r.headers.get('x-frame-options') === 'DENY',
    r.headers.get('x-frame-options'),
  );
}
for (const p of ['/dft-studio/', '/dft-studio/js/vesta.js']) {
  const r = await get(p);
  check(`${p} Studio CSP allows Pyodide`, csp(r).includes('https://cdn.jsdelivr.net'), csp(r));
  check(`${p} framed by the site only`, csp(r).includes("frame-ancestors 'self'"), csp(r));
  check(
    `${p} X-Frame-Options SAMEORIGIN`,
    r.headers.get('x-frame-options') === 'SAMEORIGIN',
    r.headers.get('x-frame-options'),
  );
}

// .wasm, /data/, /pagefind/ rules cannot be exercised yet: no such files exist in dist/ (later stages).
process.exit(failed ? 1 : 0);
