import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import ref from '../../../tests/reference/structure_tools_reference.json';
import {
  defectPairs,
  distinctSites,
  exchangedAtoms,
  neutralFormationEnergy,
  shortestLatticeVector,
  substitute,
  suggestSupercell,
  vacancy,
} from './defects';
import { symbolOf } from './elements';
import { vecMat } from './linalg';
import { loadMoyoNode } from './moyo-node';
import type { IntMat3 } from './reduction';
import { buildSupercell } from './supercell';
import type { MoyoApi } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

type KIn = { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
const K = kp.structures as unknown as Record<string, { input: KIn }>;
const fromK = (n: string): Structure => {
  const i = K[n]!.input;
  return { lattice: i.lattice_rows, species: i.atomic_numbers.map((z) => symbolOf(z)!), frac: i.frac_coords };
};
const diag = (d: number[]): IntMat3 => [
  [d[0]!, 0, 0],
  [0, d[1]!, 0],
  [0, 0, d[2]!],
];

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

/** Partition of the atoms as a sorted list of sorted groups, so two labellings can be compared. */
const partition = (labels: readonly number[]): number[][] => {
  const m = new Map<number, number[]>();
  labels.forEach((l, i) => m.set(l, [...(m.get(l) ?? []), i]));
  return [...m.values()].sort((a, b) => a[0]! - b[0]!);
};

describe('symmetry-distinct sites against spglib equivalent_atoms (golden)', () => {
  for (const [name, o] of Object.entries(ref.orbits)) {
    it(name, () => {
      const sites = distinctSites(api, fromK(name));
      expect(sites.length).toBe(o.n_orbits);
      const labels = new Array<number>(o.equivalent_atoms.length);
      sites.forEach((st) => st.members.forEach((m) => (labels[m] = st.orbit)));
      expect(partition(labels)).toEqual(partition(o.equivalent_atoms));
    });
  }
});

describe('defect pairs against brute force (golden)', () => {
  for (const c of ref.pairs) {
    it(`${c.structure} x ${c.supercell_diagonal.join('')} up to ${c.r_max} angstrom`, () => {
      const s = buildSupercell(fromK(c.structure), diag(c.supercell_diagonal)).structure;
      expect(s.species.length).toBe(c.n_atoms);
      const got = defectPairs(api, s, c.r_max);
      expect(got.length).toBe(c.n_classes);
      expect(got.reduce((a, g) => a + g.multiplicity, 0)).toBe(c.n_pairs);
      const key = (x: { distance: number; species: string[]; multiplicity: number }) =>
        `${x.distance.toFixed(5)}/${x.species.join('-')}/${x.multiplicity}`;
      expect(got.map(key).sort()).toEqual(c.classes.map(key).sort());
    });
  }
});

describe('vacancies and substitutions', () => {
  const NaCl = fromK('rocksalt_NaCl');
  it('a vacancy removes one atom of the chosen orbit and says it is neutral only', () => {
    const [na] = distinctSites(api, NaCl);
    const r = vacancy(NaCl, na!);
    expect(r.structure.species.length).toBe(7);
    expect(r.structure.species.filter((x) => x === 'Na').length).toBe(3);
    expect(r.notes.join(' ')).toMatch(/Neutral defect only/);
    expect(exchangedAtoms(NaCl, r.structure)).toEqual([{ element: 'Na', n: -1 }]);
  });
  it('a substitution swaps one species, keeps positions, and rejects unknown or identical elements', () => {
    const cl = distinctSites(api, NaCl).find((x) => x.species === 'Cl')!;
    const r = substitute(NaCl, cl, 'Br');
    expect(r.structure.frac).toEqual(NaCl.frac);
    expect(r.structure.species.filter((x) => x === 'Br').length).toBe(1);
    expect(exchangedAtoms(NaCl, r.structure)).toEqual([
      { element: 'Br', n: 1 },
      { element: 'Cl', n: -1 },
    ]);
    expect(() => substitute(NaCl, cl, 'Xx')).toThrow(RangeError);
    expect(() => substitute(NaCl, cl, 'Cl')).toThrow(RangeError);
    expect(() => vacancy(NaCl, 99)).toThrow(RangeError);
  });
});

describe('supercell suggestion from a minimum defect-image distance', () => {
  it('fcc Cu conventional cell, 10 angstrom: 16 cells (64 atoms), image distance 2 sqrt(2) a', () => {
    // Hand check: the conventional cell is simple cubic (a = 3.61), so a supercell is an integer sublattice of
    // Z^3 scaled by a. 10 / a = 2.77 needs every vector with squared integer norm >= 8. The sublattice spanned by
    // (2,2,0), (2,0,2), (0,2,2) has minimum squared norm 8 and index 16, and Hermite's bound in three
    // dimensions (min^2 <= 2^(1/3) index^(2/3)) forbids index < 16 for minimum 8.
    const r = suggestSupercell(fromK('fcc_Cu'), 10);
    expect(r.determinant).toBe(16);
    expect(r.atoms).toBe(64);
    expect(r.imageDistance).toBeCloseTo(2 * Math.SQRT2 * 3.61, 9);
    expect(r.notes[0]).toMatch(/convention/);
  });
  it('the reported image distance is the shortest supercell vector (brute force over small combinations)', () => {
    for (const name of ['rutile_TiO2_tetragonal_P', 'hcp_Mg', 'triclinic_P1bar']) {
      const s = fromK(name);
      const r = suggestSupercell(s, 8);
      const L = r.matrix.map((row) => vecMat(row as unknown as Vec3, s.lattice)) as unknown as Mat3;
      let best = Infinity;
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++)
          for (let k = -3; k <= 3; k++)
            if (i || j || k) best = Math.min(best, Math.hypot(...vecMat([i, j, k], L)));
      expect(r.imageDistance).toBeCloseTo(best, 9);
      expect(shortestLatticeVector(L)).toBeCloseTo(best, 9);
      expect(r.imageDistance).toBeGreaterThanOrEqual(8);
    }
  });
  it('falls back to a diagonal supercell when the search limit is too small', () => {
    const r = suggestSupercell(fromK('fcc_Cu'), 10, { maxDeterminant: 4 });
    expect(r.matrix).toEqual(diag([3, 3, 3]));
    expect(r.imageDistance).toBeGreaterThanOrEqual(10);
    expect(r.notes.join(' ')).toMatch(/fallback/);
  });
});

describe('neutral formation energy (S-067)', () => {
  it('hand-checked integer example: E_f = -98 - (-105) - (-1)(-4) = 3 eV', () => {
    const r = neutralFormationEnergy(-98, -105, [{ element: 'O', n: -1, mu: -4 }]);
    expect(r.value).toBe(3);
    expect(r.terms.exchange[0]!.nMu).toBe(4);
    expect(r.sources).toEqual(['S-067']);
    expect(r.notes[0]).toMatch(/charged defects/);
  });
  it('substitution: two reservoirs, E_f = -100 - (-102) - [(+1)(-3) + (-1)(-2)] = 3 eV', () => {
    const r = neutralFormationEnergy(-100, -102, [
      { element: 'Br', n: 1, mu: -3 },
      { element: 'Cl', n: -1, mu: -2 },
    ]);
    expect(r.value).toBe(3);
  });
  it('rejects non-finite input', () => {
    expect(() => neutralFormationEnergy(Number.NaN, 0, [])).toThrow(RangeError);
  });
});
