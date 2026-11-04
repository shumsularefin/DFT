import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import { loadMoyoNode } from './moyo-node';
import { analyzeWith, fromColumnMajor, latticeFromBasis, toMoyoCell, type MoyoApi } from './symmetry';
import { symbolOf } from './elements';
import type { Mat3, Structure, Vec3 } from './types';

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

describe('column-major conversion', () => {
  it('element (i, j) is at index i + 3 j', () => {
    expect(fromColumnMajor([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9],
    ]);
  });
  it('lattice basis is row-major', () => {
    expect(latticeFromBasis([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });
  it('rejects unknown elements', () => {
    const s: Structure = {
      lattice: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      species: ['Xx'],
      frac: [[0, 0, 0]],
    };
    expect(() => toMoyoCell(s)).toThrow(RangeError);
  });
});

const fccCu = (): Structure => ({
  lattice: [
    [3.61, 0, 0],
    [0, 3.61, 0],
    [0, 0, 3.61],
  ],
  species: ['Cu', 'Cu', 'Cu', 'Cu'],
  frac: [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ],
});

describe('fcc Cu conventional (checked in planning)', () => {
  it('Fm-3m with 192 operations, Wyckoff a x 4, one atom in the primitive cell', () => {
    const r = analyzeWith(api, fccCu());
    expect(r.number).toBe(225);
    expect(r.operations).toHaveLength(192);
    expect(r.wyckoffs.join('')).toBe('aaaa');
    expect(r.primStdCell.species).toEqual(['Cu']);
    expect(r.stdCell.species).toHaveLength(4);
  });
  it('contains the identity and a centring translation, and every translation is a lattice-compatible fraction', () => {
    const r = analyzeWith(api, fccCu());
    expect(
      r.operations.some(
        (o) => o.rotation.flat().join() === '1,0,0,0,1,0,0,0,1' && o.translation.every((t) => t === 0),
      ),
    ).toBe(true);
    expect(
      r.operations.some(
        (o) => o.rotation.flat().join() === '1,0,0,0,1,0,0,0,1' && o.translation.join() === '0,0.5,0.5',
      ),
    ).toBe(true);
  });
});

describe('hcp Mg in a strange setting', () => {
  const mg: Structure = {
    lattice: [
      [3.21, 0, 0],
      [-1.605, 2.78, 0],
      [0, 0, 5.21],
    ],
    species: ['Mg', 'Mg'],
    frac: [
      [1 / 3, 2 / 3, 0.25],
      [2 / 3, 1 / 3, 0.75],
    ],
  };
  it('is P6_3/mmc with Wyckoff c, c', () => {
    const r = analyzeWith(api, mg, { symprec: 1e-3 });
    expect(r.number).toBe(194);
    expect(r.wyckoffs.join('')).toBe('cc');
    expect(r.operations).toHaveLength(24);
  });
  it('a hand-checked rotation: the six-fold axis maps (x, y, z) to (x - y, x, z) in the hexagonal basis', () => {
    const r = analyzeWith(api, mg, { symprec: 1e-3 });
    // Our basis has gamma = 120 degrees, so a 60 degree rotation about c is x' = x - y, y' = x (column action).
    const sixfold = r.operations.find(
      (o) =>
        o.rotation.flat().join() === '1,-1,0,1,0,0,0,0,1' &&
        o.translation.map((t) => ((t % 1) + 1) % 1).join() === '0,0,0.5',
    );
    expect(sixfold).toBeDefined();
  });
});

describe('golden: every structure in kpaths.json (symprec 1e-3 as in the generator)', () => {
  type Entry = {
    input: { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
    hpkot: { spacegroup_number: number; primitive_types: number[]; primitive_lattice_rows: number[][] };
  };
  const entries = Object.entries(kp.structures as unknown as Record<string, Entry>);
  it('has 39 structures', () => expect(entries).toHaveLength(39));
  for (const [name, e] of entries)
    it(`${name}: space group number and primitive atom count`, () => {
      const s: Structure = {
        lattice: e.input.lattice_rows as unknown as Mat3,
        species: e.input.atomic_numbers.map((z) => symbolOf(z)!),
        frac: e.input.frac_coords as unknown as Vec3[],
      };
      const r = analyzeWith(api, s, { symprec: 1e-3 });
      expect(r.number).toBe(e.hpkot.spacegroup_number);
      expect(r.primStdCell.species).toHaveLength(e.hpkot.primitive_types.length);
    });
});

describe('golden: moyo standard primitive cell against seekpath (HPKOT) primitive cell', () => {
  // The metric tensor A A^T is compared after no axis change. 29 of 39 agree to 1e-6. These 10 differ because moyo and
  // seekpath choose a different (but equivalent) primitive basis for them: base-centred orthorhombic A, monoclinic C,
  // and triclinic cells (different reduction). The volume still agrees. M5.3 applies seekpath's own transformation for
  // k-paths, so these differences do not reach the user. See docs/reports/M5.1.md.
  const DIFFERENT = [
    'monoclinic_C2m',
    'triclinic_P1bar',
    'v_oA1_Amm2',
    'v_oA2_Amm2',
    'v_mC1_mclc1',
    'v_mC2_mclc3',
    'v_mC3_mclc5',
    'v_aP2_tria',
    'v_aP2_trib',
    'v_aP3_trib',
  ];
  type Entry = {
    input: { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
    hpkot: { primitive_lattice_rows: number[][] };
  };
  const gram = (m: readonly (readonly number[])[]) =>
    m.map((a) => m.map((b) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
  const vol = (m: readonly (readonly number[])[]) =>
    Math.abs(
      m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
        m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
        m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!),
    );
  const differing: string[] = [];
  for (const [name, e] of Object.entries(kp.structures as unknown as Record<string, Entry>))
    it(`${name}: same volume; metric ${DIFFERENT.includes(name) ? 'differs (documented)' : 'agrees'}`, () => {
      const s: Structure = {
        lattice: e.input.lattice_rows as unknown as Mat3,
        species: e.input.atomic_numbers.map((z) => symbolOf(z)!),
        frac: e.input.frac_coords as unknown as Vec3[],
      };
      const r = analyzeWith(api, s, { symprec: 1e-3 });
      expect(vol(r.primStdCell.lattice)).toBeCloseTo(vol(e.hpkot.primitive_lattice_rows), 6);
      const g1 = gram(r.primStdCell.lattice);
      const g2 = gram(e.hpkot.primitive_lattice_rows);
      let d = 0;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) d = Math.max(d, Math.abs(g1[i]![j]! - g2[i]![j]!));
      if (d > 1e-6) differing.push(name);
      expect(d > 1e-6).toBe(DIFFERENT.includes(name));
    });
});
