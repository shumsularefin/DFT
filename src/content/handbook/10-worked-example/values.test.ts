import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

describe('Module 10 worked example values integrity (M7.6)', () => {
  it('traces every reported numerical result to values.json or displays the pending-data notice', () => {
    const manifest = JSON.parse(readFileSync(join(dir, 'values.json'), 'utf8')) as {
      status: string;
      values: { value: string; source: string }[];
    };
    const mdxFiles = readdirSync(dir).filter((f) => f.endsWith('.mdx'));
    expect(mdxFiles.length).toBe(6);

    const registered = new Set(manifest.values.map((v) => v.value));
    for (const file of mdxFiles) {
      const body = readFileSync(join(dir, file), 'utf8').replace(/^---[\s\S]*?---/, '');
      if (manifest.status === 'pending') {
        expect(body, `${file} must show the pending-data notice`).toContain(
          'Results pending: author data not yet supplied',
        );
        // Ensure no fabricated physical result numbers with units appear in body text
        const resultMatches = [...body.matchAll(/\b\d+\.\d+\s*(?:eV|GPa|mu_B|bohr)\b/g)];
        for (const m of resultMatches) {
          expect(registered.has(m[0]), `Unregistered result "${m[0]}" in ${file}`).toBe(true);
        }
      } else {
        for (const v of manifest.values) {
          expect(v.source.startsWith('data/author/') || v.source.startsWith('public/examples/')).toBe(true);
        }
      }
    }
  });
});
