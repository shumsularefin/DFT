import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSize } from './check-size.mjs';

const budgets = {
  pageClasses: { content: { initialJsKB: 1, cssKB: 1 } },
  lazyChunks: {},
};
const dirs: string[] = [];

function fixture(files: Record<string, string | Buffer>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dft-dist-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// Random bytes do not compress, so the gzip size is about the raw size.
const noise = (n: number) => crypto.randomBytes(n);

describe('checkSize', () => {
  it('passes a page inside its budget', () => {
    const dist = fixture({
      'index.html': '<html lang="en" data-page-class="content"><head></head><body>x</body></html>',
    });
    const { rows, violations } = checkSize(dist, budgets);
    expect(violations).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('fails when initial JS exceeds the budget, following static imports only', () => {
    const dist = fixture({
      'index.html':
        '<html data-page-class="content"><body><script type="module" src="/_astro/a.js"></script></body></html>',
      '_astro/a.js': `import"./b.js";${noise(100).toString('hex')}`,
      '_astro/b.js': noise(2000),
      '_astro/lazy.js': noise(5000),
    });
    const { violations } = checkSize(dist, budgets);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/JS .* > 1 KB/);
  });

  it('does not count dynamic imports', () => {
    const dist = fixture({
      'index.html':
        '<html data-page-class="content"><body><script type="module" src="/_astro/a.js"></script></body></html>',
      '_astro/a.js': 'import("./b.js");',
      '_astro/b.js': noise(5000),
    });
    expect(checkSize(dist, budgets).violations).toEqual([]);
  });

  it('counts island component and renderer chunks', () => {
    const dist = fixture({
      'index.html':
        '<html data-page-class="content"><body><astro-island component-url="/_astro/c.js" renderer-url="/_astro/r.js"></astro-island></body></html>',
      '_astro/c.js': noise(600),
      '_astro/r.js': noise(600),
    });
    expect(checkSize(dist, budgets).violations[0]).toMatch(/JS .* > 1 KB/);
  });

  it('fails when CSS exceeds the budget', () => {
    const dist = fixture({
      'index.html':
        '<html data-page-class="content"><head><link rel="stylesheet" href="/_astro/s.css"></head></html>',
      '_astro/s.css': noise(3000),
    });
    expect(checkSize(dist, budgets).violations[0]).toMatch(/CSS .* > 1 KB/);
  });

  it('fails a page without data-page-class', () => {
    const dist = fixture({ 'x/index.html': '<html lang="en"><body>x</body></html>' });
    expect(checkSize(dist, budgets).violations[0]).toMatch(/missing data-page-class/);
  });
});
