import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/perovskite_reference.json';
import { evaluatePerovskite, MU_MAX, MU_MIN, type Evaluation } from './checks';
import { bartelTau, goldschmidt, octahedral, TAU_STATUS, TAU_THRESHOLD } from './factors';
import type { Spin } from './shannon';
import { siteAverage, type Occupant } from './sites';

const SPIN: Record<string, Spin | undefined> = { '': undefined, 'High Spin': 'HS', 'Low Spin': 'LS' };
interface Ion {
  symbol: string;
  oxidation: number;
  cn: number;
  spin: string;
}
const occ = (i: Ion, fraction = 1): Occupant => {
  const o: Occupant = { el: i.symbol, ox: i.oxidation, cn: i.cn, fraction };
  const s = SPIN[i.spin];
  if (s) o.spin = s;
  return o;
};
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-6);
const factorsOf = (e: Evaluation) => {
  expect(e.ok).toBe(true);
  return e.factors!;
};

describe('tolerance factors (S-002, S-003)', () => {
  it('all 16 golden compounds: t, mu, tau within 1e-6, same prediction, charge sum 0', () => {
    expect(golden.compounds.length).toBe(16);
    for (const c of golden.compounds) {
      const e = evaluatePerovskite({ A: [occ(c.A)], B: [occ(c.B)], X: [occ(c.X)] });
      const f = factorsOf(e);
      expect(f.rA).toBe(c.A.r_ionic);
      expect(f.rB).toBe(c.B.r_ionic);
      expect(f.rX).toBe(c.X.r_ionic);
      near(f.t, c.t);
      near(f.mu, c.mu);
      expect(f.tau.ok).toBe(true);
      if (!f.tau.ok) continue;
      near(f.tau.value, c.tau);
      expect(f.tau.predictsPerovskite, c.formula).toBe(c.tau_predicts_perovskite);
      expect(e.chargeSum).toBe(c.charge_balance_sum);
      expect(e.checks.some((k) => k.id === 'charge-balance')).toBe(false);
    }
  });

  it('RCuO3 sweeps: every row within 1e-6; missing CN 12 rows give ok: false with the reason, never a number', () => {
    const sw = golden.rcuo3_family_sweep;
    const B: Occupant = { el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 };
    const X: Occupant = { el: 'O', ox: -2, cn: 6, fraction: 1 };
    let missing = 0;
    for (const rows of Object.values(sw.policies)) {
      for (const row of rows) {
        const e = evaluatePerovskite({ A: [{ el: row.R, ox: 3, cn: row.cn, fraction: 1 }], B: [B], X: [X] });
        if (row.rA === null) {
          missing++;
          expect(e.ok, row.R).toBe(false);
          expect(e.factors).toBeUndefined();
          const err = e.checks.find((k) => k.id === 'missing-radius');
          expect(err?.site).toBe('A');
          expect(err?.message).toMatch(/no entry for CN XII/);
          continue;
        }
        const f = factorsOf(e);
        expect(f.rA).toBe(row.rA);
        near(f.t, row.t!);
        near(f.mu, row.mu);
        expect(f.tau.ok && Math.abs(f.tau.value - row.tau!) <= 1e-6).toBe(true);
      }
    }
    expect(missing).toBe(11); // 15 lanthanides, CN 12 only for La, Ce, Nd, Sm
  });

  it('tau is undefined at rA = rB: no number, a reason', () => {
    const r = bartelTau(1, 1, 1.4, 2);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('rA equals rB');
  });

  it('rA < rB evaluates but flags the swap, and nothing is swapped silently', () => {
    const r = bartelTau(0.6, 1.44, 1.4, 4);
    expect(r.ok && r.sitesLookSwapped).toBe(true);
    const e = evaluatePerovskite({
      A: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      B: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    const swap = e.checks.find((k) => k.id === 'sites-swapped');
    expect(swap?.action).toBe('swap-a-b');
    expect(e.factors?.rA).toBe(0.605);
  });

  it('formula status and threshold', () => {
    expect(TAU_THRESHOLD).toBe(4.18);
    expect(TAU_STATUS.confirmed).toBe(true);
    expect(TAU_STATUS.checkedAgainst).toMatch(/1801\.07700v2/);
    // hand values: t for rA = rX = 1, rB = 1 is 2 / (2 sqrt 2) = 1/sqrt 2
    expect(goldschmidt(1, 1, 1)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(octahedral(0.6, 1.4)).toBeCloseTo(0.6 / 1.4, 12);
  });
});

describe('mixed sites (Q-016, D-062)', () => {
  const B: Occupant = { el: 'Ti', ox: 4, cn: 6, fraction: 1 };
  const X: Occupant = { el: 'O', ox: -2, cn: 6, fraction: 1 };

  it('Sr0.5Ba0.5TiO3 equals the factors from the averaged radius (1.44 + 1.61) / 2 = 1.525 with nA = 2', () => {
    const e = evaluatePerovskite({
      A: [
        { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
        { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
      ],
      B: [B],
      X: [X],
    });
    const f = factorsOf(e);
    // hand-computed: rA = 1.525, rB = 0.605, rX = 1.40
    expect(f.rA).toBeCloseTo(1.525, 12);
    expect(f.nA).toBe(2);
    expect(f.t).toBeCloseTo(goldschmidt(1.525, 0.605, 1.4), 12);
    const tau = bartelTau(1.525, 0.605, 1.4, 2);
    expect(f.tau.ok && tau.ok && Math.abs(f.tau.value - tau.value) < 1e-12).toBe(true);
    expect(
      e.checks.some(
        (k) => k.id === 'mixed-site' && k.site === 'A' && /Linear mixing convention/.test(k.message),
      ),
    ).toBe(true);
  });

  it('weights radius and oxidation state by occupancy; La0.7Sr0.3MnO3-style averages', () => {
    const s = siteAverage([
      { el: 'La', ox: 3, cn: 12, fraction: 0.7 },
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.3 },
    ]);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.radius).toBeCloseTo(0.7 * 1.36 + 0.3 * 1.44, 12);
    expect(s.ox).toBeCloseTo(2.7, 12);
  });

  it('occupancies must sum to 1, be in (0, 1], and every occupant needs its own radius', () => {
    const bad = siteAverage([
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
      { el: 'Ba', ox: 2, cn: 12, fraction: 0.4 },
    ]);
    expect(!bad.ok && bad.reason).toBe('occupancy sum');
    expect(!siteAverage([{ el: 'Sr', ox: 2, cn: 12, fraction: 0 }]).ok).toBe(true);
    expect(!siteAverage([]).ok).toBe(true);
    const spin = siteAverage([
      { el: 'Fe', ox: 3, cn: 6, fraction: 0.5 },
      { el: 'Ti', ox: 4, cn: 6, fraction: 0.5 },
    ]);
    expect(!spin.ok && spin.reason).toBe('radius');
    expect(!spin.ok && spin.lookup?.reason).toBe('spin required');
  });
});

describe('checks', () => {
  const X: Occupant = { el: 'O', ox: -2, cn: 6, fraction: 1 };
  it('charge imbalance is an error; uncommon and unobserved oxidation states are heuristic warnings', () => {
    const e = evaluatePerovskite({
      A: [{ el: 'La', ox: 3, cn: 12, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [X],
    });
    expect(e.checks.find((k) => k.id === 'oxidation-rare')?.message).toMatch(/Cu3\+/);
    const off = evaluatePerovskite({
      A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 3, cn: 6, fraction: 1 }],
      X: [X],
    });
    const cb = off.checks.find((k) => k.id === 'charge-balance');
    expect(cb?.level).toBe('error');
    expect(off.chargeSum).toBe(-1);
  });

  it('every rule-of-thumb result carries heuristic: true and a source', () => {
    const e = evaluatePerovskite({
      A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [X],
    });
    for (const id of ['mu-range', 't-range'] as const) {
      const k = e.checks.find((c) => c.id === id)!;
      expect(k.heuristic).toBe(true);
      expect(k.sources.length).toBeGreaterThan(0);
    }
    expect(e.checks.find((c) => c.id === 't-range')?.message).toMatch(/rule of thumb/);
    expect(MU_MIN).toBeCloseTo(0.414, 3);
    expect(MU_MAX).toBeCloseTo(0.732, 3);
  });

  it('octahedral factor outside the radius-ratio range warns; a CN other than 12 on A is noted', () => {
    // Nd3+ CN 9 on A with Cu3+ LS: mu = 0.54 / 1.40 = 0.386, below 0.414; A CN 9 differs from S-003's convention
    const e = evaluatePerovskite({
      A: [{ el: 'Nd', ox: 3, cn: 9, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [X],
    });
    expect(e.checks.find((k) => k.id === 'coordination-policy')?.message).toMatch(/CN 9 for Nd3\+ on A/);
    expect(e.checks.find((k) => k.id === 'mu-range')?.level).toBe('warning');
    const sto = evaluatePerovskite({
      A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [X],
    });
    expect(sto.checks.find((k) => k.id === 'mu-range')?.level).toBe('info'); // 0.605 / 1.40 = 0.432
    expect(sto.checks.some((k) => k.id === 'coordination-policy')).toBe(false);
    const small = evaluatePerovskite({
      A: [{ el: 'Na', ox: 1, cn: 12, fraction: 1 }],
      B: [{ el: 'Be', ox: 2, cn: 6, fraction: 1 }],
      X: [{ el: 'Cl', ox: -1, cn: 6, fraction: 1 }],
    });
    expect(small.checks.find((k) => k.id === 'mu-range')?.level).toBe('warning');
  });
});
