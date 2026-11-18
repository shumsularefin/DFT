import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import { check } from '../chem/validity';
import { symbolOf } from './elements';
import { cellVolume, latticeParameters } from './lattice';
import { inv3, mul, norm, sub, transpose, vecMat } from './linalg';
import { loadMoyoNode } from './moyo-node';
import {
  gentleRelax,
  mergeDuplicates,
  setLattice,
  snapToWyckoff,
  standardizeConventional,
  standardizePrimitive,
  supercell,
  supercellOp,
  symmetrize,
  wrap,
} from './ops';
import { analyzeWith, type MoyoApi } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

type KIn = { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
const K = kp.structures as unknown as Record<string, { input: KIn; hpkot: { primitive_lattice_rows: Mat3 } }>;
const fromK = (n: string): Structure => {
  const i = K[n]!.input;
  return { lattice: i.lattice_rows, species: i.atomic_numbers.map((z) => symbolOf(z)!), frac: i.frac_coords };
};
const NaCl = fromK('rocksalt_NaCl');
const metric = (L: Mat3) => mul(L, transpose(L));
const minImg = (d: Vec3): Vec3 => [d[0] - Math.round(d[0]), d[1] - Math.round(d[1]), d[2] - Math.round(d[2])];
const expectMat = (a: Mat3, b: Mat3, tol: number) =>
  a.forEach((r, i) => r.forEach((x, j) => expect(Math.abs(x - b[i]![j]!), `(${i},${j})`).toBeLessThan(tol)));

/** Seeded PRNG (mulberry32), so the perturbation is the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Move every atom by exactly `amp` Angstrom in a random direction. */
function perturb(s: Structure, amp: number, seed: number): Structure {
  const r = rng(seed);
  return {
    ...s,
    frac: s.frac.map((f) => {
      const z = 2 * r() - 1;
      const phi = 2 * Math.PI * r();
      const u: Vec3 = [Math.sqrt(1 - z * z) * Math.cos(phi), Math.sqrt(1 - z * z) * Math.sin(phi), z];
      const a = s.lattice[0][0]; // cubic cells only in these tests
      return [f[0] + (amp * u[0]) / a, f[1] + (amp * u[1]) / a, f[2] + (amp * u[2]) / a] as Vec3;
    }),
  };
}

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

describe('moyo mapping conventions (x_in = P x_std + p, G_std = P^T G_in P)', () => {
  it('an ideal NaCl cell that is rotated, sheared and shifted comes back unchanged', () => {
    const c = Math.cos(Math.PI / 6);
    const sn = Math.sin(Math.PI / 6);
    const rot = (v: Vec3): Vec3 => [c * v[0] - sn * v[1], sn * v[0] + c * v[1], v[2]];
    const a = 5.64;
    const L: Mat3 = [rot([a, 0, 0]), rot([a, a, 0]), rot([0, 0, a])];
    // same atoms: f_new = f_old T^-1 with rows L = T L_cubic, T = [[1,0,0],[1,1,0],[0,0,1]]
    const o: Vec3 = [0.1, 0.2, 0.3];
    const s: Structure = {
      lattice: L,
      species: NaCl.species,
      frac: NaCl.frac.map((f) => {
        const g: Vec3 = [f[0] + o[0], f[1] + o[1], f[2] + o[2]];
        return [g[0] - g[1], g[1], g[2]];
      }),
    };
    const r = symmetrize(api, s, 1e-4);
    expectMat(r.structure.lattice, L, 1e-10);
    r.structure.frac.forEach((f, i) => expect(norm(sub(f, s.frac[i]!)), `atom ${i}`).toBeLessThan(1e-10));
    expect(r.changed).toBe(false);
    expect(r.description).toMatch(/F m -3 m \(225\)/);
  });
});

describe('symmetrize and snapToWyckoff', () => {
  const noisy = perturb(NaCl, 0.01, 42);
  it('perturbed NaCl (0.01 Angstrom, seeded) returns space group 225 and the ideal positions to 1e-6', () => {
    expect(analyzeWith(api, noisy, { symprec: 1e-4 }).number).not.toBe(225);
    const r = symmetrize(api, noisy, 0.05);
    expect(analyzeWith(api, r.structure, { symprec: 1e-6 }).number).toBe(225);
    // ideal up to one common translation (any origin is as ideal as another)
    const d = r.structure.frac.map((f, i) => minImg(sub(f, NaCl.frac[i]!)));
    const t = d[0]!;
    for (const x of d) expect(norm(vecMat(sub(x, t), NaCl.lattice))).toBeLessThan(1e-6);
    expect(norm(vecMat(t, NaCl.lattice))).toBeLessThan(0.01);
    expectMat(r.structure.lattice, NaCl.lattice, 1e-9);
    expect(r.changed).toBe(true);
    expect(noisy.frac).toEqual(perturb(NaCl, 0.01, 42).frac); // input untouched
  });
  it('a strained cell is brought back to the cubic metric, keeping its orientation', () => {
    const L: Mat3 = [
      [5.64, 0.004, 0],
      [0.004, 5.645, 0],
      [0, 0, 5.636],
    ];
    const r = symmetrize(api, { ...NaCl, lattice: L }, 0.05);
    const p = latticeParameters(r.structure.lattice);
    for (const k of ['alpha', 'beta', 'gamma'] as const) expect(p[k]).toBeCloseTo(90, 9);
    expect(p.a).toBeCloseTo(p.b, 9);
    expect(p.b).toBeCloseTo(p.c, 9);
    // pure strain: L' = L E with E symmetric, so no rotation was added
    const E = mul(inv3(L), r.structure.lattice);
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const)
      expect(E[i][j]).toBeCloseTo(E[j][i], 12);
    expect(r.notes[0]).toMatch(/orientation/);
  });
  it('snapToWyckoff idealizes positions and keeps the cell', () => {
    const r = snapToWyckoff(api, noisy, 0.05);
    expect(r.structure.lattice).toBe(noisy.lattice);
    expect(analyzeWith(api, r.structure, { symprec: 1e-6 }).number).toBe(225);
    expect(r.notes[0]).toMatch(/Wyckoff letters/);
  });
});

describe('standardization', () => {
  it('conventional fcc Cu gives one atom and the metric of the golden fcc primitive cell', () => {
    const r = standardizePrimitive(api, fromK('fcc_Cu'));
    expect(r.structure.species).toEqual(['Cu']);
    expectMat(metric(r.structure.lattice), metric(K.fcc_Cu!.hpkot.primitive_lattice_rows), 1e-9);
    expect(r.changed).toBe(true);
    expect(r.description).toMatch(/primitive/);
  });
  it('and back to the conventional cell with 4 atoms', () => {
    const prim = standardizePrimitive(api, fromK('fcc_Cu')).structure;
    const r = standardizeConventional(api, prim);
    expect(r.structure.species).toHaveLength(4);
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(3.61 ** 3, 9);
  });
});

describe('simple operations', () => {
  it('wrap reports how many atoms it moved', () => {
    const s = { ...NaCl, frac: NaCl.frac.map((f, i) => (i < 2 ? ([f[0] + 1, f[1] - 1, f[2]] as Vec3) : f)) };
    const r = wrap(s);
    expect(r.description).toMatch(/Wrapped 2 atom/);
    expect(r.structure.frac.flat().every((x) => x >= 0 && x < 1)).toBe(true);
    expect(wrap(NaCl).changed).toBe(false);
  });
  it('mergeDuplicates uses the given tolerance', () => {
    const s = { ...NaCl, species: [...NaCl.species, 'Na'], frac: [...NaCl.frac, [0.01, 0, 0] as Vec3] };
    expect(mergeDuplicates(s, 0.01).changed).toBe(false); // 0.0564 Angstrom apart
    const r = mergeDuplicates(s, 0.1);
    expect(r.structure.species).toHaveLength(8);
    expect(r.description).toContain('Na9');
  });
  it('supercell is the M13.1 implementation, with a description', () => {
    const M = [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const;
    const r = supercellOp(NaCl, M);
    expect(r.structure).toEqual(supercell(NaCl, M));
    expect(r.description).toMatch(/2 copies, 8 atoms became 16/);
  });
  it('setLattice keeps fractional or Cartesian positions', () => {
    const L: Mat3 = [
      [6, 0, 0],
      [0, 6, 0],
      [0, 0, 6],
    ];
    expect(setLattice(NaCl, L, 'fractional').structure.frac).toEqual(NaCl.frac);
    const c = setLattice(NaCl, L, 'cartesian').structure;
    expect(c.frac[1]![0]).toBeCloseTo((0.5 * 5.64) / 6, 12);
    expect(() =>
      setLattice(NaCl, [
        [1, 0, 0],
        [2, 0, 0],
        [0, 0, 1],
      ]),
    ).toThrow(RangeError);
  });
});

describe('gentleRelax: geometric clean-up with safeguards', () => {
  const box: Mat3 = [
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 10],
  ];
  const s: Structure = {
    lattice: box,
    species: ['Na', 'Na', 'Cl'],
    frac: [
      [0.4, 0.5, 0.5],
      [0.55, 0.5, 0.5],
      [0.1, 0.1, 0.1],
    ],
  };
  it('pushes the contact apart, moves only those atoms, never touches the cell', () => {
    expect(check(s).some((i) => i.code === 'B001')).toBe(true);
    const r = gentleRelax(s);
    expect(r.structure.lattice).toBe(box);
    expect(r.structure.frac[2]).toBe(s.frac[2]);
    const after = check(r.structure);
    expect(after.filter((i) => i.code === 'B001' || i.code === 'B002')).toEqual([]);
    expect(r.notes[0]).toMatch(/not a physical relaxation/);
    expect(r.description).toMatch(/0 short contact\(s\) remain/);
  });
  it('limits each step to 0.05 Angstrom and the run to 200 steps', () => {
    const one = gentleRelax(s, { maxSteps: 1, maxStep: 1 });
    for (const i of [0, 1])
      expect(norm(vecMat(sub(one.structure.frac[i]!, s.frac[i]!), box))).toBeLessThanOrEqual(0.05 + 1e-12);
    const many = gentleRelax(s, { maxSteps: 10_000 });
    expect(many.description).toMatch(/in (\d+) step/);
    expect(Number(/in (\d+) step/.exec(many.description)![1])).toBeLessThanOrEqual(200);
  });
  it('respects frozen selective-dynamics directions', () => {
    const r = gentleRelax({
      ...s,
      selective: [
        [false, false, false],
        [true, true, true],
        [true, true, true],
      ],
    });
    expect(r.structure.frac[0]).toEqual(s.frac[0]);
    expect(r.structure.frac[1]![0]).toBeGreaterThan(0.55);
  });
  it('cannot separate coincident atoms and says so', () => {
    const r = gentleRelax({ ...s, frac: [s.frac[0]!, s.frac[0]!, s.frac[2]!] });
    expect(r.notes.join(' ')).toMatch(/on top of each other/);
  });
  it('does nothing without short contacts', () => {
    const r = gentleRelax(NaCl);
    expect(r.changed).toBe(false);
    expect(r.structure.frac).toEqual(NaCl.frac);
  });
});
