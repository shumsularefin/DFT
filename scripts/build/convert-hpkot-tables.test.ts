import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSpaceGroups, convertVariants } from './convert-hpkot-tables.mjs';
import variants from '../../src/data/kpath/hpkot/variants.json';
import groups from '../../src/data/kpath/hpkot/spacegroups.json';

function tmp(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hpkot-'));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
  return d;
}

describe('convertVariants', () => {
  it('parses a variant directory', () => {
    const d = tmp({
      'x1/k_vector_parameters.txt': 'F (1+a/c)/4\n',
      'x1/points.txt': 'GAMMA 0 0 0\nX 1/2 F 0\n',
      'x1/path.txt': 'GAMMA X\n',
    });
    expect(convertVariants(d)).toEqual({
      x1: {
        kparams: [['F', '(1+a/c)/4']],
        points: { GAMMA: ['0', '0', '0'], X: ['1/2', 'F', '0'] },
        path: [['GAMMA', 'X']],
      },
    });
  });
  it('rejects a path that names an undefined point', () => {
    const d = tmp({
      'x1/k_vector_parameters.txt': '',
      'x1/points.txt': 'GAMMA 0 0 0\n',
      'x1/path.txt': 'GAMMA Q\n',
    });
    expect(() => convertVariants(d)).toThrow(/not defined/);
  });
  it('rejects a malformed point line and a duplicate point', () => {
    expect(() =>
      convertVariants(
        tmp({ 'x1/k_vector_parameters.txt': '', 'x1/points.txt': 'GAMMA 0 0\n', 'x1/path.txt': '' }),
      ),
    ).toThrow(/bad point/);
    expect(() =>
      convertVariants(
        tmp({ 'x1/k_vector_parameters.txt': '', 'x1/points.txt': 'A 0 0 0\nA 1 1 1\n', 'x1/path.txt': '' }),
      ),
    ).toThrow(/twice/);
  });
});

describe('convertSpaceGroups', () => {
  it('refuses a file without all 230 groups', () => {
    const d = tmp({ 'spg_db.py': "    1: ('a', 'P', False),\n" });
    expect(() => convertSpaceGroups(path.join(d, 'spg_db.py'))).toThrow(/230/);
  });
});

describe('committed tables', () => {
  it('have 29 variants, 230 groups and consistent paths', () => {
    expect(Object.keys(variants.variants)).toHaveLength(29);
    expect(Object.keys(groups.groups)).toHaveLength(230);
    for (const v of Object.values(variants.variants) as {
      points: Record<string, string[]>;
      path: string[][];
    }[])
      for (const seg of v.path) for (const p of seg) expect(v.points[p]).toBeDefined();
  });
  it('known groups: Fm-3m is cF with inversion, F23 is cF without', () => {
    const g = groups.groups as unknown as Record<string, [string, string, boolean]>;
    expect(g['225']).toEqual(['c', 'F', true]);
    expect(g['196']).toEqual(['c', 'F', false]);
  });
});
