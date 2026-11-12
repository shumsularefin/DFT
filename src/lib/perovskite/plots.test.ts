import { describe, it, expect } from 'vitest';
import ref from '../../../tests/reference/perovskite_reference.json';
import { FAMILY, T_WINDOW, familySweep, mixedSweep, sweepCsv, tMuMap, tauModel } from './plots';
import { evaluateCompound } from './checks';
import { bartelTau } from './factors';
import { TARGETS, chemicalSystem, compositionHandoff } from './handoff';
import { HANDOFF_KEY, takeHandoff, validateHandoff, type KV } from '../handoff';
import { DEFAULT_COMPOSITION } from './defaults';
import type { Policy } from './urlState';

const B = [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS' as const, fraction: 1 }];
const X = [{ el: 'O', ox: -2, cn: 6, fraction: 1 }];
const POLICIES: Record<string, Policy> = { CN12_only_missing_is_null: 12, CN9_all: 9, CN8_all: 8 };

describe('family sweep equals the golden RCuO3 sweeps', () => {
  for (const [name, rows] of Object.entries(ref.rcuo3_family_sweep.policies)) {
    it(name, () => {
      const sweep = familySweep(
        B,
        X,
        POLICIES[name]!,
        rows.map((r) => r.R),
      );
      expect(sweep).toHaveLength(rows.length);
      rows.forEach((g, i) => {
        const r = sweep[i]!;
        expect(r.label).toBe(g.R);
        if (g.t === null) {
          expect(r.ok, `${g.R} is a gap`).toBe(false);
          if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
        } else {
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.rA).toBeCloseTo(g.rA as number, 9);
          expect(r.t).toBeCloseTo(g.t, 6);
          expect(r.mu).toBeCloseTo(g.mu, 6);
          expect(r.tau).toBeCloseTo(g.tau as number, 6);
        }
      });
    });
  }
  it('the default list is La to Lu plus Y and has gaps exactly where Shannon has no CN 12', () => {
    expect(FAMILY).toHaveLength(16);
    const gaps = familySweep(B, X, 12)
      .filter((r) => !r.ok)
      .map((r) => r.label);
    expect(gaps).toEqual(['Pr', 'Pm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Y']);
  });
});

describe('mixed sweep', () => {
  const comp = {
    A: [
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
      { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
    ],
    B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
    X,
  };
  const rows = mixedSweep(comp, 'A', 10);
  it('runs from the pure first to the pure second occupant', () => {
    expect(rows).toHaveLength(11);
    const pure = evaluateCompound({ ...comp, A: [{ ...comp.A[0]!, fraction: 1 }] });
    expect(rows[0]!.ok && pure.ok && rows[0]!.t).toBeCloseTo(pure.ok ? pure.t : NaN, 12);
    const mid = rows[5]!;
    expect(mid.ok && mid.rA).toBeCloseTo(1.525, 12);
  });
  it('is empty when the site is not mixed', () => {
    expect(mixedSweep(DEFAULT_COMPOSITION, 'A')).toEqual([]);
  });
});

describe('t-mu map', () => {
  it('has the point at the computed factors and the octahedral lines at sqrt(2)-1 and sqrt(3)-1', () => {
    const e = evaluateCompound(DEFAULT_COMPOSITION);
    if (!e.ok) throw new Error('default composition failed');
    const m = tMuMap({ t: e.t, mu: e.mu });
    expect(m.point).toEqual({ x: e.t, y: e.mu, label: 'This composition' });
    expect(m.refLines.map((l) => l.value)).toEqual([Math.SQRT2 - 1, Math.sqrt(3) - 1]);
    expect(m.refLines[0]!.value).toBeCloseTo(0.414, 3);
    expect(m.refLines[1]!.value).toBeCloseTo(0.732, 3);
    expect(m.bands[0]).toMatchObject({ lo: T_WINDOW.lo, hi: T_WINDOW.hi, source: 'S-003' });
  });
  it('widens the axes to keep far points visible', () => {
    const m = tMuMap({ t: 1.5, mu: 0.1 });
    expect(m.xDomain[1]).toBeGreaterThanOrEqual(1.5);
    expect(m.yDomain[0]).toBeLessThanOrEqual(0.1);
  });
});

describe('tau view', () => {
  it('curves equal bartelTau and the point matches the composition', () => {
    const m = tauModel(2.314, [1, 2, 3], { rAoverRB: 2.38, nA: 2 });
    expect(m.curves).toHaveLength(3);
    const p = m.curves[1]!.points.find((q) => q.x === 2.38) ?? m.curves[1]!.points[68]!;
    const r = bartelTau(p.x, 1, 2.314, 2);
    expect(r.ok && p.y).toBeCloseTo(r.ok ? r.value : NaN, 12);
    expect(m.point?.y).toBeCloseTo(3.8, 1);
    expect(m.threshold).toBe(4.18);
  });
  it('says why a point is missing', () => {
    expect(tauModel(2, [2], { rAoverRB: 1, nA: 2 }).pointNote).toContain('undefined');
    expect(tauModel(2, [2], { rAoverRB: 0.8, nA: 2 }).point).toBeNull();
  });
});

describe('CSV', () => {
  it('writes gaps with the reason and no number', () => {
    const csv = sweepCsv(familySweep(B, X, 12, ['La', 'Pr']), 'A element');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('A element,cn,rA_angstrom,t,mu,tau,status');
    expect(lines[1]!.startsWith('La,12,1.36,1.0059')).toBe(true);
    expect(lines[2]!).toMatch(/^Pr,12,,,,,"?.*coordination 12/);
  });
});

describe('hand-off', () => {
  it('builds a payload the validator accepts and the receiver can take once', () => {
    const h = compositionHandoff(DEFAULT_COMPOSITION, 'SrTiO3');
    expect(validateHandoff(JSON.parse(JSON.stringify(h)))).not.toBeNull();
    const mem = new Map<string, string>();
    const kv: KV = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
    kv.setItem(HANDOFF_KEY, JSON.stringify(h));
    expect(takeHandoff(['composition'], kv)).toEqual(h);
    expect(takeHandoff(['composition'], kv)).toBeNull();
  });
  it('rejects a payload with a bad occupancy', () => {
    const h = JSON.parse(JSON.stringify(compositionHandoff(DEFAULT_COMPOSITION)));
    h.a.occupants[0].fraction = 2;
    expect(validateHandoff(h)).toBeNull();
  });
  it('names the chemical system and lists the unbuilt targets honestly', () => {
    expect(chemicalSystem(DEFAULT_COMPOSITION)).toBe('Sr-Ti-O');
    expect(TARGETS.every((t) => t.built === false)).toBe(true);
  });
});
