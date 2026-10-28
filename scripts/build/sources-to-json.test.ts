import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSources } from './sources-to-json.mjs';

const fixture = `# Register

| ID | Citation | Used for | Access | Status | Notes |
|---|---|---|---|---|---|
| S-001 | A. Author, "Title", J. 1, 2 (2000) | things | open | read | checked p. 3 |
| S-002 | B. Author, Book | more | book | cited-from-memory | |

Some text with S-003 in it that is not a row.
`;

describe('parseSources', () => {
  it('parses rows of a small fixture', () => {
    expect(parseSources(fixture)).toEqual([
      {
        id: 'S-001',
        citation: 'A. Author, "Title", J. 1, 2 (2000)',
        usedFor: 'things',
        access: 'open',
        status: 'read',
        notes: 'checked p. 3',
      },
      {
        id: 'S-002',
        citation: 'B. Author, Book',
        usedFor: 'more',
        access: 'book',
        status: 'cited-from-memory',
        notes: '',
      },
    ]);
  });

  it('rejects a row with the wrong number of columns', () => {
    expect(() => parseSources('| S-009 | only | three |')).toThrow(/columns/);
  });

  it('the real register: row count equals the number of "| S-" lines, ids unique and sorted as written', () => {
    const md = fs.readFileSync('docs/SCIENCE_SOURCES.md', 'utf8');
    const rows = parseSources(md);
    expect(rows.length).toBe(md.split('\n').filter((l) => l.startsWith('| S-')).length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) expect(r.status).toMatch(/^[a-z-]+$/);
  });
});
