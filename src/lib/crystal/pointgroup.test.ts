import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import { dot } from './linalg';
import { latticePointGroup, hasInversion, delaunayReduction, type IntMat3 } from './pointgroup';
import type { Mat3 } from './types';

const L = (id: keyof typeof bz.lattices): Mat3 => bz.lattices[id].direct_lattice_rows as unknown as Mat3;

// Holohedry orders from the work order (point group of the lattice, not of a crystal).
const ORDERS: [keyof typeof bz.lattices, number][] = [
  ['sc', 48],
  ['fcc_primitive', 48],
  ['bcc_primitive', 48],
  ['hex_ideal', 24],
  ['hex_tall', 24],
  ['rhombohedral', 12],
  ['tetragonal', 16],
  ['orthorhombic', 8],
  ['monoclinic', 4],
  ['triclinic', 2],
  ['fcc_skewed_basis', 48],
];

describe('lattice point group orders (holohedry)', () => {
  for (const [id, order] of ORDERS)
    it(`${id} has order ${order}`, () => {
      const g = latticePointGroup(L(id));
      expect(g).toHaveLength(order);
      expect(hasInversion(g)).toBe(true);
    });
});

describe('group properties', () => {
  const g = latticePointGroup(L('fcc_skewed_basis'));
  const key = (r: IntMat3) => r.flat().join(',');
  it('contains the identity and is closed under multiplication', () => {
    const set = new Set(g.map(key));
    expect(set.has('1,0,0,0,1,0,0,0,1')).toBe(true);
    for (const a of g.slice(0, 12))
      for (const b of g.slice(0, 12)) {
        const p = [0, 1, 2].map((i) =>
          [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!),
        );
        expect(set.has(p.flat().join(','))).toBe(true);
      }
  });
  it('every element has an integer matrix with determinant +1 or -1', () => {
    for (const r of g) {
      const d =
        r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) -
        r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) +
        r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
      expect(Math.abs(d)).toBe(1);
    }
  });
});

describe('Delaunay reduction', () => {
  it('returns a unimodular matrix whose superbase has non-positive dot products', () => {
    const A = L('fcc_skewed_basis');
    const P = delaunayReduction(A);
    const rows = P.map((c) =>
      [0, 1, 2].map((k) => c[0]! * A[0]![k]! + c[1]! * A[1]![k]! + c[2]! * A[2]![k]!),
    ) as unknown as Mat3;
    const four = [
      rows[0],
      rows[1],
      rows[2],
      [
        -(rows[0][0] + rows[1][0] + rows[2][0]),
        -(rows[0][1] + rows[1][1] + rows[2][1]),
        -(rows[0][2] + rows[1][2] + rows[2][2]),
      ] as const,
    ];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) expect(dot(four[i]! as never, four[j]! as never)).toBeLessThan(1e-6);
  });
});
