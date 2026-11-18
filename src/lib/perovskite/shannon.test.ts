import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/perovskite_reference.json';
import {
  coordinationLabel,
  coordinations,
  getRadius,
  oxidationStates,
  SHANNON_ENTRIES,
  shannonMeta,
  spins,
  type Spin,
} from './shannon';

const SPIN: Record<string, Spin | undefined> = { '': undefined, 'High Spin': 'HS', 'Low Spin': 'LS' };

describe('Shannon dataset (S-001 via S-034)', () => {
  it('entry and element counts match _meta', () => {
    expect(SHANNON_ENTRIES.length).toBe(shannonMeta.entries);
    expect(new Set(SHANNON_ENTRIES.map((e) => e.el)).size).toBe(shannonMeta.elements);
  });

  it('keys are unique and every value is a finite radius in angstrom', () => {
    const keys = new Set(SHANNON_ENTRIES.map((e) => `${e.el}|${e.ox}|${e.cn}|${e.geometry}|${e.spin}`));
    expect(keys.size).toBe(SHANNON_ENTRIES.length);
    for (const e of SHANNON_ENTRIES) {
      expect(Number.isFinite(e.ionic) && Number.isFinite(e.crystal)).toBe(true);
      expect(e.cn).toBeGreaterThanOrEqual(1);
      expect(e.cn).toBeLessThanOrEqual(14);
    }
  });

  it('a spin-labelled group never also has an unlabelled entry (the lookup relies on it)', () => {
    const groups = new Map<string, (string | null)[]>();
    for (const e of SHANNON_ENTRIES) {
      const k = `${e.el}|${e.ox}|${e.cn}|${e.geometry}`;
      groups.set(k, [...(groups.get(k) ?? []), e.spin]);
    }
    for (const s of groups.values()) if (s.length > 1) expect(s).not.toContain(null);
  });

  it('the anomalous entries (no oxidation state upstream) are listed in _meta and never returned', () => {
    const odd = SHANNON_ENTRIES.filter((e) => e.ox === null);
    expect(odd.map((e) => ({ el: e.el, cn: e.cn }))).toEqual(
      shannonMeta.anomalies.map((a) => ({ el: a.el, cn: a.cn })),
    );
    for (const e of odd) {
      for (const ox of oxidationStates(e.el)) {
        const r = getRadius({ el: e.el, ox, cn: e.cn, kind: 'ionic' });
        if (r.ok) expect(r.entry.ox).toBe(ox);
      }
    }
  });
  it.todo(
    'Q-002: author decides whether the Eu CN VII entry is assigned Eu3+ (the Imperial College database says so)',
  );
});

describe('getRadius', () => {
  it('returns every anchor in perovskite_reference.json exactly, ionic and crystal', () => {
    expect(golden.anchor_radii.length).toBe(34);
    for (const a of golden.anchor_radii) {
      const q = { el: a.symbol, ox: a.oxidation, cn: a.cn, spin: SPIN[a.spin] };
      const ionic = getRadius({ ...q, kind: 'ionic' });
      const crystal = getRadius({ ...q, kind: 'crystal' });
      expect(ionic.ok && ionic.value, `${a.symbol}${a.oxidation} CN${a.cn} ${a.spin}`).toBe(a.ionic);
      expect(crystal.ok && crystal.value).toBe(a.crystal);
    }
  });

  it('Ln3+ and Y3+ coordinations equal ln3plus_shannon_cn_coverage (CN 12 only for La, Ce, Nd, Sm)', () => {
    for (const [el, labels] of Object.entries(golden.ln3plus_shannon_cn_coverage)) {
      expect(
        coordinations(el, 3).map((c) => coordinationLabel(c.cn, c.geometry)),
        el,
      ).toEqual(labels);
    }
    const twelve = Object.keys(golden.ln3plus_shannon_cn_coverage).filter((el) =>
      coordinations(el, 3).some((c) => c.cn === 12),
    );
    expect(twelve).toEqual(['La', 'Ce', 'Nd', 'Sm']);
  });

  it('Cu3+ CN 12 is not in the table: no entry, with the Cu3+ entries that exist', () => {
    const r = getRadius({ el: 'Cu', ox: 3, cn: 12, kind: 'ionic' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no entry');
    expect(r.available.length).toBeGreaterThan(0);
    expect(r.available.every((e) => e.el === 'Cu' && e.ox === 3)).toBe(true);
    expect(r.available.some((e) => e.cn === 12)).toBe(false);
  });

  it('Fe3+ CN 6 without a spin: spin required, both options offered', () => {
    const r = getRadius({ el: 'Fe', ox: 3, cn: 6, kind: 'ionic' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('spin required');
    expect(r.available.map((e) => e.spin).sort()).toEqual(['HS', 'LS']);
    expect(spins('Fe', 3, 6).sort()).toEqual(['HS', 'LS']);
  });

  it('never falls back to a nearby coordination or another oxidation state', () => {
    // Eu3+ has CN VI and VIII but no VII; the oxidation-less Eu VII entry must not be used
    const r = getRadius({ el: 'Eu', ox: 3, cn: 7, kind: 'ionic' });
    expect(r.ok).toBe(false);
    expect(getRadius({ el: 'Ti', ox: 5, cn: 6, kind: 'ionic' }).ok).toBe(false);
    const x = getRadius({ el: 'Xx', ox: 1, cn: 6, kind: 'ionic' });
    expect(!x.ok && x.reason).toBe('unknown element');
  });

  it('a spin that the table lists alone is used and explained; a missing one is refused', () => {
    const only = getRadius({ el: 'Cu', ox: 3, cn: 6, kind: 'ionic' });
    expect(only.ok && only.entry.spin).toBe('LS');
    expect(only.ok && only.note).toMatch(/Only the LS radius/);
    const hs = getRadius({ el: 'Cu', ox: 3, cn: 6, spin: 'HS', kind: 'ionic' });
    expect(!hs.ok && hs.reason).toBe('no entry');
  });

  it('a spin given where the table does not distinguish spin is explained, not an error', () => {
    const r = getRadius({ el: 'Ti', ox: 4, cn: 6, spin: 'HS', kind: 'ionic' });
    expect(r.ok && r.entry.spin).toBeNull();
    expect(r.ok && r.note).toMatch(/does not distinguish spin/);
  });

  it('geometry: square planar is chosen explicitly; a pyramidal-only CN needs the geometry', () => {
    const plain = getRadius({ el: 'Cu', ox: 2, cn: 4, kind: 'ionic' });
    expect(plain.ok && plain.entry.geometry).toBeNull();
    expect(plain.ok && plain.note).toMatch(/IVSQ/);
    const sq = getRadius({ el: 'Cu', ox: 2, cn: 4, geometry: 'SQ', kind: 'ionic' });
    expect(sq.ok && sq.entry.geometry).toBe('SQ');
    const pb = getRadius({ el: 'Pb', ox: 2, cn: 4, kind: 'ionic' });
    // Pb2+ CN 4 is listed only as IVPY
    expect(!pb.ok && pb.reason).toBe('geometry required');
    expect(getRadius({ el: 'Pb', ox: 2, cn: 4, geometry: 'PY', kind: 'ionic' }).ok).toBe(true);
    expect(getRadius({ el: 'Ti', ox: 4, cn: 4, geometry: 'SQ', kind: 'ionic' }).ok).toBe(false);
  });

  it('helpers report what the table lists', () => {
    expect(oxidationStates('O')).toEqual([-2]);
    expect(coordinationLabel(4, 'SQ')).toBe('IVSQ');
    expect(coordinationLabel(3, 'PY')).toBe('IIIPY');
    expect(coordinations('Sr', 2).map((c) => c.cn)).toContain(12);
  });
});
