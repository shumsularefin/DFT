import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLinks } from './check-links.mjs';

function site(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'links-'));
  for (const [f, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), html);
  }
  return dir;
}

describe('checkLinks', () => {
  it('passes when pages, files and fragments exist and ignores external links', () => {
    const dir = site({
      'index.html':
        '<a href="/about/">a</a><a href="/about/#x">b</a><a href="/favicon.svg">c</a><a href="https://e.org/z">d</a>',
      'about/index.html': '<h2 id="x">X</h2>',
      'favicon.svg': '<svg/>',
    });
    expect(checkLinks(dir)).toEqual([]);
  });

  it('reports a missing page and a missing fragment', () => {
    const dir = site({
      'index.html': '<a href="/nope/">a</a><a href="/about/#y">b</a>',
      'about/index.html': '<h2 id="x">X</h2>',
    });
    const problems = checkLinks(dir);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('/nope/');
    expect(problems[1]).toContain('"y"');
  });
});
