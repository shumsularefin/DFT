// Equation-of-state fit to an energy-volume series (M13.6). Pure.
// Energy forms, as in pymatgen (checked by the golden file):
//   Birch-Murnaghan third order (S-061), x = (V0/V)^(2/3):
//     E = E0 + (9 V0 B0 / 16) [ (x - 1)^3 B0' + (x - 1)^2 (6 - 4x) ]
//   Murnaghan (S-062):
//     E = E0 + B0 V / B0' [ (V0/V)^B0' / (B0' - 1) + 1 ] - V0 B0 / (B0' - 1)
// Fit: Levenberg-Marquardt (S-068, Numerical Recipes 15.5, Marquardt's diagonal scaling) on the four parameters
// from a parabola start (E = a V^2 + b V + c: V0 = -b/2a, B0 = 2 a V0, B0' = 4), the start used by the Workflow
// Handbook (S-042) and pymatgen. Standard errors from the covariance (J^T J)^-1 s^2, s^2 = chi^2 / (N - 4), as scipy's
// curve_fit. Warning thresholds are conventions (D-071) except where a source is named.
// @source S-061 S-062 S-068 S-042
import { EV_PER_A3_IN_GPA } from './constants';

export type EosForm = 'birch_murnaghan' | 'murnaghan';
export const EOS_FORMS: Record<EosForm, string> = {
  birch_murnaghan: 'Birch-Murnaghan (third order)',
  murnaghan: 'Murnaghan',
};

/** E0 in eV, V0 in Angstrom^3, B0 in eV/Angstrom^3, B1 = B0' (dimensionless). */
export interface EosParams {
  e0: number;
  v0: number;
  b0: number;
  b1: number;
}
export interface EvPoint {
  /** Angstrom^3 per cell. */
  volume: number;
  /** eV per cell. */
  energy: number;
  label?: string;
}
export type EosWarningCode =
  | 'too-few-points'
  | 'minimum-outside'
  | 'lowest-at-edge'
  | 'asymmetric'
  | 'large-residuals'
  | 'unusual-b1'
  | 'not-converged';
export interface EosWarning {
  code: EosWarningCode;
  severity: 'warning' | 'info';
  message: string;
  /** True when the threshold is a rule of thumb (shown as "Heuristic"). */
  heuristic: boolean;
  sources: string[];
}
export interface EosFit {
  form: EosForm;
  params: EosParams;
  /** B0 in GPa. */
  b0GPa: number;
  /** Standard errors of the parameters (same units), or null with no degrees of freedom left. */
  stderr: EosParams | null;
  guess: EosParams;
  /** Points sorted by volume, with fitted energy and residual (data minus fit), eV. */
  points: (EvPoint & { fit: number; residual: number })[];
  /** Root-mean-square residual, eV per cell. */
  rmsResidual: number;
  /** RMS residual per atom, eV, when the atom count is known. */
  rmsResidualPerAtom?: number;
  iterations: number;
  converged: boolean;
  warnings: EosWarning[];
}
export interface FitOptions {
  /** Atoms per cell, for per-atom residuals and the residual warning. */
  natoms?: number;
}

/** Conventions (D-071). */
export const EOS_RULES = {
  minPoints: 4,
  recommendedPoints: 5,
  /** Points needed on each side of V0. */
  minPerSide: 2,
  /** Largest ratio of the sampled spans below and above V0 (either way round). */
  maxSpanRatio: 2,
  /** RMS residual above this, eV per atom, is "large" (per cell when the atom count is unknown). */
  maxRmsPerAtomEV: 2e-3,
  /** S-042: "B'0 is usually 3.5 to 5". */
  usualB1: [3.5, 5] as const,
} as const;

/** Energy of the chosen form at volume v. */
export function eosEnergy(form: EosForm, v: number, p: EosParams): number {
  if (form === 'birch_murnaghan') {
    const x = (p.v0 / v) ** (2 / 3);
    return p.e0 + ((9 * p.v0 * p.b0) / 16) * ((x - 1) ** 3 * p.b1 + (x - 1) ** 2 * (6 - 4 * x));
  }
  return p.e0 + ((p.b0 * v) / p.b1) * ((p.v0 / v) ** p.b1 / (p.b1 - 1) + 1) - (p.v0 * p.b0) / (p.b1 - 1);
}

/** Derivatives of the energy with respect to (e0, v0, b0, b1), analytic. */
export function eosGradient(form: EosForm, v: number, p: EosParams): [number, number, number, number] {
  if (form === 'birch_murnaghan') {
    const x = (p.v0 / v) ** (2 / 3);
    const F = (x - 1) ** 3 * p.b1 + (x - 1) ** 2 * (6 - 4 * x);
    const dF = 3 * (x - 1) ** 2 * p.b1 + 2 * (x - 1) * (6 - 4 * x) - 4 * (x - 1) ** 2;
    return [
      1,
      ((9 * p.b0) / 16) * (F + (2 / 3) * x * dF),
      ((9 * p.v0) / 16) * F,
      ((9 * p.v0 * p.b0) / 16) * (x - 1) ** 3,
    ];
  }
  const { v0, b0, b1 } = p;
  const r = v0 / v;
  const t = r ** b1;
  const dv0 = (b0 / (b1 - 1)) * (r ** (b1 - 1) - 1);
  const db0 = (v / b1) * (t / (b1 - 1) + 1) - v0 / (b1 - 1);
  const db1 =
    b0 *
      v *
      ((t * Math.log(r)) / (b1 * (b1 - 1)) - (t * (2 * b1 - 1)) / (b1 * b1 * (b1 - 1) ** 2) - 1 / (b1 * b1)) +
    (v0 * b0) / (b1 - 1) ** 2;
  return [1, dv0, db0, db1];
}

/** Least-squares parabola E = a V^2 + b V + c and the start it gives (Workflow Handbook S-042, pymatgen). */
export function parabolaGuess(points: readonly EvPoint[]): {
  a: number;
  b: number;
  c: number;
  guess: EosParams;
} {
  // Normal equations in centred, scaled volumes for stability.
  const n = points.length;
  const vm = points.reduce((s, q) => s + q.volume, 0) / n;
  const sc = Math.max(...points.map((q) => Math.abs(q.volume - vm))) || 1;
  const S = [0, 0, 0, 0, 0];
  const T = [0, 0, 0];
  for (const q of points) {
    const u = (q.volume - vm) / sc;
    for (let k = 0; k < 5; k++) S[k]! += u ** k;
    for (let k = 0; k < 3; k++) T[k]! += q.energy * u ** k;
  }
  const [c0, c1, c2] = solve(
    [
      [S[0]!, S[1]!, S[2]!],
      [S[1]!, S[2]!, S[3]!],
      [S[2]!, S[3]!, S[4]!],
    ],
    T,
  );
  // E = c2 u^2 + c1 u + c0, u = (V - vm)/sc, back to V.
  const a = c2! / (sc * sc);
  const b = c1! / sc - 2 * a * vm;
  const c = c0! - (c1! * vm) / sc + a * vm * vm;
  const v0 = -b / (2 * a);
  return { a, b, c, guess: { e0: a * v0 * v0 + b * v0 + c, v0, b0: 2 * a * v0, b1: 4 } };
}

/** Gaussian elimination with partial pivoting; throws on a singular matrix. */
function solve(A: number[][], y: number[]): number[] {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-300) throw new RangeError('singular');
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

const toArr = (p: EosParams): number[] => [p.e0, p.v0, p.b0, p.b1];
const toParams = (a: readonly number[]): EosParams => ({ e0: a[0]!, v0: a[1]!, b0: a[2]!, b1: a[3]! });

/**
 * Fit an equation of state. Throws a RangeError with a plain message when no fit is possible (fewer than 4 points,
 * non-finite numbers, repeated volumes only, or a parabola with no minimum). Everything else comes back as warnings.
 */
export function fitEos(
  input: readonly EvPoint[],
  form: EosForm = 'birch_murnaghan',
  opts: FitOptions = {},
): EosFit {
  const pts = [...input].sort((a, b) => a.volume - b.volume);
  if (pts.some((q) => !Number.isFinite(q.volume) || !Number.isFinite(q.energy) || q.volume <= 0)) {
    throw new RangeError('Every point needs a positive volume and a finite energy.');
  }
  if (pts.length < EOS_RULES.minPoints) {
    throw new RangeError(
      `An equation of state has 4 parameters, so it needs at least 4 points (you have ${pts.length}); 7 to 11 are recommended.`,
    );
  }
  if (new Set(pts.map((q) => q.volume)).size < 3) {
    throw new RangeError('The points need at least three different volumes.');
  }
  const { a, guess } = parabolaGuess(pts);
  if (!(a > 0)) {
    throw new RangeError(
      'The energies do not curve upwards (a parabola through them has no minimum). Check that every run used the same settings, and that the series spans the minimum.',
    );
  }

  // Levenberg-Marquardt with Marquardt's scaling: (J^T J + lambda diag(J^T J)) d = J^T r.
  const residuals = (p: EosParams): number[] => pts.map((q) => q.energy - eosEnergy(form, q.volume, p));
  const chi2 = (r: readonly number[]): number => r.reduce((s, x) => s + x * x, 0);
  let p = toArr(guess);
  let r = residuals(toParams(p));
  let c2 = chi2(r);
  let lambda = 1e-3;
  let it = 0;
  let converged = false;
  const MAX = 500;
  for (; it < MAX; it++) {
    const J = pts.map((q) => eosGradient(form, q.volume, toParams(p)));
    const A = [0, 1, 2, 3].map((i) =>
      [0, 1, 2, 3].map((j) => J.reduce((s, row) => s + row[i]! * row[j]!, 0)),
    );
    const g = [0, 1, 2, 3].map((i) => J.reduce((s, row, k) => s + row[i]! * r[k]!, 0));
    let accepted = false;
    let small = false;
    for (let tries = 0; tries < 60 && !accepted; tries++) {
      const Al = A.map((row, i) => row.map((x, j) => (i === j ? x * (1 + lambda) : x)));
      let d: number[];
      try {
        d = solve(Al, g);
      } catch {
        lambda *= 10;
        continue;
      }
      const trial = p.map((x, i) => x + d[i]!);
      const rt = residuals(toParams(trial));
      const ct = chi2(rt);
      small = d.every((x, i) => Math.abs(x) <= 1e-13 * (Math.abs(p[i]!) + 1e-13));
      if (Number.isFinite(ct) && ct <= c2) {
        const drop = c2 - ct;
        p = trial;
        r = rt;
        lambda = Math.max(lambda / 10, 1e-15);
        accepted = true;
        if (small || drop <= 1e-15 * c2 || ct === 0) converged = true;
        c2 = ct;
      } else {
        lambda *= 10;
        if (small) break;
      }
    }
    if (!accepted) {
      // No downhill step at any damping: a minimum to machine precision.
      converged = small || lambda > 1e10;
      break;
    }
    if (converged) break;
  }
  const params = toParams(p);

  // Covariance: (J^T J)^-1 s^2.
  let stderr: EosParams | null = null;
  const dof = pts.length - 4;
  if (dof > 0) {
    const J = pts.map((q) => eosGradient(form, q.volume, params));
    const A = [0, 1, 2, 3].map((i) =>
      [0, 1, 2, 3].map((j) => J.reduce((s, row) => s + row[i]! * row[j]!, 0)),
    );
    try {
      const s2 = c2 / dof;
      const diag = [0, 1, 2, 3].map(
        (i) =>
          solve(
            A,
            [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)),
          )[i]!,
      );
      stderr = toParams(diag.map((x) => Math.sqrt(Math.max(0, x) * s2)));
    } catch {
      stderr = null;
    }
  }

  const fitted = pts.map((q, k) => ({ ...q, fit: q.energy - r[k]!, residual: r[k]! }));
  const rms = Math.sqrt(c2 / pts.length);
  const result: EosFit = {
    form,
    params,
    b0GPa: params.b0 * EV_PER_A3_IN_GPA,
    stderr,
    guess,
    points: fitted,
    rmsResidual: rms,
    ...(opts.natoms && opts.natoms > 0 ? { rmsResidualPerAtom: rms / opts.natoms } : {}),
    iterations: it,
    converged,
    warnings: [],
  };
  result.warnings = eosWarnings(result, opts);
  return result;
}

const meV = (x: number) => `${(x * 1000).toFixed(2)} meV`;

/** The warnings for a fit (exported for tests). */
export function eosWarnings(f: EosFit, opts: FitOptions = {}): EosWarning[] {
  const w: EosWarning[] = [];
  const vols = f.points.map((q) => q.volume);
  const vmin = vols[0]!;
  const vmax = vols.at(-1)!;
  const { v0, b1 } = f.params;
  if (!f.converged) {
    w.push({
      code: 'not-converged',
      severity: 'warning',
      message: 'The fit stopped before it converged; treat the numbers as rough.',
      heuristic: false,
      sources: ['S-068'],
    });
  }
  if (f.points.length < EOS_RULES.recommendedPoints) {
    w.push({
      code: 'too-few-points',
      severity: 'warning',
      message: `Only ${f.points.length} points for 4 parameters: the curve passes through every point, so nothing checks the fit. Run 7 to 11 volumes.`,
      heuristic: false,
      sources: ['S-042'],
    });
  }
  const outside = v0 < vmin || v0 > vmax;
  if (outside) {
    w.push({
      code: 'minimum-outside',
      severity: 'warning',
      message: `The fitted minimum (V0 = ${v0.toFixed(3)} Angstrom^3) is outside the sampled volumes (${vmin.toFixed(3)} to ${vmax.toFixed(3)}). The fit is extrapolating; extend the series past the minimum.`,
      heuristic: false,
      sources: ['S-042'],
    });
  }
  const lowest = f.points.reduce((m, q, k) => (q.energy < f.points[m]!.energy ? k : m), 0);
  if (!outside && (lowest === 0 || lowest === f.points.length - 1)) {
    w.push({
      code: 'lowest-at-edge',
      severity: 'warning',
      message:
        'The lowest energy is at the edge of the series. Extend the scan on that side so the minimum is bracketed.',
      heuristic: false,
      sources: ['S-042'],
    });
  }
  if (!outside) {
    const below = vols.filter((v) => v < v0).length;
    const above = vols.filter((v) => v > v0).length;
    const ratio = (v0 - vmin) / (vmax - v0);
    if (
      Math.min(below, above) < EOS_RULES.minPerSide ||
      ratio > EOS_RULES.maxSpanRatio ||
      ratio < 1 / EOS_RULES.maxSpanRatio
    ) {
      w.push({
        code: 'asymmetric',
        severity: 'warning',
        message: `The sampling is lopsided around V0 (${below} points below, ${above} above; the range below is ${ratio.toFixed(2)} times the range above). B0' depends most on the side with few points; add volumes on the short side.`,
        heuristic: true,
        sources: ['S-042'],
      });
    }
  }
  const perAtom = opts.natoms && opts.natoms > 0;
  const rmsCheck = perAtom ? f.rmsResidual / opts.natoms! : f.rmsResidual;
  if (rmsCheck > EOS_RULES.maxRmsPerAtomEV) {
    w.push({
      code: 'large-residuals',
      severity: 'warning',
      message: `The points scatter around the curve by ${meV(rmsCheck)} ${perAtom ? 'per atom' : 'per cell (atom count not given)'} (RMS), more than ${meV(EOS_RULES.maxRmsPerAtomEV)}. Usual causes: different ENCUT or k-mesh between runs, loose EDIFF, or a run that did not converge.`,
      heuristic: true,
      sources: ['S-042'],
    });
  }
  const [lo, hi] = EOS_RULES.usualB1;
  if (b1 < lo || b1 > hi) {
    w.push({
      code: 'unusual-b1',
      severity: 'info',
      message: `B0' = ${b1.toFixed(2)} is outside the usual ${lo} to ${hi}. Values far outside suggest too few points, too narrow a range or noisy energies.`,
      heuristic: true,
      sources: ['S-042'],
    });
  }
  return w;
}

/** Cubic lattice constant from the cell volume: a = (n V)^(1/3), n = conventional / chosen cell (1 sc, 2 bcc, 4 fcc primitive). */
export function cubicLatticeConstant(
  v: number,
  cellsPerConventional: 1 | 2 | 4 = 1,
  vErr?: number,
): { a: number; aErr?: number } {
  const a = Math.cbrt(v * cellsPerConventional);
  return { a, ...(vErr !== undefined ? { aErr: (a * vErr) / (3 * v) } : {}) };
}

/** Fit curve for plotting: n energies across [lo, hi]. */
export function eosCurve(f: EosFit, lo: number, hi: number, n = 200): { volume: number; energy: number }[] {
  return Array.from({ length: n }, (_, k) => {
    const v = lo + ((hi - lo) * k) / (n - 1);
    return { volume: v, energy: eosEnergy(f.form, v, f.params) };
  });
}
