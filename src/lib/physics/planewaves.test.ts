import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Mat3 } from '../crystal/types';
import { HBAR2_OVER_2M_EV_A2 } from './constants';
import {
  continuumEstimate,
  cutoffRadius,
  gVectorsWithin,
  indexBounds,
  reciprocalVolume,
  relativeBasisSize,
  tooLargeToEnumerate,
} from './planewaves';

interface Row {
  cell: string;
  lattice_rows: Mat3;
  encut_eV: number;
  G_cut_1_per_A: number;
  n_pw_exact: number;
  n_pw_continuum_estimate: number;
}
const ref = JSON.parse(readFileSync('tests/reference/pw_kmesh_reference.json', 'utf8'))
  .plane_wave_counts as Row[];

describe('plane-wave counts against the golden file', () => {
  it('has 4 cells x 5 cutoffs', () => expect(ref).toHaveLength(20));
  for (const r of ref) {
    it(`${r.cell} at ${r.encut_eV} eV`, () => {
      const s = gVectorsWithin(r.lattice_rows, r.encut_eV);
      expect(s.count).toBe(r.n_pw_exact);
      expect(s.vectors.length).toBe(3 * r.n_pw_exact);
      expect(s.gCut).toBeCloseTo(r.G_cut_1_per_A, 3);
      expect(s.continuum).toBeCloseTo(r.n_pw_continuum_estimate, 2);
    });
  }
  it('fcc Cu: 181 exact at 400 eV against the 213.7 estimate, 331 at 520 eV', () => {
    const cu = ref.find((r) => r.cell.startsWith('fcc_Cu') && r.encut_eV === 400)!;
    const s = gVectorsWithin(cu.lattice_rows, 400);
    expect(s.count).toBe(181);
    expect(s.continuum).toBeCloseTo(213.66, 1);
    expect(s.ratio).toBeLessThan(0.9);
    expect(gVectorsWithin(cu.lattice_rows, 520).count).toBe(331);
  });
});

describe('plane-wave properties', () => {
  const fcc = ref.find((r) => r.cell.startsWith('fcc_Cu'))!.lattice_rows;
  // Same lattice, skewed basis: a1' = a1, a2' = a2 + 3 a1, a3' = a3 - 2 a2 + 5 a1 (unimodular).
  const [a1, a2, a3] = fcc;
  const skew: Mat3 = [
    a1,
    [a2[0] + 3 * a1[0], a2[1] + 3 * a1[1], a2[2] + 3 * a1[2]],
    [a3[0] - 2 * a2[0] + 5 * a1[0], a3[1] - 2 * a2[1] + 5 * a1[1], a3[2] - 2 * a2[2] + 5 * a1[2]],
  ];
  it('is invariant under a unimodular change of basis', () => {
    for (const e of [100, 300, 520]) expect(gVectorsWithin(skew, e).count).toBe(gVectorsWithin(fcc, e).count);
  });
  it('is non-decreasing in ENCUT, and only G = 0 at zero', () => {
    let prev = 0;
    for (let e = 0; e <= 800; e += 25) {
      const c = gVectorsWithin(fcc, e).count;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
    const z = gVectorsWithin(fcc, 0);
    expect(z.count).toBe(1);
    expect(Array.from(z.vectors)).toEqual([0, 0, 0]);
  });
  it('every listed vector is inside the sphere and the list has no duplicates', () => {
    const s = gVectorsWithin(skew, 300);
    const seen = new Set<string>();
    for (let i = 0; i < s.count; i++) {
      const g2 = s.vectors[3 * i]! ** 2 + s.vectors[3 * i + 1]! ** 2 + s.vectors[3 * i + 2]! ** 2;
      expect(HBAR2_OVER_2M_EV_A2 * g2).toBeLessThanOrEqual(300 * (1 + 1e-9));
      seen.add(`${s.indices[3 * i]},${s.indices[3 * i + 1]},${s.indices[3 * i + 2]}`);
    }
    expect(seen.size).toBe(s.count);
  });
  it('index bounds are the rigorous ones', () => {
    const [n1] = indexBounds(
      [
        [10, 0, 0],
        [0, 10, 0],
        [0, 0, 10],
      ],
      400,
    );
    expect(n1).toBe(Math.floor((cutoffRadius(400) * 10) / (2 * Math.PI)));
  });
  it('continuum estimate matches the algebra and helpers behave', () => {
    const kc = cutoffRadius(400);
    expect(continuumEstimate(fcc, 400)).toBeCloseTo(
      (Math.abs(1.805 ** 3 * 2) * kc ** 3) / (6 * Math.PI ** 2),
      6,
    );
    expect(reciprocalVolume(fcc)).toBeCloseTo((2 * Math.PI) ** 3 / (2 * 1.805 ** 3), 6);
    expect(relativeBasisSize(331, 181)).toBeCloseTo(1.8287, 3);
    expect(
      tooLargeToEnumerate(
        [
          [200, 0, 0],
          [0, 200, 0],
          [0, 0, 200],
        ],
        800,
      ),
    ).toBe(true);
    expect(() => gVectorsWithin(fcc, -1)).toThrow(RangeError);
    expect(() =>
      gVectorsWithin(
        [
          [1, 0, 0],
          [2, 0, 0],
          [0, 0, 1],
        ],
        100,
      ),
    ).toThrow(RangeError);
  });
});
