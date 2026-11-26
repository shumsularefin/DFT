// Heisenberg energy mapping (M13.3): least squares E_config = E0 + sum_n c_n(config) J_n for collinear configurations.
// The coefficients c_n come from the M13.1 bond statistics per neighbour shell; nothing here assumes a lattice.
// The Hamiltonian convention is a parameter and is written out with every result, because J changes by a factor
// of 2 (pairs counted once or twice), by S^2 (unit spins or spins of length S) and by sign between conventions.
// The only transition temperature offered is the classical mean-field estimate for a ferromagnetic ground state
// (meanFieldCurie), labelled Heuristic, with its known overestimate (Q-042, closed 2026-11-26).
// @source S-059 (Heisenberg Hamiltonian, conventions), S-060 (energy-mapping analysis), S-070 (mean-field T_C),
// S-071 (Monte Carlo T_C, size of the mean-field error), S-031 (k_B)
import { BOLTZMANN_EV_K } from '../physics/constants';
import { bondStatistics, type MagneticConfiguration } from './orderings';

export interface HeisenbergConvention {
  /** 'plus': H = +sum J S_i.S_j, so J > 0 is antiferromagnetic. 'minus': H = -sum J S_i.S_j, so J > 0 is ferromagnetic. */
  sign: 'plus' | 'minus';
  /** 'once': each bond i-j appears once in the sum. 'twice': the sum runs over i and j separately, so each bond twice. */
  pairs: 'once' | 'twice';
  /** Unit spins (|S| = 1), or spins of length S (for example 5/2), which multiplies every coefficient by S^2. */
  spin: { kind: 'unit' } | { kind: 'S'; s: number };
}

/**
 * Default (Q-042, closed 2026-11-26): H = E0 - sum_(i<j) J_ij S_i.S_j with unit spins, so J > 0 is ferromagnetic.
 * The literature has no single standard: textbooks (S-059) and the mean-field T_C literature (S-070) use the minus
 * sign, the Whangbo energy-mapping papers (S-060) use the plus sign. The minus sign is the default because it is the
 * one in the author's Workflow Handbook (S-042) and in S-059 and S-070; pairs are counted once, as in both S-042 and
 * S-060; unit spins because collinear DFT energies determine only the products J S^2, not J and S separately.
 * The convention is printed with every result and can be switched.
 */
export const DEFAULT_CONVENTION: HeisenbergConvention = {
  sign: 'minus',
  pairs: 'once',
  spin: { kind: 'unit' },
};

/** The convention in words, printed next to every J. */
export function describeConvention(c: HeisenbergConvention): string {
  const sum =
    c.pairs === 'once'
      ? 'each bond counted once (sum over i<j)'
      : 'each bond counted twice (sum over all ordered pairs i, j)';
  const spin =
    c.spin.kind === 'unit'
      ? 'unit spins, |S| = 1'
      : `spins of length S = ${fmt(c.spin.s)} (coefficients times S^2)`;
  const sign = c.sign === 'plus' ? '+' : '-';
  const afm = c.sign === 'plus' ? 'J > 0 is antiferromagnetic' : 'J > 0 is ferromagnetic';
  return `H = E0 ${sign} sum_n J_n sum_(i,j in shell n) S_i.S_j; ${sum}; collinear spins S_i.S_j = ±S^2; ${spin}; ${afm}.`;
}
const fmt = (x: number) => String(Math.round(x * 1e6) / 1e6);

export function validateConvention(c: HeisenbergConvention): string | undefined {
  if (c.spin.kind === 'S' && !(Number.isFinite(c.spin.s) && c.spin.s > 0))
    return 'S must be a positive number.';
  return undefined;
}

export interface ShellCoefficients {
  /** Shell distances, angstrom. */
  shells: number[];
  /** c_n per magnetic ion, in the given convention, so that E/N_mag = E0 + sum c_n J_n. */
  perIon: number[];
  /** Sum over magnetic sites of (parallel - antiparallel) neighbours per shell: each bond counted twice. */
  directed: number[];
  nMagnetic: number;
}

/** Coefficients c_n for one configuration, from bondStatistics with periodic images (the cell the user ran). */
export function shellCoefficients(
  config: MagneticConfiguration,
  nShells: number,
  conv: HeisenbergConvention,
): ShellCoefficients {
  const b = bondStatistics(config, { shells: nShells });
  const directed = b.shells.map((_, n) =>
    b.sites.reduce((a, s) => a + s.shells[n]!.parallel - s.shells[n]!.antiparallel, 0),
  );
  const nMag = config.magneticSites.length;
  const pair = conv.pairs === 'once' ? 0.5 : 1;
  const s2 = conv.spin.kind === 'S' ? conv.spin.s * conv.spin.s : 1;
  const sign = conv.sign === 'plus' ? 1 : -1;
  return {
    shells: b.shells,
    perIon: directed.map((d) => (sign * pair * s2 * d) / nMag),
    directed,
    nMagnetic: nMag,
  };
}

export interface FitPoint {
  label: string;
  /** Energy per magnetic ion, eV (from the user's file or typed value). */
  energyPerIon: number;
  /** c_n per magnetic ion for this configuration, same convention for every point. */
  coefficients: number[];
}

export type Determination = 'under' | 'exact' | 'over';

export interface FitResult {
  convention: HeisenbergConvention;
  conventionText: string;
  determination: Determination;
  /** Undefined when the fit could not be made (fewer configurations than unknowns, or rank deficient). */
  e0?: number;
  /** eV, one per shell. */
  j?: number[];
  /** eV per magnetic ion, fitted minus given, one per point. */
  residuals?: number[];
  rms?: number;
  /** Ratio of largest to smallest singular value of the design matrix [1, c_1 .. c_n]. */
  condition: number;
  rank: number;
  warnings: string[];
}

/** One-sided Jacobi SVD of an m x p matrix (rows), returning singular values, V and the left vectors U (columns). */
function svd(a: number[][]): { sigma: number[]; u: number[][]; v: number[][] } {
  const m = a.length;
  const p = a[0]?.length ?? 0;
  const u = a.map((r) => [...r]);
  const v = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let rotated = false;
    for (let j = 0; j < p - 1; j++)
      for (let k = j + 1; k < p; k++) {
        let al = 0;
        let be = 0;
        let ga = 0;
        for (let i = 0; i < m; i++) {
          al += u[i]![j]! ** 2;
          be += u[i]![k]! ** 2;
          ga += u[i]![j]! * u[i]![k]!;
        }
        if (Math.abs(ga) <= 1e-15 * Math.sqrt(al * be) || ga === 0) continue;
        rotated = true;
        const zeta = (be - al) / (2 * ga);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const row of [...u, ...v]) {
          const x = row[j]!;
          const y = row[k]!;
          row[j] = c * x - s * y;
          row[k] = s * x + c * y;
        }
      }
    if (!rotated) break;
  }
  const sigma = Array.from({ length: p }, (_, j) => Math.sqrt(u.reduce((acc, r) => acc + r[j]! ** 2, 0)));
  return { sigma, u, v };
}

/**
 * Least squares fit. Needs at least (shells + 1) + 1 configurations so that one degree of freedom is left to check
 * the model (the unknowns are E0 and one J per shell); fewer gives a warning, and fewer than the unknowns gives no fit.
 */
export function fitExchange(points: readonly FitPoint[], conv: HeisenbergConvention): FitResult {
  const p = (points[0]?.coefficients.length ?? 0) + 1;
  const m = points.length;
  const warnings: string[] = [];
  const base = { convention: conv, conventionText: describeConvention(conv) };
  if (points.some((x) => x.coefficients.length !== p - 1))
    throw new Error('Every configuration needs the same number of shell coefficients.');
  const determination: Determination = m < p ? 'under' : m === p ? 'exact' : 'over';
  if (m < p) {
    warnings.push(
      `Under-determined: ${m} configuration(s) for ${p} unknowns (E0 and ${p - 1} J). Add configurations or fit fewer shells; no J is reported.`,
    );
    return { ...base, determination, condition: Infinity, rank: 0, warnings };
  }
  if (m === p)
    warnings.push(
      `Exactly determined: ${m} configurations for ${p} unknowns, so the residuals are zero by construction and nothing checks the model. Add at least one more configuration.`,
    );
  const a = points.map((x) => [1, ...x.coefficients]);
  const b = points.map((x) => x.energyPerIon);
  const { sigma, u, v } = svd(a);
  const smax = Math.max(...sigma);
  const tol = smax * 1e-10;
  const rank = sigma.filter((s) => s > tol).length;
  const smin = Math.min(...sigma);
  const condition = smin > 0 ? smax / smin : Infinity;
  if (rank < p) {
    warnings.push(
      `Rank deficient: these configurations do not separate all ${p - 1} J (two shells change together, or a shell has the same coefficient in every configuration). Choose other orderings or fewer shells; no J is reported.`,
    );
    return { ...base, determination, condition, rank, warnings };
  }
  if (condition > 1e6)
    warnings.push(
      `Badly conditioned (condition number ${condition.toExponential(1)}): small energy errors move J a lot.`,
    );
  const x = Array.from({ length: p }, () => 0);
  sigma.forEach((s, j) => {
    const ub = u.reduce((acc, r, i) => acc + r[j]! * b[i]!, 0) / (s * s);
    for (let i = 0; i < p; i++) x[i]! += v[i]![j]! * ub;
  });
  const residuals = a.map((row, i) => row.reduce((acc, c, k) => acc + c * x[k]!, 0) - b[i]!);
  const rms = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / m);
  return { ...base, determination, e0: x[0]!, j: x.slice(1), residuals, rms, condition, rank, warnings };
}

/** Shell distances of two configurations agree (they come from the same parent structure). */
export function sameShells(a: readonly number[], b: readonly number[], tolA = 1e-3): boolean {
  return a.length === b.length && a.every((d, i) => Math.abs(d - b[i]!) <= tolA);
}

export interface MeanFieldCurie {
  /** Classical mean-field Curie temperature, kelvin. */
  kelvin: number;
  /** E0 - E_FM of the fitted model, eV per magnetic ion (the paramagnetic-to-FM energy, S-070's E_DLM - E_FM). */
  deltaE: number;
  warnings: string[];
}

/** Mean field over Monte Carlo T_C for the nearest-neighbour simple-cubic classical Heisenberg model (S-071). */
export const MEAN_FIELD_OVER_MC_SC = 0.6929 / 0.5;

/**
 * Classical mean-field Curie temperature from a fit, k_B T_C = (2/3) (E0 - E_FM) per magnetic ion (S-070).
 * E0 is the fitted constant: the energy of uncorrelated (paramagnetic, DLM-like) spins, where every S_i.S_j averages
 * to zero. E_FM is the model energy of the FM configuration, E0 + sum c_n^FM J_n. The result does not depend on the
 * convention, because it uses model energies only. Equivalent to k_B T_C = (1/3) sum_n z_n J_n in the default
 * convention with unit spins. Only for a ferromagnetic ground state: returns undefined when there is no fit or when
 * E_FM is not below E0. The caller must also check that FM is the lowest computed configuration.
 * Using E_AFM - E_FM in place of E0 - E_FM (as S-042 writes it) doubles the estimate when the AFM state reverses every
 * coupled bond, because then E_AFM - E_FM = 2 (E0 - E_FM).
 */
export function meanFieldCurie(
  fit: FitResult,
  fmCoefficients: readonly number[],
): MeanFieldCurie | undefined {
  if (!fit.j || fit.e0 === undefined || fmCoefficients.length !== fit.j.length) return undefined;
  const eFm = fit.e0 + fmCoefficients.reduce((a, c, n) => a + c * fit.j![n]!, 0);
  const deltaE = fit.e0 - eFm;
  if (!(deltaE > 0)) return undefined;
  const warnings = [
    `Mean field neglects spin fluctuations and overestimates T_C: for the nearest-neighbour simple-cubic model it gives ${MEAN_FIELD_OVER_MC_SC.toFixed(3)} times the Monte Carlo value. Use Monte Carlo on the fitted J for a number to compare with experiment.`,
    'Classical spins: the fit gives J S^2, so no S(S+1) quantum factor is applied.',
  ];
  if (fit.determination !== 'over')
    warnings.push('The fit is exactly determined, so nothing checks the model behind this estimate.');
  return { kelvin: ((2 / 3) * deltaE) / BOLTZMANN_EV_K, deltaE, warnings };
}
