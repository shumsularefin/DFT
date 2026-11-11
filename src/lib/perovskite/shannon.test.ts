import { describe, it, expect } from 'vitest';
import ref from '../../../tests/reference/perovskite_reference.json';
import { getRadius, oxidationStates, coordinations, spins, shannonMeta } from './shannon';
import data from '../../data/shannon-radii.json';

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIV: 14,
};

describe('Shannon anchors (golden)', () => {
  it('has 34 anchors', () => expect(ref.anchor_radii.length).toBe(34));
  for (const a of ref.anchor_radii) {
    it(`${a.symbol}${a.oxidation}+ CN ${a.cn}`, () => {
      const spin = a.spin === 'High Spin' ? 'HS' : a.spin === 'Low Spin' ? 'LS' : undefined;
      const i = getRadius({ el: a.symbol, ox: a.oxidation, cn: a.cn, spin, kind: 'ionic' });
      const c = getRadius({ el: a.symbol, ox: a.oxidation, cn: a.cn, spin, kind: 'crystal' });
      expect(i.ok && i.value).toBe(a.ionic);
      expect(c.ok && c.value).toBe(a.crystal);
    });
  }
});

describe('Ln3+ coverage', () => {
  for (const [el, cns] of Object.entries(ref.ln3plus_shannon_cn_coverage as Record<string, string[]>)) {
    it(el, () => expect(coordinations(el, 3)).toEqual(cns.map((r) => ROMAN[r])));
  }
  it('CN 12 only for La, Ce, Nd, Sm', () => {
    const has12 = Object.keys(ref.ln3plus_shannon_cn_coverage).filter((el) =>
      coordinations(el, 3).includes(12),
    );
    expect(has12.sort()).toEqual(['Ce', 'La', 'Nd', 'Sm']);
  });
});

describe('never guesses', () => {
  it('Cu3+ CN 12 is not ok and lists what exists', () => {
    const r = getRadius({ el: 'Cu', ox: 3, cn: 12, kind: 'ionic' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.available.length).toBeGreaterThan(0);
  });
  it('Fe3+ CN 6 needs a spin', () => {
    const r = getRadius({ el: 'Fe', ox: 3, cn: 6, kind: 'ionic' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('spin required');
      expect(r.available.map((e) => e.spin).sort()).toEqual(['HS', 'LS']);
    }
  });
  it('Fe3+ CN 6 with spin resolves', () => {
    expect(getRadius({ el: 'Fe', ox: 3, cn: 6, spin: 'LS', kind: 'ionic' }).ok).toBe(true);
  });
  it('Cu2+ CN 4 square planar needs no guess: plain entry if present, never nearest', () => {
    const r = getRadius({ el: 'Cu', ox: 2, cn: 4, geometry: 'SQ', kind: 'ionic' });
    expect(r.ok).toBe(true);
  });
  it('helpers', () => {
    expect(oxidationStates('Cu')).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(spins('Fe', 3, 6).sort()).toEqual(['HS', 'LS']);
  });
});

describe('totals', () => {
  it('match _meta', () => {
    expect(data.entries.length).toBe(shannonMeta.assignable);
    expect(shannonMeta.entries).toBe(shannonMeta.assignable + shannonMeta.unassigned.length);
    expect(new Set(data.entries.map((e) => e.el)).size).toBe(shannonMeta.elements);
  });
});
