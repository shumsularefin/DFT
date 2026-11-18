import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/magnetic_reference.json';
import kpaths from '../../../tests/reference/kpaths.json';
import { cellVolume } from './lattice';
import { det3 } from './linalg';
import { supercell as diagonalRepeat } from './structure';
import {
  buildSupercell,
  commensurateFor,
  determinant,
  diagonalSupercell,
  hermiteNormalForms,
  minimalCommensurateSupercell,
  minimalCommonSupercell,
  supercell,
} from './supercell';
import type { IntMat3 } from './reduction';
import type { Mat3, Structure, Vec3 } from './types';
import { symbolOf } from './elements';

type Input = { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
const fixture = (name: string): Structure => {
  const d = (kpaths.structures as unknown as Record<string, { input: Input }>)[name]!.input;
  return {
    lattice: d.lattice_rows as unknown as Mat3,
    frac: d.frac_coords as unknown as Vec3[],
    species: d.atomic_numbers.map((z) => symbolOf(z)!),
  };
};
const sto = fixture('cubic_perovskite_SrTiO3');
const nacl = fixture('rocksalt_NaCl');
const cases = golden.orderings.cubic_perovskite_SrTiO3.cases;

describe('hermiteNormalForms', () => {
  it('counts HNF matrices of determinant n (sum of d1 d2^2 d3^3 style counts: 1, 7, 13, 35)', () => {
    // number of sublattices of index n of Z^3 is sigma-type sequence A001001: 1, 7, 13, 35, 31, 91
    expect([1, 2, 3, 4, 5, 6].map((n) => hermiteNormalForms(n).length)).toEqual([1, 7, 13, 35, 31, 91]);
  });
  it('every matrix is lower triangular with the stated bounds and determinant', () => {
    for (const h of hermiteNormalForms(4)) {
      expect(determinant(h)).toBe(4);
      expect(h[0][1]).toBe(0);
      expect(h[0][2]).toBe(0);
      expect(h[1][2]).toBe(0);
    }
  });
});

describe('buildSupercell', () => {
  it('rejects non-integer matrices and det <= 0', () => {
    expect(() =>
      supercell(sto, [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]),
    ).toThrow(RangeError);
    expect(() =>
      supercell(sto, [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 1],
      ]),
    ).toThrow(RangeError);
    expect(() =>
      supercell(sto, [
        [1.5, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as unknown as IntMat3),
    ).toThrow(RangeError);
  });

  it('a diagonal matrix gives the same sites in the same order as the existing na x nb x nc repeat', () => {
    const a = diagonalSupercell(nacl, 2, 1, 3);
    const b = diagonalRepeat(nacl, 2, 1, 3);
    expect(a.species).toEqual(b.species);
    a.frac.forEach((f, i) => f.forEach((x, k) => expect(x).toBeCloseTo(b.frac[i]![k]!, 12)));
  });

  it('non-diagonal matrix: det(M) copies, volume scales, every site in [0, 1), no two sites overlap', () => {
    const M: IntMat3 = [
      [1, 1, 0],
      [-1, 1, 0],
      [0, 0, 2],
    ];
    const r = buildSupercell(sto, M);
    expect(r.structure.frac.length).toBe(5 * 4);
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(4 * cellVolume(sto.lattice), 9);
    expect(det3(r.structure.lattice)).toBeGreaterThan(0);
    for (const f of r.structure.frac) for (const x of f) expect(x >= 0 && x < 1).toBe(true);
    const keys = new Set(r.structure.frac.map((f) => f.map((x) => x.toFixed(6)).join(',')));
    expect(keys.size).toBe(20);
    // site j is parent site parentIndex[j] shifted by translation[j]
    expect(r.translations.length).toBe(20);
    expect(new Set(r.translations.map((t) => t.join(','))).size).toBe(4);
  });

  it('order is deterministic: translation-major (lexicographic), parent order inside each copy', () => {
    const r = buildSupercell(sto, [
      [1, 1, 0],
      [-1, 1, 0],
      [0, 0, 1],
    ]);
    expect(r.parentIndex).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
    expect(r.translations[0]).toEqual([0, 0, 0]);
    expect(r.translations[5]).toEqual([0, 1, 0]);
  });
});

describe('minimalCommensurateSupercell (golden: cubic perovskite)', () => {
  for (const kind of ['FM', 'A', 'C', 'G'] as const) {
    it(`${kind}: determinant and diagonal option match the golden file`, () => {
      const c = cases[kind];
      const k = c.k_parent as unknown as Vec3;
      const r = minimalCommensurateSupercell(sto, k);
      expect(determinant(r.matrix)).toBe(c.minimal_det);
      expect(commensurateFor(r.matrix, k)).toBe(true);
      // the returned cell is reduced but still a supercell of the same volume
      expect(cellVolume(r.structure.lattice)).toBeCloseTo(c.minimal_det * cellVolume(sto.lattice), 8);
      expect(r.structure.frac.length).toBe(c.minimal_cell.n_atoms);
    });
  }

  it('the four orderings together need determinant 4 (golden common_supercell)', () => {
    const ks = (['FM', 'A', 'C', 'G'] as const).map((kind) => cases[kind].k_parent as unknown as Vec3);
    const r = minimalCommonSupercell(sto, ks);
    expect(determinant(r.matrix)).toBe(golden.common_supercell.cubic_perovskite_SrTiO3.det);
    for (const k of ks) expect(commensurateFor(r.matrix, k)).toBe(true);
  });

  it('throws when no matrix up to the cap works (incommensurate k)', () => {
    expect(() => minimalCommensurateSupercell(sto, [1 / 7, 0, 0], { maxDet: 4 })).toThrow(RangeError);
  });
});
