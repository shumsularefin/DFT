import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import { dot, inv3, mul, transpose } from './linalg';
import {
  cartToFrac,
  cellVolume,
  fracToCart,
  fromParameters,
  guessCellType,
  latticeParameters,
  minimumImageDistance,
  reciprocalLattice,
  wrapFrac,
} from './lattice';
import type { Mat3, Vec3 } from './types';

const lattices = Object.entries(bz.lattices);

describe('reciprocal lattice versus bz_geometry.json (S-034)', () => {
  it('has 12 lattices', () => expect(lattices).toHaveLength(12));
  it.each(lattices)('%s: rows and volume', (_n, L) => {
    const d = L.direct_lattice_rows as unknown as Mat3;
    const ref = L.reciprocal_lattice_rows_with_2pi;
    const r = reciprocalLattice(d);
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++) expect(Math.abs(r[i]![k]! - ref[i]![k]!)).toBeLessThan(1e-10);
    expect(Math.abs(cellVolume(d) - L.cell_volume)).toBeLessThan(1e-10);
    const prod = mul(r, transpose(d));
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++)
        expect(Math.abs(prod[i]![k]! - (i === k ? 2 * Math.PI : 0))).toBeLessThan(1e-10);
  });
});

describe('volume', () => {
  it('fcc primitive a = 3.61 is a^3/4', () => {
    const m: Mat3 = [
      [0, 1.805, 1.805],
      [1.805, 0, 1.805],
      [1.805, 1.805, 0],
    ];
    expect(cellVolume(m)).toBeCloseTo(3.61 ** 3 / 4, 10);
  });
});

describe('fromParameters', () => {
  it('hexagonal round trip', () => {
    const m = fromParameters(3.2, 3.2, 5.2, 90, 90, 120);
    const p = latticeParameters(m);
    expect(p.a).toBeCloseTo(3.2, 12);
    expect(p.c).toBeCloseTo(5.2, 12);
    expect(p.gamma).toBeCloseTo(120, 10);
    expect(cellVolume(m)).toBeCloseTo(3.2 * 3.2 * 5.2 * Math.sin((120 * Math.PI) / 180), 10);
  });
  it('triclinic round trip', () => {
    const p = latticeParameters(fromParameters(3, 4, 5, 70, 80, 95));
    expect([p.a, p.b, p.c, p.alpha, p.beta, p.gamma].map((x) => +x.toFixed(9))).toEqual([
      3, 4, 5, 70, 80, 95,
    ]);
  });
});

describe('coordinates', () => {
  const m = fromParameters(3, 4, 5, 70, 80, 95);
  it('cart and frac are inverse', () => {
    const f: Vec3 = [0.12, 0.7, 0.33];
    const g = cartToFrac(fracToCart(f, m), m);
    g.forEach((x, i) => expect(x).toBeCloseTo(f[i]!, 12));
    expect(inv3(m)).toBeDefined();
  });
  it('wrapFrac maps into [0,1) with no -0 and near-1 to 0', () => {
    expect(wrapFrac([1.25, -0.25, -1e-15])).toEqual([0.25, 0.75, 0]);
    expect(Object.is(wrapFrac([-0, 0, 0])[0], 0)).toBe(true);
    expect(wrapFrac([1 - 1e-13, 2, -3])).toEqual([0, 0, 0]);
  });
});

describe('minimumImageDistance versus brute force on a skewed cell', () => {
  const m: Mat3 = [
    [4, 0, 0],
    [2.5, 3, 0],
    [1, 1.2, 4.5],
  ];
  it('matches a 7x7x7 search', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let t = 0; t < 40; t++) {
      const a: Vec3 = [rnd(), rnd(), rnd()];
      const b: Vec3 = [rnd(), rnd(), rnd()];
      let best = Infinity;
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++)
          for (let k = -3; k <= 3; k++) {
            const c = fracToCart([a[0] - b[0] + i, a[1] - b[1] + j, a[2] - b[2] + k], m);
            best = Math.min(best, Math.sqrt(dot(c, c)));
          }
      expect(minimumImageDistance(a, b, m)).toBeCloseTo(best, 10);
    }
  });
});

describe('guessCellType reports the lattice metric class, not a Bravais lattice', () => {
  it('cubic, tetragonal, orthorhombic, hexagonal, monoclinic, triclinic', () => {
    expect(guessCellType(fromParameters(4, 4, 4, 90, 90, 90))).toBe('cubic');
    expect(guessCellType(fromParameters(4, 4, 5, 90, 90, 90))).toBe('tetragonal');
    expect(guessCellType(fromParameters(3, 4, 5, 90, 90, 90))).toBe('orthorhombic');
    expect(guessCellType(fromParameters(3, 3, 5, 90, 90, 120))).toBe('hexagonal');
    expect(guessCellType(fromParameters(3, 4, 5, 90, 100, 90))).toBe('monoclinic');
    expect(guessCellType(fromParameters(3, 4, 5, 70, 80, 95))).toBe('triclinic');
  });
  it('fcc primitive reports rhombohedral (documented limitation)', () => {
    expect(
      guessCellType([
        [0, 1.805, 1.805],
        [1.805, 0, 1.805],
        [1.805, 1.805, 0],
      ]),
    ).toBe('rhombohedral');
  });
});
