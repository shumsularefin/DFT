import { describe, expect, it } from 'vitest';
import kpaths from '../../../tests/reference/kpaths.json';
import { symbolOf } from './elements';
import { angle, coordination, dihedral, distance, minimumImageVector } from './measure';
import { supercell } from './structure';
import type { Mat3, Structure, Vec3 } from './types';

type Input = { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
const fixture = (name: string): Structure => {
  const d = (kpaths.structures as unknown as Record<string, { input: Input }>)[name]!.input;
  return {
    lattice: d.lattice_rows as unknown as Mat3,
    frac: d.frac_coords as unknown as Vec3[],
    species: d.atomic_numbers.map((z) => symbolOf(z)!),
  };
};
const nacl = fixture('rocksalt_NaCl');
const a = nacl.lattice[0][0];
const na0 = nacl.species.indexOf('Na');
const cl = nacl.species.map((s, i) => (s === 'Cl' ? i : -1)).filter((i) => i >= 0);

describe('measure on golden rock-salt NaCl', () => {
  it('Na to its nearest Cl is half the lattice parameter', () => {
    const d = Math.min(...cl.map((j) => distance(nacl, na0, j)));
    expect(d).toBeCloseTo(a / 2, 9);
  });
  it('Cl-Na-Cl angles are 90 and 180 degrees (in a 2x2x2 cell, where opposite neighbours are distinct sites)', () => {
    const big = supercell(nacl, 2, 2, 2);
    const na = big.species.indexOf('Na');
    const near = big.species
      .map((sp, j) => (sp === 'Cl' && Math.abs(distance(big, na, j) - a / 2) < 1e-9 ? j : -1))
      .filter((j) => j >= 0);
    expect(near.length).toBe(6);
    const angles = new Set<number>();
    for (const p of near)
      for (const q of near)
        if (p < q) {
          const v = angle(big, p, na, q);
          expect(Math.min(Math.abs(v - 90), Math.abs(v - 180))).toBeLessThan(1e-9);
          angles.add(Math.round(v));
        }
    expect([...angles].sort((x, y) => x - y)).toEqual([90, 180]);
  });
  it('uses the minimum image across the cell boundary', () => {
    const s: Structure = {
      ...nacl,
      frac: [
        [0.05, 0.5, 0.5],
        [0.95, 0.5, 0.5],
      ],
      species: ['Na', 'Na'],
    };
    expect(distance(s, 0, 1)).toBeCloseTo(0.1 * a, 9);
    expect(minimumImageVector(s, 0, 1)[0]).toBeCloseTo(-0.1 * a, 9);
  });
  it('each Na has six Cl neighbours by the bond rule, counting images', () => {
    const c = coordination(nacl, na0);
    expect(c.count).toBe(6);
    for (const d of c.distances) expect(d).toBeCloseTo(a / 2, 9);
  });
});

describe('dihedral', () => {
  const sq: Structure = {
    lattice: [
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ] as Mat3,
    species: ['C', 'C', 'C', 'C'],
    frac: [
      [0.1, 0.2, 0],
      [0.1, 0.1, 0],
      [0.2, 0.1, 0],
      [0.2, 0.1, 0.1],
    ],
  };
  it('is 90 degrees for perpendicular planes and its sign flips with the chain direction', () => {
    const d = dihedral(sq, 0, 1, 2, 3);
    expect(Math.abs(d)).toBeCloseTo(90, 9);
    expect(dihedral(sq, 3, 2, 1, 0)).toBeCloseTo(d, 9);
  });
  it('is 0 for a planar cis chain', () => {
    const s = {
      ...sq,
      frac: [
        [0.1, 0.2, 0],
        [0.1, 0.1, 0],
        [0.2, 0.1, 0],
        [0.2, 0.2, 0],
      ] as Vec3[],
    };
    expect(dihedral(s, 0, 1, 2, 3)).toBeCloseTo(0, 9);
  });
});
