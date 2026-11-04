import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import { cellVolume } from './lattice';
import { det3, dot } from './linalg';
import { delaunayReduction, reduceBasis } from './reduction';
import type { Mat3 } from './types';

describe('reduceBasis', () => {
  it.each(Object.keys(bz.lattices))('%s: unimodular transform, same volume, obtuse superbase', (id) => {
    const A = (bz.lattices as Record<string, { direct_lattice_rows: number[][] }>)[id]!
      .direct_lattice_rows as unknown as Mat3;
    const { reduced, transform } = reduceBasis(A);
    expect(Math.abs(det3(transform as unknown as Mat3))).toBe(1);
    expect(cellVolume(reduced)).toBeCloseTo(cellVolume(A), 10);
    expect(delaunayReduction(A)).toEqual(transform);
    // the three reduced vectors and v0 = -(a1 + a2 + a3) have non-positive pairwise dot products
    const v0 = [0, 1, 2].map((k) => -(reduced[0][k]! + reduced[1][k]! + reduced[2][k]!)) as unknown as [
      number,
      number,
      number,
    ];
    const s = [v0, ...reduced];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(dot(s[i]!, s[j]!)).toBeLessThan(1e-9);
  });
  it('shortens a badly skewed cubic basis (lengths 1 and 7 and 10) to short vectors', () => {
    const { reduced } = reduceBasis([
      [1, 0, 0],
      [7, 1, 0],
      [-5, 9, 1],
    ]);
    // ties are allowed in an obtuse superbase, so a reduced vector may be a face diagonal (sqrt 2) but never longer than sqrt 3
    reduced.forEach((r) => expect(Math.hypot(...r)).toBeLessThanOrEqual(Math.sqrt(3) + 1e-9));
  });
});
