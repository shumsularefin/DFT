import { describe, expect, it } from 'vitest';
import {
  METHODS,
  SIZE_MAX,
  SIZE_MIN,
  doublingFactor,
  log10RelativeCost,
  methodById,
  sizeFromSlider,
} from './scaling';

const sizes = Array.from({ length: 201 }, (_, i) => SIZE_MIN + ((SIZE_MAX - SIZE_MIN) * i) / 200);

describe('scaling curves', () => {
  it('start at relative cost 1 (log 0) for every method', () => {
    for (const m of METHODS) expect(log10RelativeCost(m.id, SIZE_MIN)).toBe(0);
  });

  it('never return NaN or infinity across the slider range', () => {
    for (let v = 0; v <= 2.0001; v += 0.05)
      for (const m of METHODS) expect(Number.isFinite(log10RelativeCost(m.id, sizeFromSlider(v)))).toBe(true);
    for (const m of METHODS) {
      expect(Number.isFinite(log10RelativeCost(m.id, 0))).toBe(true);
      expect(Number.isFinite(log10RelativeCost(m.id, NaN))).toBe(true);
    }
  });

  it('increase strictly with size', () => {
    for (const m of METHODS)
      for (let i = 1; i < sizes.length; i++)
        expect(log10RelativeCost(m.id, sizes[i]!)).toBeGreaterThan(log10RelativeCost(m.id, sizes[i - 1]!));
  });

  it('give the stated formal exponents (source S-048, S-049)', () => {
    const expected = { dft: 3, hf: 4, mp2: 5, ccsd: 6, ccsdt: 7 } as const;
    for (const [id, p] of Object.entries(expected)) {
      expect(methodById(id as keyof typeof expected).exponent).toBe(p);
      // ten times the size costs 10^p times as much
      expect(log10RelativeCost(id as keyof typeof expected, 10)).toBeCloseTo(p, 12);
      expect(doublingFactor(id as keyof typeof expected)).toBe(2 ** p);
    }
  });

  it('order the formal methods by exponent for any size above 1', () => {
    const formal = METHODS.filter((m) => m.kind === 'formal');
    for (const s of [1.5, 10, 100])
      for (let i = 1; i < formal.length; i++)
        expect(log10RelativeCost(formal[i]!.id, s)).toBeGreaterThan(log10RelativeCost(formal[i - 1]!.id, s));
  });

  it('claims no number for qualitative curves', () => {
    for (const m of METHODS.filter((x) => x.kind === 'qualitative')) {
      expect(m.exponent).toBeNull();
      expect(doublingFactor(m.id)).toBeNull();
    }
  });

  it('every formal method names a register source', () => {
    for (const m of METHODS.filter((x) => x.kind === 'formal')) expect(m.sources.length).toBeGreaterThan(0);
  });

  it('maps the slider ends to the size range', () => {
    expect(sizeFromSlider(0)).toBe(SIZE_MIN);
    expect(sizeFromSlider(2)).toBeCloseTo(SIZE_MAX, 9);
  });
});
