/**
 * Evaluate an ABX3 composition: radii with their source entries, the three factors, and checks.
 * Every check carries `heuristic: true`; none is a proof of stability.
 * @source S-001, S-002, S-003, S-022, S-051
 */
import { classifyOxidation, oxidationInfo } from '../chem/oxidation';
import {
  BARTEL_THRESHOLD,
  bartelTau,
  goldschmidt,
  octahedral,
  siteOrderWarning,
  type TauResult,
} from './factors';
import { mixSite, type Occupant, type SiteResult } from './sites';

export type Severity = 'info' | 'warning' | 'error';

export interface Check {
  id: string;
  severity: Severity;
  heuristic: true;
  message: string;
  source?: string;
}

export interface Composition {
  A: Occupant[];
  B: Occupant[];
  X: Occupant[];
}

export type Evaluation =
  | {
      ok: false;
      reason: string;
      site: 'A' | 'B' | 'X';
      sites: Partial<Record<'A' | 'B' | 'X', SiteResult>>;
      checks: Check[];
    }
  | {
      ok: true;
      sites: Record<'A' | 'B' | 'X', Extract<SiteResult, { ok: true }>>;
      t: number;
      mu: number;
      tau: TauResult;
      chargeBalanceSum: number;
      checks: Check[];
    };

/** Heuristic ranges (Q-005): the octahedral limits are the radius-ratio limits, sqrt(2)-1 and sqrt(3)-1 (S-022). */
export const MU_MIN = Math.SQRT2 - 1;
export const MU_MAX = Math.sqrt(3) - 1;
export const T_TYPICAL_MIN = 0.8;
export const T_TYPICAL_MAX = 1.0;

const chk = (id: string, severity: Severity, message: string, source?: string): Check => ({
  id,
  severity,
  heuristic: true,
  message,
  ...(source ? { source } : {}),
});

const LN = new Set([
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
]);

export function evaluateCompound(c: Composition): Evaluation {
  const checks: Check[] = [];
  const sites: Partial<Record<'A' | 'B' | 'X', SiteResult>> = {};
  for (const key of ['A', 'B', 'X'] as const) {
    const s = mixSite(c[key]);
    sites[key] = s;
    if (!s.ok) {
      checks.push(chk(`missing-shannon-${key}`, 'error', `${key} site: ${s.reason}`, 'S-001'));
      if (key === 'A' && c.A.some((o) => LN.has(o.el) && o.cn === 12)) {
        checks.push(
          chk(
            'cn-policy',
            'info',
            'Shannon lists CN 12 for Ln3+ only for La, Ce, Nd and Sm. Choose an A-site coordination policy (CN 9 or CN 8); nothing is extrapolated.',
            'S-001',
          ),
        );
      }
      return { ok: false, reason: `${key} site: ${s.reason}`, site: key, sites, checks };
    }
  }
  const A = sites.A as Extract<SiteResult, { ok: true }>;
  const B = sites.B as Extract<SiteResult, { ok: true }>;
  const X = sites.X as Extract<SiteResult, { ok: true }>;

  const t = goldschmidt(A.radius, B.radius, X.radius);
  const mu = octahedral(B.radius, X.radius);
  const tau = bartelTau(A.radius, B.radius, X.radius, A.oxidation);
  const chargeBalanceSum = A.oxidation + B.oxidation + 3 * X.oxidation;

  if (Math.abs(chargeBalanceSum) > 1e-6) {
    checks.push(
      chk(
        'charge-balance',
        'error',
        `Charges do not balance: nA + nB + 3 nX = ${chargeBalanceSum.toFixed(3)} (should be 0).`,
      ),
    );
  }
  for (const key of ['A', 'B', 'X'] as const) {
    for (const o of c[key]) {
      const info = oxidationInfo(o.el, o.ox);
      if (info.class === 'known-rare') {
        checks.push(
          chk(
            `uncommon-oxidation-${o.el}${o.ox}`,
            'warning',
            `${o.el} with oxidation state ${o.ox} is rare in the ICSD counts (${(info.share * 100).toFixed(1)} % of ${o.el} entries).`,
            'S-051',
          ),
        );
      } else if (classifyOxidation(o.el, o.ox) === 'not-observed') {
        checks.push(
          chk(
            `unobserved-oxidation-${o.el}${o.ox}`,
            'warning',
            `${o.el} with oxidation state ${o.ox} has no entries in the ICSD counts used here.`,
            'S-051',
          ),
        );
      }
    }
  }
  const swap = siteOrderWarning(A.radius, B.radius);
  if (swap) checks.push(chk('site-order', 'warning', swap, 'S-003'));
  if (mu < MU_MIN || mu > MU_MAX) {
    checks.push(
      chk(
        'mu-range',
        'warning',
        `Octahedral factor ${mu.toFixed(3)} is outside the radius-ratio range ${MU_MIN.toFixed(3)} to ${MU_MAX.toFixed(3)} (rule of thumb).`,
        'S-022',
      ),
    );
  }
  if (t < T_TYPICAL_MIN) {
    checks.push(
      chk(
        't-low',
        'info',
        `Goldschmidt t = ${t.toFixed(3)} is below about ${T_TYPICAL_MIN}: a strongly tilted or non-perovskite structure is more likely (rule of thumb, Q-005).`,
        'S-002',
      ),
    );
  } else if (t > T_TYPICAL_MAX) {
    checks.push(
      chk(
        't-high',
        'info',
        `Goldschmidt t = ${t.toFixed(3)} is above about ${T_TYPICAL_MAX}: hexagonal stacking is favoured (rule of thumb, Q-005).`,
        'S-002',
      ),
    );
  }
  if (!tau.ok) {
    checks.push(chk('tau-undefined', 'info', tau.reason, 'S-003'));
  } else if (!tau.predictsPerovskite) {
    checks.push(
      chk(
        'tau-above',
        'info',
        `tau = ${tau.value.toFixed(2)} is not below ${BARTEL_THRESHOLD}: predicted non-perovskite (empirical threshold).`,
        'S-003',
      ),
    );
  }
  for (const key of ['A', 'B'] as const) {
    const s = sites[key] as Extract<SiteResult, { ok: true }>;
    if (c[key].length > 1) {
      checks.push(
        chk(
          `mixed-${key}`,
          'info',
          `${key} site mixes ${c[key].length} ions with the linear mixing convention (occupancy-weighted radius and oxidation state).`,
        ),
      );
    }
    if (!Number.isInteger(s.oxidation)) {
      checks.push(
        chk(
          `fractional-ox-${key}`,
          'info',
          `${key} site average oxidation state is ${s.oxidation.toFixed(2)}.`,
        ),
      );
    }
  }
  return { ok: true, sites: { A, B, X }, t, mu, tau, chargeBalanceSum, checks };
}
