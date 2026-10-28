// Post-build step. Runs Pagefind over dist/ only if any page carries data-pagefind-body.
// Then generates the service worker (sw.mjs). Pagefind runs first so its files exist before the worker.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'pagefind' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const indexable = htmlFiles(dist).some((f) => fs.readFileSync(f, 'utf8').includes('data-pagefind-body'));
if (indexable) {
  execFileSync('npx', ['pagefind', '--site', 'dist'], { stdio: 'inherit' });
} else {
  console.log('postbuild: no data-pagefind-body pages, skipping Pagefind');
}

await import('./sw.mjs');
