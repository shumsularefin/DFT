// View-model for the convergence plot: ticks, labels, tooltip and explanation text. Pure.
// @source S-040 (Pulay stress), S-042, D-014
import { scaleLinear } from 'd3-scale';
import type { ConvergenceResult } from './convergence';
import type { SeriesKind } from './kseries';
import type { Level } from '../levels';

export const X_LABEL: Record<SeriesKind, string> = {
  encut: 'ENCUT (eV)',
  kresolution: 'k-mesh resolution (2 pi / Angstrom)',
  kmesh: 'k-mesh divisions per direction',
};

/** 0.00123 eV/atom to "1.23 meV/atom". */
export const formatMeV = (evPerAtom: number, digits = 2): string =>
  `${(evPerAtom * 1000).toFixed(digits)} meV/atom`;

export const formatEv = (evPerAtom: number): string => `${evPerAtom.toFixed(5)} eV/atom`;

/** Tick values for a numeric range (about `count` ticks, "nice" numbers). A flat range is widened. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.05 : 1;
    lo -= pad;
    hi += pad;
  }
  return scaleLinear().domain([lo, hi]).nice(count).ticks(count);
}

/** Tick label without float noise: 0.1 + 0.2 shows as 0.3. */
export const formatTick = (v: number): string => String(Number(v.toPrecision(10)));

export interface PlotPoint {
  x: number;
  /** Plotted value: meV/atom relative to the last point, or eV/atom absolute. */
  y: number;
  label: string;
  tooltip: string;
  converged: boolean;
}

export interface EnergyView {
  points: PlotPoint[];
  yLabel: string;
  /** Threshold band around the final value, in plot units. */
  band: { lo: number; hi: number };
  convergedIndex: number | null;
}

/** Energy view. Relative: meV/atom minus the last point, band = +/- threshold. Absolute: eV/atom, band around the last value. */
export function energyView(r: ConvergenceResult, thresholdEvPerAtom: number, relative: boolean): EnergyView {
  const lastAbs = r.perAtom.at(-1) ?? 0;
  const points = r.points.map((p, i) => {
    const abs = r.perAtom[i]!;
    const y = relative ? (abs - lastAbs) * 1000 : abs;
    const conv = r.convergedIndex !== null && i >= r.convergedIndex;
    return {
      x: p.x,
      y,
      label: `x = ${p.x}`,
      tooltip: tooltipText(r, i, thresholdEvPerAtom),
      converged: conv,
    };
  });
  const t = relative ? thresholdEvPerAtom * 1000 : thresholdEvPerAtom;
  const centre = relative ? 0 : lastAbs;
  return {
    points,
    yLabel: relative ? 'Energy minus last point (meV/atom)' : 'Energy (eV/atom)',
    band: { lo: centre - t, hi: centre + t },
    convergedIndex: r.convergedIndex,
  };
}

/** Plain text for one point, used by hover, focus and the table. */
export function tooltipText(r: ConvergenceResult, i: number, thresholdEvPerAtom: number): string {
  const p = r.points[i];
  if (!p) return '';
  const d = r.diffs[i]!;
  const within = Math.abs(d) <= thresholdEvPerAtom + 1e-12;
  const mark =
    r.convergedIndex === i
      ? 'First converged point.'
      : r.convergedIndex !== null && i > r.convergedIndex
        ? 'Converged.'
        : within
          ? 'Within the threshold of the last point, but an earlier or later point is not.'
          : 'Not converged.';
  return `x = ${p.x}: ${formatEv(r.perAtom[i]!)}, ${formatMeV(d)} from the last point. ${mark}`;
}

export interface Explanation {
  headline: string;
  details: string[];
  advice: string[];
}

/** Explanation panel text. Beginner gets the result and one reason; deeper levels add the criterion and caveats. */
export function explain(
  r: ConvergenceResult,
  o: { kind: SeriesKind; thresholdEvPerAtom: number; enmax?: number; level: Level },
): Explanation {
  const mev = formatMeV(o.thresholdEvPerAtom, 1).replace(' meV/atom', '');
  const unit = o.kind === 'encut' ? ' eV' : '';
  const name =
    o.kind === 'encut' ? 'ENCUT' : o.kind === 'kresolution' ? 'the k-mesh resolution' : 'the k-mesh';
  const details: string[] = [];
  const advice: string[] = [];
  let headline: string;
  if (r.status === 'converged' && r.convergedIndex !== null) {
    const x = r.points[r.convergedIndex]!.x;
    headline = `Your energy stops changing by more than ${mev} meV per atom from ${name} = ${x}${unit}.`;
    details.push(
      'Why this matters: a setting that is too low gives wrong energy differences, and one that is too high wastes computer time. The cheapest setting that has settled is the sensible choice.',
    );
    if (o.level !== 'beginner')
      details.push(
        `The rule: a point counts as converged when every later point stays within ${mev} meV/atom of it. The last point alone is never evidence, so at least one higher point must confirm it.`,
      );
    if (o.level === 'pro')
      details.push(
        'Total energy itself does not converge to a physical number; differences between structures do. Repeat the check on the quantity you will report (for example a formation energy), not only on total energy.',
      );
  } else if (r.status === 'not-converged') {
    headline = `No point agrees with all later points within ${mev} meV per atom, so this series has not converged.`;
    details.push('Add points at higher settings and run them, then plot again.');
  } else {
    headline = 'Add at least two points to judge convergence.';
  }
  if (o.kind === 'encut') {
    if (o.enmax) {
      const x13 = Math.round(1.3 * o.enmax * 100) / 100;
      advice.push(
        `For a relaxation or any run with changing cell shape use about 1.3 x ENMAX = ${x13} eV anyway, because stress converges more slowly than energy (Pulay stress, S-040).`,
      );
    } else {
      advice.push(
        'Enter ENMAX (from grep ENMAX POTCAR) to see the 1.3 x ENMAX advice for relaxations (Pulay stress, S-040).',
      );
    }
  }
  return { headline, details, advice: [...advice, ...r.warnings] };
}

/** CSV of the analysed table. */
export function toCsv(r: ConvergenceResult, kind: SeriesKind): string {
  const head = `${kind === 'encut' ? 'encut' : kind === 'kresolution' ? 'resolution' : 'kmesh'},energy_per_atom_eV,diff_from_last_meV,pressure_kB,converged`;
  const rows = r.points.map((p, i) => {
    const conv = r.convergedIndex !== null && i >= r.convergedIndex ? 'yes' : 'no';
    return [p.x, r.perAtom[i]!.toFixed(6), (r.diffs[i]! * 1000).toFixed(3), p.pressure ?? '', conv].join(',');
  });
  return [head, ...rows].join('\n') + '\n';
}
