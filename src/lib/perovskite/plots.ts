/**
 * View-models for the tolerance-factor plots and sweeps. Pure functions, no DOM.
 * Missing values stay missing: a gap carries its reason and is never interpolated.
 * @source S-003 (t window, tau threshold), S-022 (octahedral limits), S-001 (radii)
 */
import { BARTEL_THRESHOLD, bartelTau } from './factors';
import { MU_MAX, MU_MIN, evaluateCompound, type Composition } from './checks';
import type { Occupant } from './sites';
import type { Policy } from './urlState';

/**
 * Optimal t bounds found by a decision tree on 576 experimental ABX3 solids, 74 % classification accuracy
 * (Bartel et al., Fig. 2A, arXiv:1801.07700 text; S-003). Shown as a source-backed range, not a guarantee.
 */
export const T_WINDOW = { lo: 0.825, hi: 1.059, source: 'S-003' } as const;

export interface RefLine {
  axis: 'x' | 'y';
  value: number;
  label: string;
  source: string;
}
export interface Band {
  axis: 'x' | 'y';
  lo: number;
  hi: number;
  label: string;
  source: string;
}
export interface MapPoint {
  x: number;
  y: number;
  label: string;
}
export interface TMuMap {
  xDomain: [number, number];
  yDomain: [number, number];
  refLines: RefLine[];
  bands: Band[];
  point: MapPoint | null;
  line: MapPoint[];
}

const floorTo = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

export function tMuMap(
  point: { t: number; mu: number } | null,
  line: { t: number; mu: number; label: string }[] = [],
): TMuMap {
  const ts = [0.6, 1.2, ...(point ? [point.t] : []), ...line.map((p) => p.t)];
  const mus = [0.2, 0.9, ...(point ? [point.mu] : []), ...line.map((p) => p.mu)];
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    xDomain: [r(floorTo(Math.min(...ts), 0.1)), r(ceilTo(Math.max(...ts), 0.1))],
    yDomain: [r(floorTo(Math.min(...mus), 0.1)), r(ceilTo(Math.max(...mus), 0.1))],
    refLines: [
      { axis: 'y', value: MU_MIN, label: 'mu = sqrt(2) - 1 = 0.414', source: 'S-022' },
      { axis: 'y', value: MU_MAX, label: 'mu = sqrt(3) - 1 = 0.732', source: 'S-022' },
    ],
    bands: [
      {
        axis: 'x',
        lo: T_WINDOW.lo,
        hi: T_WINDOW.hi,
        label: `t from ${T_WINDOW.lo} to ${T_WINDOW.hi}: decision-tree bounds on 576 known ABX3 solids, 74 % accurate (S-003). A rule of thumb.`,
        source: 'S-003',
      },
    ],
    point: point ? { x: point.t, y: point.mu, label: 'This composition' } : null,
    line: line.map((p) => ({ x: p.t, y: p.mu, label: p.label })),
  };
}

export interface TauCurve {
  nA: number;
  points: { x: number; y: number }[];
}
export interface TauModel {
  curves: TauCurve[];
  threshold: number;
  xDomain: [number, number];
  yDomain: [number, number];
  /** null when rA/rB is not above 1 or tau is off the plotted scale; reason says which */
  point: { x: number; y: number } | null;
  pointNote: string;
}

/** tau against rA/rB for each nA at fixed rX/rB. x runs from 1.02 (tau diverges at 1) to 3.5. */
export function tauModel(
  rXoverRB: number,
  nAs: readonly number[],
  current: { rAoverRB: number; nA: number } | null,
): TauModel {
  const xs: number[] = [];
  for (let i = 0; i <= 124; i++) xs.push(Math.round((1.02 + i * 0.02) * 100) / 100);
  const curves = nAs.map((nA) => ({
    nA,
    points: xs.map((x) => {
      const r = bartelTau(x, 1, rXoverRB, nA);
      return { x, y: r.ok ? r.value : NaN };
    }),
  }));
  const yDomain: [number, number] = [0, 12];
  let point: TauModel['point'] = null;
  let pointNote = 'No composition yet.';
  if (current) {
    const r = bartelTau(current.rAoverRB, 1, rXoverRB, current.nA);
    if (!r.ok) pointNote = r.reason;
    else if (!(current.rAoverRB > 1))
      pointNote = 'rA/rB is not above 1, which is outside the plotted range; the A site looks swapped.';
    else if (r.value < yDomain[0] || r.value > yDomain[1])
      pointNote = `tau = ${r.value.toFixed(1)} is off the plotted scale (0 to ${yDomain[1]}).`;
    else {
      point = { x: current.rAoverRB, y: r.value };
      pointNote = `rA/rB = ${current.rAoverRB.toFixed(3)}, tau = ${r.value.toFixed(3)}.`;
    }
  }
  return { curves, threshold: BARTEL_THRESHOLD, xDomain: [1, 3.5], yDomain, point, pointNote };
}

export const FAMILY: readonly string[] = [
  'La',
  'Ce',
  'Pr',
  'Nd',
  'Pm',
  'Sm',
  'Eu',
  'Gd',
  'Tb',
  'Dy',
  'Ho',
  'Er',
  'Tm',
  'Yb',
  'Lu',
  'Y',
];

export type SweepRow =
  | {
      ok: true;
      label: string;
      x: number;
      cn: number | null;
      rA: number;
      t: number;
      mu: number;
      tau: number | null;
      tauReason?: string;
      chargeBalanceSum: number;
    }
  | { ok: false; label: string; x: number; cn: number | null; reason: string };

function row(label: string, x: number, cn: number | null, comp: Composition): SweepRow {
  const e = evaluateCompound(comp);
  if (!e.ok) return { ok: false, label, x, cn, reason: e.reason };
  return {
    ok: true,
    label,
    x,
    cn,
    rA: e.sites.A.radius,
    t: e.t,
    mu: e.mu,
    tau: e.tau.ok ? e.tau.value : null,
    ...(e.tau.ok ? {} : { tauReason: e.tau.reason }),
    chargeBalanceSum: e.chargeBalanceSum,
  };
}

/** Sweep the A site over La to Lu and Y (all as 3+) at the given policy. A missing Shannon row is a gap with a reason. */
export function familySweep(
  B: Occupant[],
  X: Occupant[],
  policy: Policy,
  elements: readonly string[] = FAMILY,
): SweepRow[] {
  return elements.map((el, i) => row(el, i, policy, { A: [{ el, ox: 3, cn: policy, fraction: 1 }], B, X }));
}

/** Sweep x from 0 to 1 for a site with two occupants: first at 1 - x, second at x. Empty when the site is not mixed. */
export function mixedSweep(comp: Composition, site: 'A' | 'B', steps = 10): SweepRow[] {
  const occ = comp[site];
  if (occ.length !== 2) return [];
  const [first, second] = occ as [Occupant, Occupant];
  const out: SweepRow[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const list: Occupant[] = [];
    if (i < steps) list.push({ ...first, fraction: (steps - i) / steps });
    if (i > 0) list.push({ ...second, fraction: i / steps });
    out.push(row(`x = ${x.toFixed(2)}`, x, null, { ...comp, [site]: list }));
  }
  return out;
}

const csvCell = (s: string | number | null): string => {
  const t = s === null ? '' : String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV of a sweep. A gap has empty numbers and the reason in the status column. */
export function sweepCsv(rows: readonly SweepRow[], xName: string): string {
  const head = [xName, 'cn', 'rA_angstrom', 't', 'mu', 'tau', 'status'];
  const body = rows.map((r) =>
    r.ok
      ? [r.label, r.cn, r.rA, r.t, r.mu, r.tau, r.tauReason ?? 'ok']
      : [r.label, r.cn, null, null, null, null, r.reason],
  );
  return [head, ...body].map((l) => l.map(csvCell).join(',')).join('\n') + '\n';
}
