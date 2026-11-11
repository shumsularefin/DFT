import { describe, it, expect } from 'vitest';
import ref from '../../../tests/reference/perovskite_reference.json';
import { bartelTau, goldschmidt, octahedral, siteOrderWarning, BARTEL_THRESHOLD } from './factors';
import { evaluateCompound, type Composition } from './checks';
import { mixSite } from './sites';
import { getRadius, type Spin } from './shannon';

const spinOf = (s: string): Spin | undefined =>
  s === 'High Spin' ? 'HS' : s === 'Low Spin' ? 'LS' : undefined;
type G = (typeof ref.compounds)[number]['A'];
const occ = (s: G, fraction = 1) => ({
  el: s.symbol,
  ox: s.oxidation,
  cn: s.cn,
  spin: spinOf(s.spin),
  fraction,
});

describe('16 golden compounds', () => {
  for (const c of ref.compounds) {
    it(c.formula, () => {
      const comp: Composition = { A: [occ(c.A)], B: [occ(c.B)], X: [occ(c.X)] };
      const e = evaluateCompound(comp);
      expect(e.ok).toBe(true);
      if (!e.ok) return;
      expect(e.sites.A.radius).toBeCloseTo(c.A.r_ionic, 9);
      expect(e.t).toBeCloseTo(c.t, 6);
      expect(e.mu).toBeCloseTo(c.mu, 6);
      expect(e.tau.ok && e.tau.value).toBeCloseTo(c.tau, 6);
      expect(e.tau.ok && e.tau.predictsPerovskite).toBe(c.tau_predicts_perovskite);
      expect(e.chargeBalanceSum).toBe(c.charge_balance_sum);
    });
  }
});

describe('RCuO3 family sweeps', () => {
  const sw = ref.rcuo3_family_sweep;
  for (const [policy, rows] of Object.entries(sw.policies)) {
    it(policy, () => {
      for (const r of rows) {
        const e = evaluateCompound({
          A: [{ el: r.R, ox: 3, cn: r.cn, fraction: 1 }],
          B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
          X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
        });
        if (r.rA === null) {
          expect(e.ok, `${r.R} ${policy}`).toBe(false);
          if (!e.ok) {
            expect(e.reason.length).toBeGreaterThan(10);
            expect('t' in e).toBe(false);
          }
        } else {
          expect(e.ok).toBe(true);
          if (!e.ok) continue;
          expect(e.sites.A.radius).toBeCloseTo(r.rA, 9);
          expect(e.t).toBeCloseTo(r.t as number, 6);
          expect(e.mu).toBeCloseTo(r.mu, 6);
          expect(e.tau.ok && e.tau.value).toBeCloseTo(r.tau as number, 6);
        }
      }
    });
  }
});

describe('mixed site', () => {
  it('Sr0.5Ba0.5TiO3 equals the factors from the averaged radius', () => {
    // Hand check: rA = (1.44 + 1.61) / 2 = 1.525; Ti4+ CN6 0.605; O2- 1.40; nA = 2.
    const e = evaluateCompound({
      A: [
        { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
        { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
      ],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.sites.A.radius).toBeCloseTo(1.525, 12);
    expect(e.t).toBeCloseTo(goldschmidt(1.525, 0.605, 1.4), 12);
    const tau = bartelTau(1.525, 0.605, 1.4, 2);
    expect(e.tau.ok && tau.ok && e.tau.value).toBeCloseTo(tau.ok ? tau.value : NaN, 12);
    expect(e.checks.some((c) => c.id === 'mixed-A')).toBe(true);
  });
  it('averages oxidation state and requires occupancies summing to 1', () => {
    const r = mixSite([
      { el: 'La', ox: 3, cn: 12, fraction: 0.5 },
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
    ]);
    expect(r.ok && r.oxidation).toBe(2.5);
    expect(mixSite([{ el: 'Sr', ox: 2, cn: 12, fraction: 0.5 }]).ok).toBe(false);
  });
  it('reports which occupant is missing', () => {
    const r = mixSite([
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
      { el: 'Cu', ox: 3, cn: 12, fraction: 0.5 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.occupant?.el).toBe('Cu');
  });
});

describe('factor edge cases', () => {
  it('tau is undefined when rA = rB', () => {
    const r = bartelTau(0.8, 0.8, 1.4, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('undefined');
  });
  it('rA < rB still evaluates with a swap warning, never swapped silently', () => {
    const r = bartelTau(0.6, 0.9, 1.4, 2);
    expect(r.ok && r.siteOrderWarning).toBe(true);
    expect(siteOrderWarning(0.6, 0.9)).toContain('swapped');
    expect(siteOrderWarning(0.9, 0.6)).toBeNull();
  });
  it('octahedral and threshold', () => {
    expect(octahedral(0.605, 1.4)).toBeCloseTo(0.432143, 6);
    expect(BARTEL_THRESHOLD).toBe(4.18);
  });
  it('charge imbalance and uncommon oxidation state are flagged', () => {
    const e = evaluateCompound({
      A: [{ el: 'Nd', ox: 3, cn: 9, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    expect(e.ok && e.checks.some((c) => c.id === 'uncommon-oxidation-Cu3')).toBe(true);
    const bad = evaluateCompound({
      A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 3, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    expect(bad.ok && bad.checks.some((c) => c.id === 'charge-balance')).toBe(true);
    expect(bad.ok && bad.checks.every((c) => c.heuristic)).toBe(true);
  });
  it('Ln at CN 12 missing adds the policy note', () => {
    const e = evaluateCompound({
      A: [{ el: 'Gd', ox: 3, cn: 12, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    expect(e.ok).toBe(false);
    expect(e.checks.some((c) => c.id === 'cn-policy')).toBe(true);
    expect(getRadius({ el: 'Gd', ox: 3, cn: 12, kind: 'ionic' }).ok).toBe(false);
  });
});
