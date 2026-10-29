// Fails when a built page links to an internal page or fragment that does not exist.
// Usage: node scripts/build/check-links.mjs [dist]   (also run in `npm run verify` after the build)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'pagefind' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

/** Returns a list of "page -> link: reason" strings, empty when every internal link resolves. */
export function checkLinks(dist) {
  const pages = new Map();
  for (const f of htmlFiles(dist)) {
    const rel = path.relative(dist, f).split(path.sep).join('/');
    const url = '/' + rel.replace(/(^|\/)index\.html$/, '$1');
    pages.set(url, fs.readFileSync(f, 'utf8'));
  }
  const problems = [];
  for (const [from, html] of pages) {
    for (const m of html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const [target, hash] = href.split('#');
      const clean = target.split('?')[0];
      const fileAsset = fs.existsSync(path.join(dist, clean)) && fs.statSync(path.join(dist, clean)).isFile();
      const page = pages.get(clean);
      if (!page && !fileAsset) {
        problems.push(`${from} -> ${href}: no such page`);
      } else if (
        hash &&
        page &&
        !new RegExp(`\\sid="${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(page)
      ) {
        problems.push(`${from} -> ${href}: no element with id "${hash}"`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const problems = checkLinks(dist);
  if (problems.length) {
    console.error(`check-links: ${problems.length} broken internal link(s)\n` + problems.join('\n'));
    process.exit(1);
  }
  console.log('check-links: all internal links resolve');
}
