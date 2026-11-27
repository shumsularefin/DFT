import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_PAGES, buildTagPages, parseList } from './build-tag-pages.mjs';

describe('parseList', () => {
  it('reads a front matter list', () => {
    expect(parseList('[ENCUT, PREC]')).toEqual(['ENCUT', 'PREC']);
    expect(parseList('[]')).toEqual([]);
    expect(parseList(undefined)).toEqual([]);
  });
});

describe('buildTagPages', () => {
  const pages = buildTagPages('.') as Record<string, { href: string; title: string }[]>;

  it('matches the committed src/data/tag-pages.json', () => {
    const committed = JSON.parse(fs.readFileSync('src/data/tag-pages.json', 'utf8'));
    expect(pages).toEqual(committed);
  });

  it('links only to handbook topics that exist, at most MAX_PAGES per tag, never the site tour', () => {
    for (const list of Object.values(pages)) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(MAX_PAGES);
      for (const p of list) {
        expect(p.href).toMatch(/^\/handbook\/[^/]+\/[^/]+\/$/);
        expect(p.href.startsWith('/handbook/00-start/')).toBe(false);
        const file = `src/content${p.href.replace(/\/$/, '')}.mdx`;
        expect(fs.existsSync(file), file).toBe(true);
      }
    }
  });

  it('puts the topic about a tag first', () => {
    expect(pages.LDAU?.[0]?.href).toBe('/handbook/05-practical-choices/dft-plus-u/');
    expect(pages.ISMEAR?.[0]?.href).toBe('/handbook/05-practical-choices/smearing/');
  });
});
