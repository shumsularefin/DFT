// Pure plot view-models, family sweeps, mixed-site sweeps, CSV export and hand-off builder for M8.4.
// @source S-001 (Shannon 1976), S-002 (Goldschmidt t), S-003 (Bartel tau), S-022 (octahedral radius-ratio limits).
import { evaluatePerovskite, MU_MAX, MU_MIN } from './checks';
import { bartelTau, TAU_THRESHOLD } from './factors';
import type { RadiusKind } from './shannon';
import type { Occupant } from './sites';
import { resolveLnCn, type LnCnPolicy } from './urlState';
import type { Handoff, SiteSpec } from '../handoff';

export const FAMILY_ELEMENTS = [
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
] as const;

export interface FamilySweepRow {
  readonly el: string;
  readonly cn: number;
  readonly ok: boolean;
  readonly rA?: number;
  readonly t?: number;
  readonly mu?: number;
  readonly tau?: number;
  readonly reason?: string;
}

/**
 * Sweep A over La..Lu + Y (ox = +3) for fixed B and X under the chosen CN policy (D-028).
 * Missing Shannon entries return ok: false with a reason and are never interpolated.
 */
export function familySweep(
  B: Occupant[],
  X: Occupant[],
  policy: LnCnPolicy,
  kind: RadiusKind = 'ionic',
): FamilySweepRow[] {
  return FAMILY_ELEMENTS.map((el) => {
    const cn = resolveLnCn(el, 3, policy);
    const ev = evaluatePerovskite({
      A: [{ el, ox: 3, cn, fraction: 1 }],
      B,
      X,
      kind,
    });
    if (!ev.ok || !ev.factors) {
      const msg = ev.sites.A.ok ? 'Missing B or X radius.' : ev.sites.A.message;
      return { el, cn, ok: false, reason: msg };
    }
    const row: FamilySweepRow = {
      el,
      cn,
      ok: true,
      rA: ev.factors.rA,
      t: ev.factors.t,
      mu: ev.factors.mu,
    };
    if (ev.factors.tau.ok) {
      return { ...row, tau: ev.factors.tau.value };
    }
    return row;
  });
}

export interface MixedSweepPoint {
  readonly x: number;
  readonly t: number;
  readonly mu: number;
  readonly tau?: number;
}

/** Sweep composition fraction x from 0 to 1 for a 2-occupant A or B site. */
export function mixedSiteSweep(
  A: Occupant[],
  B: Occupant[],
  X: Occupant[],
  site: 'A' | 'B',
  kind: RadiusKind = 'ionic',
  steps = 20,
): MixedSweepPoint[] {
  const target = site === 'A' ? A : B;
  if (target.length < 2) return [];
  const [o0, o1] = [target[0]!, target[1]!];
  const pts: MixedSweepPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const occs: Occupant[] =
      i === 0
        ? [{ ...o0, fraction: 1 }]
        : i === steps
          ? [{ ...o1, fraction: 1 }]
          : [
              { ...o0, fraction: 1 - x },
              { ...o1, fraction: x },
            ];
    const ev = evaluatePerovskite({
      A: site === 'A' ? occs : A,
      B: site === 'B' ? occs : B,
      X,
      kind,
    });
    if (ev.ok && ev.factors) {
      const pt: MixedSweepPoint = { x, t: ev.factors.t, mu: ev.factors.mu };
      pts.push(ev.factors.tau.ok ? { ...pt, tau: ev.factors.tau.value } : pt);
    }
  }
  return pts;
}

export interface TauCurveSeries {
  readonly nA: number;
  readonly points: readonly { readonly ratio: number; readonly tau: number }[];
}

/** Compute tau(rA/rB) curves for nA = 1, 2, 3 at a fixed rX/rB = 1/mu (S-003). */
export function tauCurves(rXOverRB: number): TauCurveSeries[] {
  const ratios: number[] = [];
  for (let r = 1.15; r <= 3.5; r += 0.05) ratios.push(Math.round(r * 100) / 100);
  return [1, 2, 3].map((nA) => {
    const points: { ratio: number; tau: number }[] = [];
    for (const ratio of ratios) {
      const res = bartelTau(ratio, 1, rXOverRB, nA);
      if (res.ok && Number.isFinite(res.value) && res.value > -5 && res.value < 15) {
        points.push({ ratio, tau: res.value });
      }
    }
    return { nA, points };
  });
}

export function sweepToCsv(rows: readonly FamilySweepRow[]): string {
  const header = 'element,cn,status,rA_angstrom,goldschmidt_t,octahedral_mu,bartel_tau,note';
  const lines = rows.map((r) =>
    [
      r.el,
      r.cn,
      r.ok ? 'ok' : 'missing',
      r.rA !== undefined ? r.rA.toFixed(4) : '',
      r.t !== undefined ? r.t.toFixed(4) : '',
      r.mu !== undefined ? r.mu.toFixed(4) : '',
      r.tau !== undefined ? r.tau.toFixed(4) : '',
      r.reason ? `"${r.reason.replace(/"/g, '""')}"` : '',
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

function toSiteSpec(occs: readonly Occupant[]): SiteSpec {
  return {
    occupants: occs.map((o) => ({
      symbol: o.el,
      oxidation: o.ox,
      cn: o.cn,
      ...(o.spin ? { spin: o.spin } : {}),
      fraction: o.fraction,
    })),
  };
}

/** Build a validated v1 composition hand-off payload (M3.1 contract). */
export function buildCompositionHandoff(
  A: readonly Occupant[],
  B: readonly Occupant[],
  X: readonly Occupant[],
  label?: string,
): Extract<Handoff, { kind: 'composition' }> {
  return {
    v: 1,
    kind: 'composition',
    from: 'tolerance-factor',
    a: toSiteSpec(A),
    b: toSiteSpec(B),
    x: toSiteSpec(X),
    ...(label ? { label } : {}),
  };
}

export const MAP_BOUNDS = {
  muMinLine: MU_MIN,
  muMaxLine: MU_MAX,
  tauThreshold: TAU_THRESHOLD,
} as const;
