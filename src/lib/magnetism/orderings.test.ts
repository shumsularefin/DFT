import { beforeAll, describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/magnetic_reference.json';
import kpaths from '../../../tests/reference/kpaths.json';
import { symbolOf } from '../crystal/elements';
import { loadMoyoNode } from '../crystal/moyo-node';
import { determinant, diagonalSupercell } from '../crystal/supercell';
import { analyzeWith, type MoyoApi } from '../crystal/symmetry';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import {
  bondStatistics,
  commonSupercell,
  customOrdering,
  enumerateCollinear,
  fitCheck,
  isTrulyAntiferro,
  namedOrdering,
  netMoment,
  orderingFromK,
  type MagneticConfiguration,
  type NamedKind,
} from './orderings';
import { MagneticError, fccGrid, pseudocubicGrid, selectMagneticSites } from './sublattice';

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
const pnma = fixture('pnma_perovskite_like');
const nacl = fixture('rocksalt_NaCl');

interface CellCounts {
  n_atoms: number;
  n_magnetic: number;
  n_up: number;
  n_down: number;
  net_moment_unit: number;
  nn_distance: number;
  nn_parallel_antiparallel_per_site: number[][];
}
interface Case {
  k_parent: number[];
  minimal_det: number;
  diagonal_dims: number[];
  minimal_cell: CellCounts;
  diagonal_cell: CellCounts;
}
const cases = (name: string) =>
  (golden.orderings as unknown as Record<string, { cases: Record<string, Case> }>)[name]!.cases;

/** Compare a built configuration with the golden counts for that cell. */
function expectCounts(c: MagneticConfiguration, g: CellCounts) {
  expect(c.structure.frac.length).toBe(g.n_atoms);
  expect(c.magneticSites.length).toBe(g.n_magnetic);
  expect(c.signs.filter((x) => x === 1).length).toBe(g.n_up);
  expect(c.signs.filter((x) => x === -1).length).toBe(g.n_down);
  expect(netMoment(c)).toBe(g.net_moment_unit);
  const b = bondStatistics(c);
  expect(b.shells[0]).toBeCloseTo(g.nn_distance, 6);
  const got = b.sites.map((s) => [s.shells[0]!.parallel, s.shells[0]!.antiparallel]).sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);
  expect(got).toEqual(g.nn_parallel_antiparallel_per_site);
}

describe('magnetic site selection and grids', () => {
  it('defaults to d- and f-block sites; an explicit element wins', () => {
    expect(selectMagneticSites(sto)).toEqual([1]);
    expect(selectMagneticSites(pnma, ['Cu'])).toEqual([4, 5, 6, 7]);
    expect(() => selectMagneticSites(nacl)).toThrow(MagneticError);
  });
  it('cubic perovskite: three perpendicular axes of length a; default axis c', () => {
    const g = pseudocubicGrid(sto, [1]);
    expect(g.axes.map((e) => Math.hypot(...e))).toEqual([3.905, 3.905, 3.905].map((x) => expect.closeTo(x, 9)));
    expect(g.defaultAxis).toBe(2);
    expect(Math.abs(g.axes[2]![2])).toBeCloseTo(3.905, 9);
  });
  it('Pnma cell: default stacking axis is along the long lattice vector b', () => {
    const g = pseudocubicGrid(pnma, selectMagneticSites(pnma, ['Cu']));
    expect(g.defaultAxisReason).toMatch(/longest lattice vector \(b\)/);
    const e = g.axes[g.defaultAxis]!;
    expect(Math.abs(e[1])).toBeCloseTo(7.66 / 2, 9);
  });
  it('refuses a non-pseudocubic sublattice (the fcc Na sublattice has 12 nearest neighbours)', () => {
    expect(() => pseudocubicGrid(nacl, [0, 1, 2, 3])).toThrow(/12 nearest/);
    expect(() => fccGrid(sto, [1])).toThrow(MagneticError);
  });
});

describe('named orderings: cubic perovskite (golden)', () => {
  const g = cases('cubic_perovskite_SrTiO3');
  for (const kind of ['FM', 'A', 'C', 'G'] as NamedKind[]) {
    it(`${kind}: k, minimal cell and neighbour counts`, () => {
      const c = namedOrdering(sto, { kind }, { elements: ['Ti'] });
      expect(c.k).toEqual(g[kind]!.k_parent);
      expect(determinant(c.matrix)).toBe(g[kind]!.minimal_det);
      expectCounts(c, g[kind]!.minimal_cell);
    });
    it(`${kind}: diagonal option`, () => {
      const c = namedOrdering(sto, { kind }, { elements: ['Ti'], cell: 'diagonal' });
      expect([c.matrix[0][0], c.matrix[1][1], c.matrix[2][2]]).toEqual(g[kind]!.diagonal_dims);
      expectCounts(c, g[kind]!.diagonal_cell);
    });
  }

  it('invariants from the definitions (S-058): A 4/2, C 2/4, G 0/6, FM 6/0 per site', () => {
    const want: Record<string, number[]> = { FM: [6, 0], A: [4, 2], C: [2, 4], G: [0, 6] };
    for (const [kind, pa] of Object.entries(want)) {
      const b = bondStatistics(namedOrdering(sto, { kind: kind as NamedKind }, { elements: ['Ti'] }));
      for (const s of b.sites) expect([s.shells[0]!.parallel, s.shells[0]!.antiparallel]).toEqual(pa);
    }
  });

  it('A-type stacking axis can be chosen and is reported', () => {
    const c = namedOrdering(sto, { kind: 'A', axis: 0 }, { elements: ['Ti'] });
    expect(c.k).toEqual([0.5, 0, 0]);
    expect(c.axis?.index).toBe(0);
    expect(c.axis?.reason).toBe('chosen by the user');
    expect(namedOrdering(sto, { kind: 'A' }, { elements: ['Ti'] }).axis?.reason).toMatch(/^default/);
  });

  it('common supercell for FM, A, C, G has the golden determinant; every ordering lives in the same cell', () => {
    const r = commonSupercell(sto, [{ kind: 'FM' }, { kind: 'A' }, { kind: 'C' }, { kind: 'G' }], { elements: ['Ti'] });
    expect(determinant(r.matrix)).toBe(golden.common_supercell.cubic_perovskite_SrTiO3.det);
    const ref = r.configurations[0]!.structure;
    for (const c of r.configurations) {
      expect(c.structure.lattice).toEqual(ref.lattice);
      expect(c.structure.species).toEqual(ref.species);
      expect(c.structure.frac).toEqual(ref.frac);
    }
    const counts = r.configurations.map((c) => bondStatistics(c).sites[0]!.shells[0]);
    expect(counts.map((x) => [x!.parallel, x!.antiparallel])).toEqual([
      [6, 0],
      [4, 2],
      [2, 4],
      [0, 6],
    ]);
    // every antiferromagnet has zero net moment, the ferromagnet the sum of magnitudes
    expect(netMoment(r.configurations[0]!, { Ti: 3 })).toBe(3 * 4);
    for (const c of r.configurations.slice(1)) {
      expect(netMoment(c, { Ti: 3 })).toBe(0);
      expect(isTrulyAntiferro(c)).toBe(true);
    }
    expect(isTrulyAntiferro(r.configurations[0]!)).toBe(false);
  });

  it('fitCheck warns when the ordering does not fit and proposes the minimal cell', () => {
    const f = fitCheck(sto, { kind: 'G' }, { elements: ['Ti'] });
    expect(f.fits).toBe(false);
    expect(determinant(f.proposal!)).toBe(g.G!.minimal_det);
    expect(f.message).toMatch(/does not fit/);
    expect(() => namedOrdering(sto, { kind: 'G' }, { elements: ['Ti'], cell: 'as-given' })).toThrow(/does not fit/);
    expect(fitCheck(sto, { kind: 'FM' }, { elements: ['Ti'] }).fits).toBe(true);
  });
});

describe('named orderings: Pnma perovskite-like (golden)', () => {
  const g = cases('pnma_perovskite_like');
  for (const kind of ['FM', 'A', 'C', 'G'] as NamedKind[]) {
    it(`${kind} fits without enlargement and matches the golden counts`, () => {
      const c = namedOrdering(pnma, { kind }, { elements: ['Cu'] });
      expect(c.k).toEqual(g[kind]!.k_parent);
      expect(determinant(c.matrix)).toBe(g[kind]!.minimal_det);
      expectCounts(c, g[kind]!.minimal_cell);
    });
  }
  it('common supercell is the cell itself', () => {
    const r = commonSupercell(pnma, [{ kind: 'FM' }, { kind: 'A' }, { kind: 'C' }, { kind: 'G' }], { elements: ['Cu'] });
    expect(determinant(r.matrix)).toBe(golden.common_supercell.pnma_perovskite_like.det);
  });
});

describe('rock-salt type II (golden)', () => {
  const g = cases('rocksalt_NaCl');
  it('FM and type II match the golden counts; type II has 6 parallel and 6 antiparallel neighbours', () => {
    const fm = namedOrdering(nacl, { kind: 'FM' }, { elements: ['Na'] });
    expectCounts(fm, g.FM!.minimal_cell);
    const c = namedOrdering(nacl, { kind: 'RS2' }, { elements: ['Na'] });
    expect(c.k).toEqual(g.RS2!.k_parent);
    expect(determinant(c.matrix)).toBe(g.RS2!.minimal_det);
    expectCounts(c, g.RS2!.minimal_cell);
    for (const s of bondStatistics(c).sites) expect([s.shells[0]!.parallel, s.shells[0]!.antiparallel]).toEqual([6, 6]);
    const d = namedOrdering(nacl, { kind: 'RS2' }, { elements: ['Na'], cell: 'diagonal' });
    expectCounts(d, g.RS2!.diagonal_cell);
  });
});

describe('propagation vector and custom orderings', () => {
  it('k components outside {0, 1/2} are refused with a typed error', () => {
    try {
      orderingFromK(sto, [1 / 3, 0, 0], { elements: ['Ti'] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MagneticError);
      expect((e as MagneticError).code).toBe('k-not-collinear');
    }
  });
  it('on a one-site sublattice k = (1/2, 1/2, 1/2) is the G-type pattern', () => {
    const k = orderingFromK(sto, [0.5, 0.5, 0.5], { elements: ['Ti'] });
    const gt = namedOrdering(sto, { kind: 'G' }, { elements: ['Ti'] });
    expect(k.matrix).toEqual(gt.matrix);
    expect(k.signs).toEqual(gt.signs);
  });
  it('custom signs and magnitudes give the net moment; validation of lengths', () => {
    const c = customOrdering(pnma, pnma.species.map((x, i) => (x === 'Cu' ? (i % 2 ? 1 : -1) : 0)), pnma.species.map((x) => (x === 'Cu' ? 2 : 0)));
    expect(netMoment(c)).toBe(0);
    expect(() => customOrdering(pnma, [1, -1])).toThrow(MagneticError);
  });
  it('a ferromagnet that only looks antiferro: zero moments are not antiferromagnetic', () => {
    const c = customOrdering(sto, [0, 0, 0, 0, 0]);
    expect(isTrulyAntiferro(c)).toBe(false);
  });
});

describe('enumerateCollinear (golden brute force with spglib operations)', () => {
  let api: MoyoApi;
  beforeAll(async () => {
    api = await loadMoyoNode();
  });
  const runs: [string, () => Structure, string][] = [
    ['pnma_perovskite_like', () => pnma, 'Cu'],
    ['rocksalt_NaCl', () => nacl, 'Na'],
    ['cubic_perovskite_SrTiO3_112', () => diagonalSupercell(sto, 1, 1, 2), 'Ti'],
    ['cubic_perovskite_SrTiO3_222', () => diagonalSupercell(sto, 2, 2, 2), 'Ti'],
  ];
  for (const [name, make, el] of runs) {
    it(`${name}: number of classes and multiplicities`, () => {
      const g = (golden.enumeration as unknown as Record<string, { n_classes: number; multiplicities_sorted: number[]; n_spglib_operations: number }>)[name]!;
      const s = make();
      const sym = analyzeWith(api, s, { symprec: golden._meta.symprec });
      expect(sym.operations.length).toBe(g.n_spglib_operations);
      const sites = selectMagneticSites(s, [el]);
      const cls = enumerateCollinear(s, sites, sym.operations);
      expect(cls.length).toBe(g.n_classes);
      expect(cls.map((c) => c.multiplicity).sort((a, b) => a - b)).toEqual(g.multiplicities_sorted);
      expect(cls[0]!.signs.every((x) => x === 1)).toBe(true); // FM first
    });
  }
  it('refuses more than maxSites magnetic sites', () => {
    const s = diagonalSupercell(sto, 2, 2, 2);
    expect(() => enumerateCollinear(s, selectMagneticSites(s, ['Ti']), [], { maxSites: 6 })).toThrow(/limit is 6/);
  });
  it.todo('Q-041: moyo-wasm 0.21.0 has no magnetic-cell analysis, so no magnetic space group is reported');
});
