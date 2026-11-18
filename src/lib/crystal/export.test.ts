import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import kp from '../../../tests/reference/kpaths.json';
import { symbolOf } from './elements';
import { exportCifP1, exportCifSymmetrized, exportExtendedXyz, exportPoscar } from './export';
import { formatSymopComponent, parseSymop } from './cif';
import { readStructure } from './io';
import { latticeParameters } from './lattice';
import { loadMoyoNode } from './moyo-node';
import { analyzeWith, type MoyoApi } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

type KIn = { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
const K = kp.structures as unknown as Record<string, { input: KIn }>;
const fromK = (n: string): Structure => {
  const i = K[n]!.input;
  return { lattice: i.lattice_rows, species: i.atomic_numbers.map((z) => symbolOf(z)!), frac: i.frac_coords };
};
const fixture = (f: string) =>
  readStructure(f, fs.readFileSync(`tests/reference/cif/${f}`, 'utf8')).structure;
const TOL = 1e-8;
const minImg = (x: number) => x - Math.round(x);

/** Same cell (parameters, or the matrix when `matrix`) and the same atoms in the same order. */
function expectSame(a: Structure, b: Structure, matrix: boolean) {
  expect(b.species).toEqual(a.species);
  if (matrix)
    a.lattice.forEach((r, i) =>
      r.forEach((x, j) => expect(Math.abs(x - b.lattice[i]![j]!)).toBeLessThan(TOL)),
    );
  else {
    const p = latticeParameters(a.lattice);
    const q = latticeParameters(b.lattice);
    for (const k of ['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const)
      expect(Math.abs(p[k] - q[k]), k).toBeLessThan(TOL);
  }
  a.frac.forEach((f, i) =>
    f.forEach((x, k) => expect(Math.abs(minImg(x - b.frac[i]![k]!)), `atom ${i}`).toBeLessThan(TOL)),
  );
}
/** Same atoms as a set (order free), for a symmetry-expanded file. */
function expectSameSet(a: Structure, b: Structure) {
  expect(b.species.length).toBe(a.species.length);
  const used = new Set<number>();
  a.frac.forEach((f, i) => {
    const j = b.frac.findIndex(
      (g, k) =>
        !used.has(k) && b.species[k] === a.species[i] && g.every((x, c) => Math.abs(minImg(x - f[c]!)) < TOL),
    );
    expect(j, `atom ${i} (${a.species[i]})`).toBeGreaterThanOrEqual(0);
    used.add(j);
  });
}

const STRUCTS: [string, Structure][] = [
  ['NaCl', fromK('rocksalt_NaCl')],
  ['SrTiO3', fromK('cubic_perovskite_SrTiO3')],
  ['triclinic', fixture('triclinic_P1bar.p1.cif')],
  ['alpha-Al2O3', fixture('rhombohedral_alpha_Al2O3.p1.cif')],
  ['graphite', fixture('graphite_hex.p1.cif')],
];

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

describe('round trips through readStructure (to 1e-8)', () => {
  for (const [name, s] of STRUCTS) {
    it(`${name}: POSCAR`, () => {
      const r = exportPoscar(s);
      expect(r.notes).toEqual([]); // already grouped
      expectSame(s, readStructure('POSCAR', r.text).structure, true);
    });
    it(`${name}: CIF P1`, () => expectSame(s, readStructure('x.cif', exportCifP1(s).text).structure, false));
    it(`${name}: extended XYZ`, () => {
      const back = readStructure('x.xyz', exportExtendedXyz(s).text);
      expect(back.warnings).toEqual([]);
      expectSame(s, back.structure, true);
    });
    it(`${name}: CIF with symmetry expands to the same conventional cell`, () => {
      const r = exportCifSymmetrized(api, s);
      const conv = analyzeWith(api, s, { symprec: 1e-4 }).stdCell;
      const back = readStructure('x.cif', r.text).structure;
      expectSameSet(conv, back);
      const p = latticeParameters(conv.lattice);
      const q = latticeParameters(back.lattice);
      for (const k of ['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const)
        expect(Math.abs(p[k] - q[k]), k).toBeLessThan(TOL);
    });
  }
  it('POSCAR keeps selective dynamics and reports regrouping', () => {
    const s = fromK('rocksalt_NaCl');
    const mixed: Structure = {
      ...s,
      species: ['Na', 'Cl', ...s.species.slice(2)],
      selective: s.frac.map((_, i) => [i % 2 === 0, true, false] as const),
    };
    const r = exportPoscar(mixed);
    expect(r.notes[0]).toMatch(/regrouped/);
    expect(readStructure('POSCAR', r.text).structure.selective).toHaveLength(8);
  });
  it('the symmetrized NaCl file lists 2 unique atoms', () => {
    const t = exportCifSymmetrized(api, fromK('rocksalt_NaCl')).text;
    expect(t).toContain("_symmetry_space_group_name_H-M   'F m -3 m'");
    expect(t.split('\n').filter((l) => /^ {2}(Na|Cl) /.test(l))).toHaveLength(2);
  });
});

describe('symmetry operation text', () => {
  it('formats and parses back', () => {
    const cases: [number[][], Vec3, string][] = [
      [
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [0, 0, 0],
        'x, y, z',
      ],
      [
        [
          [-1, 1, 0],
          [-1, 0, 0],
          [0, 0, -1],
        ],
        [0.5, 1 / 3, 0.75],
        '-x+y+1/2, -x+1/3, -z+3/4',
      ],
      [
        [
          [0, -1, 0],
          [1, 0, 0],
          [0, 0, 1],
        ],
        [-0.5, 1, 1 / 6],
        '-y+1/2, x, z+1/6',
      ],
    ];
    for (const [R, t, text] of cases) {
      const s = R.map((r, k) => formatSymopComponent(r, t[k]!)).join(', ');
      expect(s).toBe(text);
      const op = parseSymop(s);
      expect(op.rotation).toEqual(R);
      op.translation.forEach((x, k) => expect(minImg(x - t[k]!)).toBeCloseTo(0, 12));
    }
  });
});
