// Checks and warnings for an ABX3 composition. Every factor is traceable to the Shannon entries (./shannon)
// and the formulas in ./factors; every rule of thumb carries `heuristic: true` and its source.
// @source S-002 (t), S-003 (tau, mu range, t window, radius conventions), S-022 (radius-ratio limit),
//   S-051 (oxidation-state frequencies, D-061). Open: Q-005 (t ranges), Q-016 (mixing convention).
import { classifyOxidation } from '../chem/oxidation';
import { bartelTau, goldschmidt, octahedral, type TauResult } from './factors';
import { ionLabel, type RadiusKind } from './shannon';
import { MIXING_CONVENTION, siteAverage, type Occupant, type SiteResult } from './sites';

export type SiteName = 'A' | 'B' | 'X';
export type CheckLevel = 'error' | 'warning' | 'info';
export interface Check {
  id:
    | 'missing-radius'
    | 'site-input'
    | 'charge-balance'
    | 'oxidation-rare'
    | 'oxidation-not-observed'
    | 'coordination-policy'
    | 'mixed-site'
    | 'sites-swapped'
    | 'tau-undefined'
    | 'mu-range'
    | 't-range';
  level: CheckLevel;
  message: string;
  heuristic: boolean;
  sources: string[];
  site?: SiteName;
  /** A suggested user action; never applied automatically. */
  action?: 'swap-a-b';
}
export interface PerovskiteInput {
  A: Occupant[];
  B: Occupant[];
  X: Occupant[];
  kind?: RadiusKind;
}
export interface Factors {
  rA: number;
  rB: number;
  rX: number;
  nA: number;
  t: number;
  mu: number;
  tau: TauResult;
}
export interface Evaluation {
  /** False when any radius is missing or a site is invalid; then `factors` is absent (never a guess). */
  ok: boolean;
  sites: Record<SiteName, SiteResult>;
  chargeSum?: number;
  factors?: Factors;
  checks: Check[];
}

/** Octahedral stability limits from the radius-ratio rule (S-022), also quoted by S-003. */
export const MU_MIN = Math.SQRT2 - 1;
export const MU_MAX = Math.sqrt(3) - 1;
/** Decision-tree window for t on S-003's 576 compounds (Fig. 2A). */
export const T_WINDOW_S003 = [0.825, 1.059] as const;
const CHARGE_TOL = 1e-9;

const fmt = (x: number, d = 3) => x.toFixed(d);

export function evaluatePerovskite(input: PerovskiteInput): Evaluation {
  const kind = input.kind ?? 'ionic';
  const sites = {
    A: siteAverage(input.A, kind),
    B: siteAverage(input.B, kind),
    X: siteAverage(input.X, kind),
  };
  const checks: Check[] = [];
  for (const s of ['A', 'B', 'X'] as const) {
    const r = sites[s];
    if (!r.ok)
      checks.push({
        id: r.reason === 'radius' ? 'missing-radius' : 'site-input',
        level: 'error',
        site: s,
        message: `${s} site: ${r.message}`,
        heuristic: false,
        sources: r.reason === 'radius' ? ['S-001'] : [],
      });
  }

  // oxidation-state frequency, per occupant (works even when a radius is missing)
  for (const s of ['A', 'B', 'X'] as const) {
    for (const o of input[s]) {
      const v = classifyOxidation(o.el, o.ox);
      if (v.class === 'common') continue;
      const ion = ionLabel(o.el, o.ox);
      checks.push(
        v.class === 'known-rare'
          ? {
              id: 'oxidation-rare',
              level: 'warning',
              site: s,
              message: `${ion} is a known but uncommon oxidation state (${v.count} ICSD entries, ${fmt(100 * (v.share ?? 0), 1)} % of ${o.el} entries with a non-zero state).`,
              heuristic: true,
              sources: ['S-051'],
            }
          : {
              id: 'oxidation-not-observed',
              level: 'warning',
              site: s,
              message: `${ion} does not appear in the ICSD 2024 oxidation-state counts.`,
              heuristic: true,
              sources: ['S-051'],
            },
      );
    }
  }

  // coordination policy (S-003 Methods: radius closest to CN 12 for A and CN 6 for B)
  const offA = input.A.filter((o) => o.cn !== 12);
  const offB = input.B.filter((o) => o.cn !== 6);
  if (offA.length || offB.length)
    checks.push({
      id: 'coordination-policy',
      level: 'info',
      message: `Bartel et al. take A radii at the coordination closest to 12 and B radii closest to 6; this input uses ${[
        ...offA.map((o) => `CN ${o.cn} for ${ionLabel(o.el, o.ox)} on A`),
        ...offB.map((o) => `CN ${o.cn} for ${ionLabel(o.el, o.ox)} on B`),
      ].join(', ')}.`,
      heuristic: false,
      sources: ['S-003'],
    });
  for (const s of ['A', 'B', 'X'] as const) {
    const r = sites[s];
    if (r.ok && r.mixed)
      checks.push({
        id: 'mixed-site',
        level: 'info',
        site: s,
        message: MIXING_CONVENTION,
        heuristic: true,
        sources: ['S-003'],
      });
  }

  const { A, B, X } = sites;
  if (!(A.ok && B.ok && X.ok)) return { ok: false, sites, checks };

  const chargeSum = A.ox + B.ox + 3 * X.ox;
  if (Math.abs(chargeSum) > CHARGE_TOL)
    checks.push({
      id: 'charge-balance',
      level: 'error',
      message: `Not charge balanced: nA + nB + 3 nX = ${fmt(chargeSum)} (should be 0).`,
      heuristic: false,
      sources: [],
    });

  const rA = A.radius,
    rB = B.radius,
    rX = X.radius;
  const t = goldschmidt(rA, rB, rX);
  const mu = octahedral(rB, rX);
  const tau = bartelTau(rA, rB, rX, A.ox);

  if (!tau.ok)
    checks.push({
      id: 'tau-undefined',
      level: 'warning',
      message: tau.message,
      heuristic: false,
      sources: ['S-003'],
    });
  if (rA < rB)
    checks.push({
      id: 'sites-swapped',
      level: 'warning',
      message: `The A cation (${fmt(rA)} A) is smaller than the B cation (${fmt(rB)} A). In ABX3 perovskites A is by definition the larger cation, so the sites look swapped. tau still evaluates, but its meaning assumes rA > rB. Swap A and B?`,
      heuristic: false,
      sources: ['S-003'],
      action: 'swap-a-b',
    });

  checks.push({
    id: 'mu-range',
    level: mu < MU_MIN || mu > MU_MAX ? 'warning' : 'info',
    message:
      mu < MU_MIN
        ? `Octahedral factor ${fmt(mu)} is below sqrt(2) - 1 = ${fmt(MU_MIN)}: B is too small for a stable BX6 octahedron by the radius-ratio rule.`
        : mu > MU_MAX
          ? `Octahedral factor ${fmt(mu)} is above sqrt(3) - 1 = ${fmt(MU_MAX)}: by the radius-ratio rule B would prefer a higher coordination than 6.`
          : `Octahedral factor ${fmt(mu)} lies between ${fmt(MU_MIN)} and ${fmt(MU_MAX)}, the range where BX6 octahedra are expected from geometry.`,
    heuristic: true,
    sources: ['S-022', 'S-003'],
  });

  const band =
    t > 1
      ? 'above about 1, which is a rule of thumb for hexagonal stacking rather than the corner-sharing perovskite'
      : t >= 0.8
        ? 'inside the typical perovskite range of about 0.8 to 1.0 (near 1 cubic, lower values tilted)'
        : 'below the typical perovskite range of about 0.8 to 1.0';
  checks.push({
    id: 't-range',
    level: t >= 0.8 && t <= 1 ? 'info' : 'warning',
    message: `Goldschmidt t = ${fmt(t)} is ${band}. These ranges are a rule of thumb (Q-005). For comparison, the window that best separated perovskites in Bartel et al.'s 576 compounds was ${T_WINDOW_S003[0]} < t < ${T_WINDOW_S003[1]}, and t alone was right for 74 % of them.`,
    heuristic: true,
    sources: ['S-002', 'S-003'],
  });

  return { ok: true, sites, chargeSum, factors: { rA, rB, rX, nA: A.ox, t, mu, tau }, checks };
}
