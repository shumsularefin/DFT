import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/element_reference.json';
import {
  classifyOxidation,
  COMMON_SHARE,
  commonOxidationStates,
  oxidationMeta,
  oxidationShares,
} from './oxidation';

type El = { oxidation_share_icsd24: Record<string, number>; oxidation_counts_icsd24: Record<string, number> };
const els = golden.elements as Record<string, El>;
const share = (el: string, ox: number) => els[el]!.oxidation_share_icsd24[String(ox)]!;

describe('oxidation states (S-051, D-061)', () => {
  it('counts equal the golden SMACT counts for every reference element', () => {
    for (const [el, ref] of Object.entries(els)) {
      for (const [ox, n] of Object.entries(ref.oxidation_counts_icsd24)) {
        expect(classifyOxidation(el, Number(ox)).count, `${el} ${ox}`).toBe(n);
      }
    }
  });

  it('shares equal the golden shares (rounded to 4 places) for every reference element', () => {
    for (const [el, ref] of Object.entries(els)) {
      const mine = oxidationShares(el);
      expect(mine.length, el).toBe(Object.keys(ref.oxidation_share_icsd24).length);
      for (const r of mine) expect(r.share, `${el} ${r.ox}`).toBeCloseTo(share(el, r.ox), 4);
    }
  });

  it('Cu: +2 and +1 common, +3 known-rare (shares read from the file)', () => {
    expect(share('Cu', 2)).toBeGreaterThanOrEqual(COMMON_SHARE);
    expect(share('Cu', 1)).toBeGreaterThanOrEqual(COMMON_SHARE);
    expect(share('Cu', 3)).toBeLessThan(COMMON_SHARE);
    expect(classifyOxidation('Cu', 2).class).toBe('common');
    expect(classifyOxidation('Cu', 1).class).toBe('common');
    expect(classifyOxidation('Cu', 3).class).toBe('known-rare');
    expect(commonOxidationStates('Cu')).toEqual([2, 1]);
  });

  it('Fe: +3 and +2 common, +4 known-rare', () => {
    expect(classifyOxidation('Fe', 3).class).toBe('common');
    expect(classifyOxidation('Fe', 2).class).toBe('common');
    expect(classifyOxidation('Fe', 4).class).toBe('known-rare');
    expect(share('Fe', 4)).toBeLessThan(COMMON_SHARE);
  });

  it('a state with no count is not-observed; unknown elements say so', () => {
    expect(classifyOxidation('O', 6).class).toBe('not-observed');
    const x = classifyOxidation('Xx', 1);
    expect(x.class).toBe('not-observed');
    expect(x.known).toBe(false);
    expect(oxidationMeta.elements).toBeGreaterThan(90);
  });

  it('every classification follows the D-061 thresholds over the whole file', () => {
    for (const el of Object.keys(els)) {
      for (const r of oxidationShares(el)) {
        const c = classifyOxidation(el, r.ox).class;
        expect(c).toBe(r.share >= COMMON_SHARE ? 'common' : 'known-rare');
      }
    }
  });
});
