import { describe, it, expect } from 'vitest';
import ref from '../../../tests/reference/element_reference.json';
import { classifyOxidation, oxidationInfo, oxidationDataMeta } from './oxidation';

const shares = (el: string) =>
  (ref.elements as Record<string, { oxidation_share_icsd24: Record<string, number> }>)[el]!
    .oxidation_share_icsd24;

describe('oxidation classification (golden shares)', () => {
  it('Cu +2 and +1 common, +3 known-rare', () => {
    const s = shares('Cu');
    expect(oxidationInfo('Cu', 2).share).toBeCloseTo(s['2']!, 3);
    expect(oxidationInfo('Cu', 1).share).toBeCloseTo(s['1']!, 3);
    expect(oxidationInfo('Cu', 3).share).toBeCloseTo(s['3']!, 3);
    expect(classifyOxidation('Cu', 2)).toBe('common');
    expect(classifyOxidation('Cu', 1)).toBe('common');
    expect(classifyOxidation('Cu', 3)).toBe('known-rare');
  });
  it('Fe +3 and +2 common, +4 known-rare', () => {
    const s = shares('Fe');
    expect(oxidationInfo('Fe', 3).share).toBeCloseTo(s['3']!, 3);
    expect(classifyOxidation('Fe', 3)).toBe('common');
    expect(classifyOxidation('Fe', 2)).toBe('common');
    expect(classifyOxidation('Fe', 4)).toBe('known-rare');
  });
  it('every golden share agrees for all 30 reference elements', () => {
    for (const [el, v] of Object.entries(
      ref.elements as Record<string, { oxidation_share_icsd24: Record<string, number> }>,
    )) {
      for (const [ox, share] of Object.entries(v.oxidation_share_icsd24)) {
        expect(oxidationInfo(el, Number(ox)).share, `${el} ${ox}`).toBeCloseTo(share, 3);
      }
    }
  });
  it('no count means not-observed, also for unknown elements', () => {
    expect(classifyOxidation('Cu', 7)).toBe('not-observed');
    expect(classifyOxidation('Xx', 2)).toBe('not-observed');
    expect(oxidationDataMeta.elements).toBeGreaterThan(80);
  });
});
