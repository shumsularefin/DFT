import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../../tests/reference/kpaths.json';
import { symbolOf } from '../elements';
import { dot } from '../linalg';
import { loadMoyoNode } from '../moyo-node';
import { analyzeWith, type MoyoApi } from '../symmetry';
import type { Mat3, Structure } from '../types';
import { lllReduce, scLabelDisplay, setyawanPath } from './setyawan';

interface Golden {
  input: { lattice_rows: Mat3; frac_coords: [number, number, number][]; atomic_numbers: number[] };
  setyawan_curtarolo: {
    sc_variant: string;
    spacegroup_number: number;
    path: string[][];
    point_coords: Record<string, number[]>;
    primitive_lattice_rows: Mat3;
    reciprocal_primitive_lattice_rows_with_2pi: Mat3;
  };
}
const S = kp.structures as unknown as Record<string, Golden>;
const gram = (m: Mat3) => m.map((a) => m.map((b) => dot(a, b)));
let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});
const toStructure = (g: Golden): Structure => ({
  lattice: g.input.lattice_rows,
  species: g.input.atomic_numbers.map((z) => symbolOf(z)!),
  frac: g.input.frac_coords,
});

// @source S-034 (pymatgen 2026.10 reference values via tests/reference/kpaths.json)
describe('Setyawan-Curtarolo against the pymatgen golden file (39 structures)', () => {
  for (const name of Object.keys(S)) {
    it(name, () => {
      const g = S[name]!.setyawan_curtarolo;
      const r = setyawanPath(analyzeWith(api, toStructure(S[name]!), { symprec: 1e-3, setting: 'Spglib' }));
      expect(r.spacegroupNumber).toBe(g.spacegroup_number);
      expect(r.variantId).toBe(g.sc_variant);
      expect(r.pathSegments).toEqual(g.path);
      expect(Object.keys(r.pointCoords).sort()).toEqual(Object.keys(g.point_coords).sort());
      const gp = gram(r.primitiveLattice);
      const gg = gram(g.primitive_lattice_rows);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(gp[i]![j]!).toBeCloseTo(gg[i]![j]!, 5);
      const gr = gram(r.reciprocalPrimitive);
      const gb = gram(g.reciprocal_primitive_lattice_rows_with_2pi);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(gr[i]![j]!).toBeCloseTo(gb[i]![j]!, 5);
      for (const [label, c] of Object.entries(g.point_coords)) {
        const t = r.pointCoords[label]!;
        for (let i = 0; i < 3; i++) expect(t[i]!, `${label}[${i}]`).toBeCloseTo(c[i]!, 6);
      }
    });
  }
  it('exercises every variant the golden file lists', () => {
    const seen = new Set(Object.values(S).map((g) => g.setyawan_curtarolo.sc_variant));
    expect([...seen].sort()).toEqual([...kp._meta.coverage.setyawan_curtarolo_variants].sort());
  });
});

describe('details', () => {
  it('requires the Spglib setting', () => {
    const s = analyzeWith(api, toStructure(S['fcc_Cu']!), { symprec: 1e-3 });
    expect(() => setyawanPath(s)).toThrow(RangeError);
  });
  it('label display', () => {
    expect(scLabelDisplay('\\Gamma')).toBe('Γ');
    expect(scLabelDisplay('A_1')).toBe('A₁');
    expect(scLabelDisplay('\\Sigma_1')).toBe('Σ₁');
  });
  it('LLL leaves a reduced cell alone and reduces a skewed one', () => {
    const id: Mat3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(lllReduce(id)).toEqual(id);
    const skew: Mat3 = [
      [1, 0, 0],
      [5, 1, 0],
      [7, 3, 1],
    ];
    const r = lllReduce(skew);
    const det = (m: Mat3) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    expect(Math.abs(det(r))).toBeCloseTo(1, 10);
    for (const row of r) expect(Math.hypot(...row)).toBeLessThan(2);
  });
});

// Boundary variants absent from the golden file (orcf3, mclc2, mclc4): synthetic cells built to sit exactly on the
// pymatgen branch conditions, checked against the paths and points written in pymatgen kpath.py (S-034, S-005).
describe('boundary variants', () => {
  const one = (lattice: Mat3, frac: [number, number, number][]): Structure => ({
    lattice,
    species: frac.map(() => 'Na'),
    frac,
  });
  const run = (s: Structure) => setyawanPath(analyzeWith(api, s, { symprec: 1e-4, setting: 'Spglib' }));
  const cRows = (a: number, b: number, c: number, al: number): Mat3 => {
    const r = (al * Math.PI) / 180;
    return [
      [a, 0, 0],
      [0, b, 0],
      [0, c * Math.cos(r), c * Math.sin(r)],
    ];
  };
  const cCentred = (a: number, b: number, c: number, al: number) =>
    one(cRows(a, b, c, al), [
      [0, 0, 0],
      [0.5, 0.5, 0],
    ]);
  const recGamma = (a: number, b: number, c: number, al: number) => {
    const r = (al * Math.PI) / 180;
    const p = [
      [a / 2, -b / 2, 0],
      [a / 2, b / 2, 0],
      [0, c * Math.cos(r), c * Math.sin(r)],
    ];
    // reciprocal rows b1,b2 are cross products: b1 ~ a2 x a3, b2 ~ a3 x a1
    const cr = (u: number[], v: number[]) => [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const b1 = cr(p[1]!, p[2]!);
    const b2 = cr(p[2]!, p[0]!);
    return (
      (Math.acos(
        dot(b1 as never, b2 as never) /
          (Math.hypot(...(b1 as [number, number, number])) * Math.hypot(...(b2 as [number, number, number]))),
      ) *
        180) /
      Math.PI
    );
  };

  it('orcf3: 1/a^2 = 1/b^2 + 1/c^2 drops the T-X_1 segment', () => {
    const [b, c] = [3, 4];
    const a = 1 / Math.sqrt(1 / (b * b) + 1 / (c * c));
    const r = run(
      one(
        [
          [a, 0, 0],
          [0, b, 0],
          [0, 0, c],
        ],
        [
          [0, 0, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
          [0.5, 0.5, 0],
        ],
      ),
    );
    expect(r.variantId).toBe('orcf3');
    expect(r.pathSegments).toEqual([
      ['\\Gamma', 'Y', 'T', 'Z', '\\Gamma', 'X', 'A_1', 'Y'],
      ['X', 'A', 'Z'],
      ['L', '\\Gamma'],
    ]);
    expect(r.pointCoords['T']).toEqual([1, 0.5, 0.5]);
  });

  it('mclc4 is not reachable by a real cell: at b cos(a)/c + b^2 sin^2(a)/a^2 = 1 the reciprocal gamma is never below 90', () => {
    // scan of the C-centred monoclinic family (alpha < 90, c > 0 solved from the equality): see Q-038
    let min = Infinity;
    for (let a = 1; a < 10; a += 0.37)
      for (let al = 10; al < 90; al += 7) {
        const r0 = (al * Math.PI) / 180;
        const d = 1 - (25 * Math.sin(r0) ** 2) / (a * a);
        if (d <= 1e-6) continue;
        const c = (5 * Math.cos(r0)) / d;
        min = Math.min(min, recGamma(a, 5, c, al));
      }
    expect(min).toBeGreaterThanOrEqual(90 - 1e-9);
  });
  it.todo(
    'Q-038: mclc4 point table is checked only against the pymatgen source, no golden structure or real cell reaches it',
  );

  it('mclc2: reciprocal gamma = 90 degrees, adds F_3', () => {
    const [a, b, c] = [4.8, 5, 6];
    let lo = 60;
    let hi = 100;
    // recGamma falls through 90 somewhere in (lo, hi) for these lengths; bisect for it
    const f = (al: number) => recGamma(a, b, c, al) - 90;
    expect(f(lo) * f(hi)).toBeLessThan(0);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    const r = run(cCentred(a, b, c, (lo + hi) / 2));
    expect(r.variantId).toBe('mclc2');
    expect(r.pathSegments).toEqual([
      ['\\Gamma', 'Y', 'F', 'L', 'I'],
      ['I_1', 'Z', 'F_1'],
      ['N', '\\Gamma', 'M'],
    ]);
    expect(Object.keys(r.pointCoords)).toContain('F_3');
  });
});
