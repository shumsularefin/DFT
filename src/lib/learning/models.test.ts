import { describe, expect, it } from 'vitest';
import { DEFAULT_BKT, isMastered, update } from './bkt';
import { pCorrect, updateElo } from './irt';
import { INITIAL_SM2, qualityFromOutcome, review, type Sm2State } from './sm2';

// Reference values hand-computed in planning (docs/milestones/M6-adaptive-engine.md, M6.2). @source S-037, S-038
describe('bkt', () => {
  it('matches the worked example', () => {
    expect(update(0.3, true)).toBeCloseTo(0.692683, 6);
    expect(update(0.3, false)).toBeCloseTo(0.145763, 6);
    expect(update(update(0.3, true), true)).toBeCloseTo(0.919231, 6);
  });
  it('rejects out-of-range input', () => {
    expect(() => update(1.2, true)).toThrow(RangeError);
    expect(() => update(0.3, true, { ...DEFAULT_BKT, pS: -0.1 })).toThrow(RangeError);
  });
  it('uses a 0.95 mastery threshold', () => {
    expect(isMastered(0.95)).toBe(true);
    expect(isMastered(0.949)).toBe(false);
  });
  it('stays in [0, 1] over long runs', () => {
    let p = 0.3;
    for (let i = 0; i < 200; i++) p = update(p, i % 3 !== 0);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('irt', () => {
  it('matches the worked example', () => {
    expect(pCorrect(0, 0)).toBe(0.5);
    const r = updateElo(0, 0, true);
    expect(r.theta).toBeCloseTo(0.2, 12);
    expect(r.b).toBeCloseTo(-0.025, 12);
  });
  it('moves the other way on a wrong answer', () => {
    const r = updateElo(0, 0, false);
    expect(r.theta).toBeCloseTo(-0.2, 12);
    expect(r.b).toBeCloseTo(0.025, 12);
  });
});

describe('sm2', () => {
  it('follows the seven-step sequence', () => {
    const expected: [number, number, number][] = [
      [1, 1, 2.6],
      [2, 6, 2.7],
      [3, 16, 2.8],
      [4, 45, 2.8],
      [5, 126, 2.66],
      [0, 1, 2.66],
      [1, 1, 2.76],
    ];
    let s: Sm2State = INITIAL_SM2;
    [5, 5, 5, 4, 3, 2, 5].forEach((q, i) => {
      s = review(s, q);
      expect([s.n, s.interval], `step ${i + 1}`).toEqual([expected[i]![0], expected[i]![1]]);
      expect(s.ef, `step ${i + 1}`).toBeCloseTo(expected[i]![2], 9);
    });
  });
  it('never lets EF fall below 1.3', () => {
    let s: Sm2State = INITIAL_SM2;
    for (let i = 0; i < 100; i++) s = review(s, 3);
    expect(s.ef).toBeCloseTo(1.3, 12);
  });
  it('rejects bad quality', () => {
    expect(() => review(INITIAL_SM2, 6)).toThrow(RangeError);
    expect(() => review(INITIAL_SM2, 2.5)).toThrow(RangeError);
  });
  it('maps outcomes to quality', () => {
    expect(qualityFromOutcome(true, 0)).toBe(5);
    expect(qualityFromOutcome(true, 1)).toBe(4);
    expect(qualityFromOutcome(true, 2)).toBe(3);
    expect(qualityFromOutcome(false, 0)).toBe(2);
    expect(qualityFromOutcome(false, 3, true)).toBe(1);
  });
});
