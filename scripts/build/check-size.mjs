// Size budget check. Usage: node scripts/build/check-size.mjs [dist] [budgets.json]
// Per HTML page: classify by data-page-class, gzip the initial JS (script tags, modulepreload,
// statically imported chunks, inline scripts) and CSS (stylesheet links and inline styles),
// compare with budgets.json. Exits 1 on any violation or any page without a page class.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'pagefind' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

function resolveAsset(dist, from, ref) {
  if (/^(https?:)?\/\//.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0];
  return clean.startsWith('/') ? path.join(dist, clean) : path.resolve(path.dirname(from), clean);
}

function staticImports(file, seen) {
  if (seen.has(file) || !fs.existsSync(file)) return;
  seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  // static `import "./x.js"` and `from"./x.js"`; dynamic import() is lazy and not counted
  for (const m of src.matchAll(/(?:\bimport\s*|\bfrom\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    staticImports(path.resolve(path.dirname(file), m[1]), seen);
  }
}

export function checkSize(dist, budgets) {
  const rows = [];
  const violations = [];
  for (const file of htmlFiles(dist)) {
    const page = '/' + path.relative(dist, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const cls = html.match(/<html[^>]*\sdata-page-class="([^"]+)"/)?.[1];
    if (!cls) {
      violations.push(`${page}: missing data-page-class on <html>`);
      continue;
    }
    const budget = budgets.pageClasses[cls];
    if (!budget) {
      violations.push(`${page}: unknown page class "${cls}"`);
      continue;
    }
    const jsFiles = new Set();
    let inlineJs = 0;
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const src = m[1].match(/\ssrc="([^"]+)"/)?.[1];
      if (src) {
        const abs = resolveAsset(dist, file, src);
        if (abs) staticImports(abs, jsFiles);
      } else if (!/type="(application\/ld\+json|application\/json)"/.test(m[1])) {
        inlineJs += gz(Buffer.from(m[2]));
      }
    }
    for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) {
      const abs = resolveAsset(dist, file, m[1]);
      if (abs) staticImports(abs, jsFiles);
    }
    // Astro islands load their component and renderer chunks as soon as they hydrate
    for (const m of html.matchAll(/\s(?:component-url|renderer-url)="([^"]+)"/g)) {
      const abs = resolveAsset(dist, file, m[1]);
      if (abs) staticImports(abs, jsFiles);
    }
    let js = inlineJs;
    for (const f of jsFiles) js += gz(fs.readFileSync(f));
    let css = 0;
    for (const m of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)) {
      const abs = resolveAsset(dist, file, m[1]);
      if (abs && fs.existsSync(abs)) css += gz(fs.readFileSync(abs));
    }
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css += gz(Buffer.from(m[1]));
    const row = {
      page,
      cls,
      jsKB: js / 1024,
      cssKB: css / 1024,
      jsMax: budget.initialJsKB,
      cssMax: budget.cssKB,
    };
    rows.push(row);
    if (row.jsKB > row.jsMax)
      violations.push(`${page}: JS ${row.jsKB.toFixed(2)} KB > ${budget.initialJsKB} KB`);
    if (row.cssKB > row.cssMax)
      violations.push(`${page}: CSS ${row.cssKB.toFixed(2)} KB > ${budget.cssKB} KB`);
  }
  return { rows, violations };
}

/**
 * Lazy chunks: each budgets.lazyChunks entry names a string that identifies its JS files (for example
 * "WebGLRenderer" for three) and a gzip cap. Files under dist/ that contain the string are summed.
 * An entry that matches nothing is a violation, so a renamed or dropped chunk cannot pass silently.
 */
export function checkLazyChunks(dist, budgets) {
  const rows = [];
  const violations = [];
  const jsDir = path.join(dist, '_astro');
  const files = fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')) : [];
  for (const [name, { contains, maxKB }] of Object.entries(budgets.lazyChunks ?? {})) {
    let bytes = 0;
    let matched = 0;
    for (const f of files) {
      const buf = fs.readFileSync(path.join(jsDir, f));
      if (buf.includes(contains)) {
        bytes += gz(buf);
        matched++;
      }
    }
    const kb = bytes / 1024;
    rows.push({ name, kb, maxKB, matched });
    if (!matched) violations.push(`lazy chunk "${name}": no file contains "${contains}"`);
    else if (kb > maxKB) violations.push(`lazy chunk "${name}": ${kb.toFixed(1)} KB > ${maxKB} KB`);
  }
  return { rows, violations };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const budgets = JSON.parse(fs.readFileSync(process.argv[3] ?? 'budgets.json', 'utf8'));
  const size = checkSize(dist, budgets);
  const lazy = checkLazyChunks(dist, budgets);
  const { rows } = size;
  const violations = [...size.violations, ...lazy.violations];
  console.log('page'.padEnd(52) + 'class'.padEnd(10) + 'JS gz KB'.padEnd(18) + 'CSS gz KB');
  for (const r of rows) {
    console.log(
      r.page.padEnd(52) +
        r.cls.padEnd(10) +
        `${r.jsKB.toFixed(2)}/${r.jsMax}`.padEnd(18) +
        `${r.cssKB.toFixed(2)}/${r.cssMax}`,
    );
  }
  for (const r of lazy.rows)
    console.log(`lazy chunk ${r.name}: ${r.kb.toFixed(1)}/${r.maxKB} KB gz (${r.matched} file(s))`);
  if (violations.length) {
    console.error('\nSize budget violations:\n' + violations.map((v) => '  ' + v).join('\n'));
    process.exit(1);
  }
  console.log('\nSize budgets OK');
}
