// Convergence detection for a series of runs. Pure.
// @source S-040 (Pulay stress), S-042, D-014 (criterion), D-015 (default quantity), Q-014 (pressure threshold is heuristic)
import { orderByCost, type SeriesKind } from './kseries';
import type { OutcarResult } from './outcar';

export type EnergyQuantity = 'freeEnergyTOTEN' | 'energyWithoutEntropy' | 'energySigma0';

export interface SeriesPoint {
  /** The setting varied: ENCUT in eV, k resolution, or mesh size. */
  x: number;
  /** Total energy of the cell in eV. */
  energy: number;
  /** Atoms in the cell; needed for energy per atom. Defaults to 1 with a warning. */
  natoms?: number;
  /** Pressure in kB, when known. */
  pressure?: number;
  label?: string;
}

export interface AnalyzeOptions {
  /** eV per atom. Default 1e-3 (1 meV/atom). */
  thresholdEvPerAtom?: number;
  /** kB. Default 5. Heuristic with no cited basis (Q-014). */
  pressureThresholdKb?: number;
  /** What the energies are, for the explanation text. Default energySigma0 (D-015). */
  quantity?: EnergyQuantity;
  /** Largest ENMAX in the POTCAR, eV, to warn when the lowest ENCUT is below it. */
  enmax?: number;
  /** When given, points are sorted by cost first. Without it they must already be in cost order. */
  kind?: SeriesKind;
}

/** `only-last-point` is kept for API compatibility; under D-014 as written the case it describes is reported as `not-converged` (Q-031). */
export type ConvergenceStatus = 'converged' | 'only-last-point' | 'not-converged' | 'too-few-points';

export interface ConvergenceResult {
  /** Energy per atom in eV for each point (in the order analysed). */
  perAtom: number[];
  /** perAtom minus the last point's value, eV per atom. */
  diffs: number[];
  /** Smallest index after which every later point stays within the threshold; null when there is none. */
  convergedIndex: number | null;
  status: ConvergenceStatus;
  /** True when |diff| never grows from one point to the next. */
  monotonic: boolean;
  pressure?: { convergedIndex: number | null; status: ConvergenceStatus };
  explanation: string;
  warnings: string[];
  /** Points in the order analysed. */
  points: SeriesPoint[];
}

const EPS = 1e-12;

/** D-014: smallest i such that every later value is within `threshold` of value i. The last index alone is not evidence. */
function firstConverged(
  v: readonly number[],
  threshold: number,
): { index: number | null; status: ConvergenceStatus } {
  if (v.length < 2) return { index: null, status: 'too-few-points' };
  for (let i = 0; i < v.length - 1; i++) {
    let ok = true;
    for (let j = i + 1; j < v.length; j++) if (Math.abs(v[j]! - v[i]!) > threshold + EPS) ok = false;
    if (ok) return { index: i, status: 'converged' };
  }
  // Only the last index qualifies, and that is vacuous (no later point to compare), so there is no evidence (D-014).
  return { index: null, status: 'not-converged' };
}

/** Total energy divided by atoms. */
export const energyPerAtom = (total: number, natoms: number): number => total / natoms;

/** A series point from a parsed OUTCAR: the last ionic step's energy for the chosen quantity (default energy(sigma->0)). */
export function pointFromOutcar(
  x: number,
  o: OutcarResult,
  quantity: EnergyQuantity = 'energySigma0',
  label?: string,
): SeriesPoint | null {
  const last = [...o.ionic].reverse().find((s) => s[quantity] !== undefined);
  if (!last || last[quantity] === undefined) return null;
  const p = o.pressure.at(-1);
  return {
    x,
    energy: last[quantity]!,
    ...(o.nions ? { natoms: o.nions.value } : {}),
    ...(p ? { pressure: p.pressureKb } : {}),
    ...(label ? { label } : {}),
  };
}

const QUANTITY_TEXT: Record<EnergyQuantity, string> = {
  freeEnergyTOTEN: 'free energy (TOTEN)',
  energyWithoutEntropy: 'energy without entropy',
  energySigma0: 'energy(sigma->0)',
};

export function analyzeSeries(input: readonly SeriesPoint[], opts: AnalyzeOptions = {}): ConvergenceResult {
  const threshold = opts.thresholdEvPerAtom ?? 1e-3;
  const pThreshold = opts.pressureThresholdKb ?? 5;
  const quantity = opts.quantity ?? 'energySigma0';
  const warnings: string[] = [];
  const points = opts.kind ? orderByCost(input, opts.kind) : [...input];
  if (opts.kind && points.some((p, i) => p !== input[i]))
    warnings.push('Points were re-ordered from cheapest to most expensive before the check.');
  if (points.some((p) => p.natoms === undefined))
    warnings.push(
      'The number of atoms is missing for some points, so energies are treated as per atom as given.',
    );
  const perAtom = points.map((p) => energyPerAtom(p.energy, p.natoms ?? 1));
  const last = perAtom.at(-1) ?? 0;
  const diffs = perAtom.map((e) => e - last);
  const { index, status } = firstConverged(perAtom, threshold);
  const monotonic = diffs.every((d, i) => i === 0 || Math.abs(d) <= Math.abs(diffs[i - 1]!) + EPS);
  if (index !== null && index === points.length - 2)
    warnings.push('Only one later point confirms this result. Add points beyond it to be sure.');
  if (points.length >= 2 && points.length < 4)
    warnings.push('Fewer than 4 points: a convergence judgement from so few is weak.');
  if (!monotonic && points.length >= 2)
    warnings.push(
      'The energy does not approach its final value steadily (non-monotonic). Check the runs and add points before trusting the result.',
    );
  if (opts.enmax !== undefined && opts.kind === 'encut' && points[0] && points[0].x < opts.enmax)
    warnings.push(
      `The lowest ENCUT (${points[0].x} eV) is below ENMAX (${opts.enmax} eV); results at that point are not reliable.`,
    );

  let pressure: ConvergenceResult['pressure'];
  const ps = points.map((p) => p.pressure);
  if (ps.every((p): p is number => p !== undefined) && ps.length >= 2) {
    const pr = firstConverged(ps as number[], pThreshold);
    pressure = { convergedIndex: pr.index, status: pr.status };
    if (index !== null && (pr.index === null || pr.index > index))
      warnings.push(
        `The energy has converged but the pressure has not (heuristic threshold ${pThreshold} kB). With a fixed ENCUT, Pulay stress distorts the pressure; for relaxations use about 1.3 x ENMAX (S-040).`,
      );
  }

  let explanation: string;
  const q = QUANTITY_TEXT[quantity];
  const mev = (threshold * 1000).toPrecision(3).replace(/\.?0+$/, '');
  if (status === 'converged' && index !== null) {
    explanation = `Using ${q}, the result at point ${index + 1} (x = ${points[index]!.x}) is within ${mev} meV/atom of every later point, so it is the cheapest setting that has converged.`;
  } else if (status === 'not-converged') {
    explanation = `Using ${q}, no point agrees with all later points within ${mev} meV/atom. The last point alone is not evidence, so the series has not converged: add points at higher settings.`;
  } else {
    explanation = 'At least two points are needed to judge convergence.';
  }
  return {
    perAtom,
    diffs,
    convergedIndex: index,
    status,
    monotonic,
    ...(pressure ? { pressure } : {}),
    explanation,
    warnings,
    points,
  };
}
