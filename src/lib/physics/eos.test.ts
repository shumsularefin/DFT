import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EV_PER_A3_IN_GPA } from './constants';
import {
  cubicLatticeConstant,
  eosCurve,
  eosEnergy,
  eosGradient,
  fitEos,
  parabolaGuess,
  type EosForm,
  type EosParams,
} from './eos';

interface Fit {
  e0: number;
  v0: number;
  b0: number;
  b1: number;
}
interface Case {
  name: string;
  form: EosForm;
  generating: Fit;
  noise_ev: number;
  volumes: number[];
  energies: number[];
  pymatgen?: Fit & { b0_GPa: number };
  scipy?: Fit & { guess: Fit; stderr: Record<keyof Fit, number | null>; rms_residual: number };
}
const ref = JSON.parse(readFileSync('tests/reference/eos_reference.json', 'utf8')) as {
  ev_per_a3_in_gpa: number;
  cases: Case[];
  bad: Case[];
};
const KEYS = ['e0', 'v0', 'b0', 'b1'] as const;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const points = (c: Case) => c.volumes.map((volume, k) => ({ volume, energy: c.energies[k]! }));

describe('unit constant (S-031, golden from scipy.constants)', () => {
  it('1 eV/Angstrom^3 = 160.21766 GPa', () => {
    expect(EV_PER_A3_IN_GPA).toBeCloseTo(ref.ev_per_a3_in_gpa, 9);
    expect(EV_PER_A3_IN_GPA.toFixed(5)).toBe('160.21766');
  });
});

describe('energy forms and derivatives', () => {
  const p: EosParams = { e0: -3.7, v0: 12, b0: 0.9, b1: 4.5 };
  it('both forms have E(V0) = E0 and zero slope at V0', () => {
    for (const form of ['birch_murnaghan', 'murnaghan'] as const) {
      expect(eosEnergy(form, p.v0, p)).toBeCloseTo(p.e0, 12);
      const h = 1e-5;
      expect((eosEnergy(form, p.v0 + h, p) - eosEnergy(form, p.v0 - h, p)) / (2 * h)).toBeCloseTo(0, 8);
      // Curvature at V0 is B0 / V0 (the definition of the bulk modulus).
      const c = (eosEnergy(form, p.v0 + 1e-3, p) - 2 * p.e0 + eosEnergy(form, p.v0 - 1e-3, p)) / 1e-6;
      expect(rel(c, p.b0 / p.v0)).toBeLessThan(1e-5);
    }
  });
  it('analytic parameter derivatives match central differences', () => {
    for (const form of ['birch_murnaghan', 'murnaghan'] as const)
      for (const v of [10.5, 12, 13.4]) {
        const g = eosGradient(form, v, p);
        KEYS.forEach((k, i) => {
          const h = 1e-6 * Math.max(1, Math.abs(p[k]));
          const num =
            (eosEnergy(form, v, { ...p, [k]: p[k] + h }) - eosEnergy(form, v, { ...p, [k]: p[k] - h })) /
            (2 * h);
          expect(Math.abs(g[i]! - num)).toBeLessThan(1e-7);
        });
      }
  });
});

describe('fit against the golden file (pymatgen EOS and scipy curve_fit)', () => {
  it.each(ref.cases.filter((c) => c.noise_ev === 0).map((c) => [c.name, c] as const))(
    'noise-free %s: fitted parameters equal the generating ones within 1e-6 relative',
    (_, c) => {
      const f = fitEos(points(c), c.form);
      expect(f.converged).toBe(true);
      for (const k of KEYS) expect(rel(f.params[k], c.generating[k]), k).toBeLessThan(1e-6);
      expect(f.warnings).toEqual([]);
    },
  );
  it.each(ref.cases.filter((c) => c.noise_ev > 0).map((c) => [c.name, c] as const))(
    'noisy %s: equals pymatgen within 1e-4 (work order) and scipy within 1e-5; chi^2 no worse than scipy; standard errors as curve_fit',
    (_, c) => {
      const f = fitEos(points(c), c.form);
      // B0' sits in a flat valley (standard error about 1 to 2), so fits that agree in chi^2 to 1e-12 can differ by
      // about 1e-6 in B0'. The sharper test is that our chi^2 is not above scipy's tightened fit.
      const chi2 = (p: Fit) =>
        points(c).reduce((s, q) => s + (q.energy - eosEnergy(c.form, q.volume, p)) ** 2, 0);
      expect(chi2(f.params)).toBeLessThanOrEqual(chi2(c.scipy!) * (1 + 1e-12));
      for (const k of KEYS) {
        expect(rel(f.params[k], c.pymatgen![k]), k).toBeLessThan(1e-4);
        expect(rel(f.params[k], c.scipy![k]), k).toBeLessThan(1e-5);
        expect(rel(f.stderr![k], c.scipy!.stderr[k]!), `stderr ${k}`).toBeLessThan(1e-4);
      }
      expect(rel(f.b0GPa, c.pymatgen!.b0_GPa)).toBeLessThan(1e-4);
      expect(rel(f.rmsResidual, c.scipy!.rms_residual)).toBeLessThan(1e-6);
      // Only the B0' note may appear on realistic 2 meV noise.
      expect(f.warnings.filter((w) => w.code !== 'unusual-b1')).toEqual([]);
    },
  );
  it('the parabola start equals the generator start', () => {
    for (const c of ref.cases) {
      const g = parabolaGuess(points(c)).guess;
      for (const k of KEYS) expect(rel(g[k], c.scipy!.guess[k]), `${c.name} ${k}`).toBeLessThan(1e-8);
    }
  });
});

describe('warnings on the bad-sampling fixtures', () => {
  const bad = (name: string) => ref.bad.find((c) => c.name === name)!;
  const codes = (name: string, natoms?: number) =>
    fitEos(points(bad(name)), 'birch_murnaghan', natoms ? { natoms } : {}).warnings.map((w) => w.code);
  it('minimum outside the sampled range', () => {
    expect(codes('bad_minimum_outside')).toContain('minimum-outside');
  });
  it('fewer than 5 points (4 points: fit, but nothing checks it; no standard errors)', () => {
    expect(codes('bad_four_points')).toContain('too-few-points');
    expect(fitEos(points(bad('bad_four_points'))).stderr).toBeNull();
  });
  it('asymmetric sampling (5 points below V0, 1 above)', () => {
    expect(codes('bad_asymmetric')).toContain('asymmetric');
  });
  it('large residuals (30 meV noise), per cell and per atom, and the unusual B0p note', () => {
    expect(codes('bad_large_residuals')).toEqual(expect.arrayContaining(['large-residuals', 'unusual-b1']));
    expect(codes('bad_large_residuals', 40)).not.toContain('large-residuals'); // 35 meV over 40 atoms is under 2 meV
    const f = fitEos(points(bad('bad_large_residuals')), 'birch_murnaghan', { natoms: 2 });
    expect(f.rmsResidualPerAtom).toBeCloseTo(f.rmsResidual / 2, 15);
    expect(f.warnings.find((w) => w.code === 'large-residuals')?.heuristic).toBe(true);
  });
  it('the lowest point at an edge is flagged even when V0 is just inside', () => {
    const c = ref.cases.find((x) => x.name === 'set_a_birch_murnaghan_clean')!;
    const pts = points(c).slice(3); // keeps V0 as the first point
    pts[0] = { ...pts[0]!, volume: pts[0]!.volume * 0.999 };
    expect(fitEos(pts).warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['lowest-at-edge']));
  });
});

describe('refusals, lattice constant and curve', () => {
  it('fewer than 4 points, non-finite values, and data with no minimum are refused with a reason', () => {
    expect(() => fitEos([1, 2, 3].map((v) => ({ volume: v, energy: v * v })))).toThrow(/at least 4 points/);
    expect(() => fitEos([1, 2, 3, 4].map((v) => ({ volume: v, energy: v === 2 ? Number.NaN : v })))).toThrow(
      /finite/,
    );
    expect(() => fitEos([1, 2, 3, 4].map((v) => ({ volume: v, energy: -v * v })))).toThrow(/no minimum/);
    expect(() => fitEos([1, 1, 2, 2].map((v) => ({ volume: v, energy: v })))).toThrow(
      /three different volumes/,
    );
  });
  it('cubic lattice constant: a = (n V)^(1/3) with error propagation', () => {
    expect(cubicLatticeConstant(64)).toEqual({ a: 4 });
    expect(cubicLatticeConstant(16, 4).a).toBeCloseTo(4, 12); // fcc primitive cell is a^3 / 4
    expect(cubicLatticeConstant(32, 2).a).toBeCloseTo(4, 12); // bcc primitive cell is a^3 / 2
    expect(cubicLatticeConstant(64, 1, 0.3).aErr).toBeCloseTo((4 * 0.3) / 192, 15);
  });
  it('the curve passes through the fitted minimum', () => {
    const c = ref.cases[0]!;
    const f = fitEos(points(c), c.form);
    const curve = eosCurve(f, c.volumes[0]!, c.volumes.at(-1)!, 301);
    const m = curve.reduce((a, b) => (b.energy < a.energy ? b : a));
    expect(Math.abs(m.volume - f.params.v0)).toBeLessThan(0.01);
  });
});
