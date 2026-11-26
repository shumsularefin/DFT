import { describe, expect, it } from 'vitest';
import kpaths from '../../../tests/reference/kpaths.json';
import { symbolOf } from '../crystal/elements';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import {
  DEFAULT_CONVENTION,
  describeConvention,
  fitExchange,
  meanFieldCurie,
  MEAN_FIELD_OVER_MC_SC,
  shellCoefficients,
  type FitPoint,
  type HeisenbergConvention,
} from './heisenberg';
import { BOLTZMANN_EV_K } from '../physics/constants';
import { namedOrdering, type NamedKind } from './orderings';

type Input = { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
const d = (kpaths.structures as unknown as Record<string, { input: Input }>)['cubic_perovskite_SrTiO3']!
  .input;
const sto: Structure = {
  lattice: d.lattice_rows as unknown as Mat3,
  frac: d.frac_coords as unknown as Vec3[],
  species: d.atomic_numbers.map((z) => symbolOf(z)!),
};
const kinds: NamedKind[] = ['FM', 'A', 'C', 'G'];
const configs = kinds.map((kind) => namedOrdering(sto, { kind }, { elements: ['Ti'] }));

// A fixed pseudo-random sequence of +-1e-6 eV, so the test is reproducible.
const noise = [1e-6, -1e-6, 0.7e-6, -0.4e-6];

function energies(conv: HeisenbergConvention, j: number[], e0 = -9.5, withNoise = true): FitPoint[] {
  return configs.map((c, i) => {
    const coefficients = shellCoefficients(c, j.length, conv).perIon;
    const e = e0 + coefficients.reduce((a, x, n) => a + x * j[n]!, 0) + (withNoise ? noise[i]! : 0);
    return { label: c.kind, energyPerIon: e, coefficients };
  });
}

describe('shellCoefficients (bond counts from the M13.1 library)', () => {
  it('counts parallel minus antiparallel per ion: FM 6, A 2, C -2, G -6 in shell 1 (pairs counted twice)', () => {
    const twice: HeisenbergConvention = { sign: 'plus', pairs: 'twice', spin: { kind: 'unit' } };
    expect(configs.map((c) => shellCoefficients(c, 1, twice).perIon[0])).toEqual([6, 2, -2, -6]);
  });
  it('scales with S^2 and flips with the sign convention', () => {
    const c = configs[0]!;
    const s = shellCoefficients(c, 1, { sign: 'minus', pairs: 'once', spin: { kind: 'S', s: 2.5 } });
    expect(s.perIon[0]).toBeCloseTo(-0.5 * 6.25 * 6, 12);
  });
});

describe('fitExchange round trip (mathematical, J chosen in the test)', () => {
  it('recovers J1 and J2 within 1e-5 eV from FM, A, C, G with 1e-6 eV noise', () => {
    const j = [0.0042, -0.0013];
    const r = fitExchange(energies(DEFAULT_CONVENTION, j), DEFAULT_CONVENTION);
    expect(r.determination).toBe('over');
    expect(r.j![0]).toBeCloseTo(j[0]!, 5);
    expect(Math.abs(r.j![0]! - j[0]!)).toBeLessThan(1e-5);
    expect(Math.abs(r.j![1]! - j[1]!)).toBeLessThan(1e-5);
    expect(Math.abs(r.e0! + 9.5)).toBeLessThan(1e-5);
    expect(r.rms!).toBeLessThan(2e-6);
    expect(r.residuals).toHaveLength(4);
    expect(Number.isFinite(r.condition)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('is exact without noise, in every convention', () => {
    for (const conv of [
      DEFAULT_CONVENTION,
      { sign: 'minus', pairs: 'twice', spin: { kind: 'S', s: 1.5 } },
    ] as HeisenbergConvention[]) {
      const r = fitExchange(energies(conv, [0.003, 0.001], -1, false), conv);
      expect(r.j![0]).toBeCloseTo(0.003, 10);
      expect(r.j![1]).toBeCloseTo(0.001, 10);
    }
  });

  it('pairs counted once versus twice: J differs by exactly a factor 2 for the same energies', () => {
    const once: HeisenbergConvention = { ...DEFAULT_CONVENTION, pairs: 'once' };
    const twice: HeisenbergConvention = { ...DEFAULT_CONVENTION, pairs: 'twice' };
    const given = energies(once, [0.0042, -0.0013]);
    const same = given.map((p, i) => ({
      ...p,
      coefficients: shellCoefficients(configs[i]!, 2, twice).perIon,
    }));
    const a = fitExchange(given, once).j!;
    const b = fitExchange(same, twice).j!;
    a.forEach((x, n) => expect(x / b[n]!).toBeCloseTo(2, 10));
  });

  it('warns and reports no J when under-determined; warns when exactly determined', () => {
    const pts = energies(DEFAULT_CONVENTION, [0.004, 0.001]);
    const under = fitExchange(pts.slice(0, 2), DEFAULT_CONVENTION);
    expect(under.determination).toBe('under');
    expect(under.j).toBeUndefined();
    expect(under.warnings[0]).toMatch(/Under-determined/);
    const exact = fitExchange(pts.slice(0, 3), DEFAULT_CONVENTION);
    expect(exact.determination).toBe('exact');
    expect(exact.warnings[0]).toMatch(/Exactly determined/);
  });

  it('detects a rank-deficient set (two configurations with the same coefficients)', () => {
    const pts = energies(DEFAULT_CONVENTION, [0.004]);
    const r = fitExchange(
      [pts[0]!, pts[0]!, { ...pts[0]!, energyPerIon: pts[0]!.energyPerIon + 1e-6 }],
      DEFAULT_CONVENTION,
    );
    expect(r.j).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/Rank deficient/);
  });

  it('prints the convention with every result', () => {
    const r = fitExchange(energies(DEFAULT_CONVENTION, [0.004]), DEFAULT_CONVENTION);
    expect(r.conventionText).toBe(describeConvention(DEFAULT_CONVENTION));
    expect(r.conventionText).toMatch(/each bond|bonds i<j/);
    expect(r.conventionText).toMatch(/J > 0 is ferromagnetic/);
    expect(describeConvention({ ...DEFAULT_CONVENTION, sign: 'plus' })).toMatch(/J > 0 is antiferromagnetic/);
    expect(describeConvention({ sign: 'minus', pairs: 'twice', spin: { kind: 'S', s: 2.5 } })).toMatch(
      /S = 2\.5.*J > 0 is ferromagnetic/,
    );
  });

  it('Q-042 default: H = E0 - sum_(i<j) J S_i.S_j, unit spins, J > 0 ferromagnetic (S-042, S-059, S-070)', () => {
    expect(DEFAULT_CONVENTION).toEqual({ sign: 'minus', pairs: 'once', spin: { kind: 'unit' } });
    expect(describeConvention(DEFAULT_CONVENTION)).toMatch(/H = E0 - .*J > 0 is ferromagnetic/);
    // FM on the simple-cubic Ti sublattice: 6 parallel neighbours, each bond once, minus sign: c_1 = -3.
    expect(shellCoefficients(configs[0]!, 1, DEFAULT_CONVENTION).perIon[0]).toBe(-3);
  });
});

describe('meanFieldCurie (S-070, S-071)', () => {
  const fmC = (conv: HeisenbergConvention) => shellCoefficients(configs[0]!, 1, conv).perIon;
  it('nearest-neighbour simple cubic: k_B T_C = (2/3)(E0 - E_FM) = z J / 3 = 2 J (classical mean field)', () => {
    const j = 0.01; // eV, ferromagnetic in the default convention
    const fit = fitExchange(energies(DEFAULT_CONVENTION, [j], -9.5, false), DEFAULT_CONVENTION);
    const tc = meanFieldCurie(fit, fmC(DEFAULT_CONVENTION))!;
    expect(tc.deltaE).toBeCloseTo(3 * j, 12);
    expect(tc.kelvin).toBeCloseTo((2 * j) / BOLTZMANN_EV_K, 6);
    expect(tc.kelvin).toBeCloseTo(232.0904, 3); // 0.02 eV / 8.617333262e-5 eV/K
  });
  it('does not depend on the convention: same energies, other sign and pair counting, same T_C', () => {
    const pts = energies(DEFAULT_CONVENTION, [0.01], -9.5, false);
    const other: HeisenbergConvention = { sign: 'plus', pairs: 'twice', spin: { kind: 'S', s: 2.5 } };
    const refit = fitExchange(
      pts.map((p, i) => ({ ...p, coefficients: shellCoefficients(configs[i]!, 1, other).perIon })),
      other,
    );
    const a = meanFieldCurie(fitExchange(pts, DEFAULT_CONVENTION), fmC(DEFAULT_CONVENTION))!;
    const b = meanFieldCurie(refit, fmC(other))!;
    expect(b.kelvin).toBeCloseTo(a.kelvin, 6);
  });
  it('gives no estimate for an antiferromagnetic model or without a fit', () => {
    const afm = fitExchange(energies(DEFAULT_CONVENTION, [-0.01], -9.5, false), DEFAULT_CONVENTION);
    expect(meanFieldCurie(afm, fmC(DEFAULT_CONVENTION))).toBeUndefined();
    const under = fitExchange(energies(DEFAULT_CONVENTION, [0.01]).slice(0, 1), DEFAULT_CONVENTION);
    expect(meanFieldCurie(under, fmC(DEFAULT_CONVENTION))).toBeUndefined();
  });
  it('states the known overestimate: mean field / Monte Carlo = 2 x 0.6929 on simple cubic (S-071)', () => {
    expect(MEAN_FIELD_OVER_MC_SC).toBeCloseTo(1.3858, 4);
    const fit = fitExchange(energies(DEFAULT_CONVENTION, [0.01], -9.5, false), DEFAULT_CONVENTION);
    expect(meanFieldCurie(fit, fmC(DEFAULT_CONVENTION))!.warnings[0]).toMatch(/overestimates/);
  });
});
