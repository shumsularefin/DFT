import { describe, expect, it } from 'vitest';
import { BKT_DEFAULTS, isMastered, posterior, update } from './bkt';
import { difficultyFor, eloUpdate, pCorrect } from './irt';
import { EF_MIN, quality, review, SM2_START } from './sm2';

describe('BKT (S-037), worked example from the work order', () => {
  it('one correct answer', () => {
    expect(posterior(0.3, true)).toBeCloseTo(0.658537, 6);
    expect(update(0.3, true)).toBeCloseTo(0.692683, 6);
  });
  it('one wrong answer', () => {
    expect(posterior(0.3, false)).toBeCloseTo(0.050847, 6);
    expect(update(0.3, false)).toBeCloseTo(0.145763, 6);
  });
  it('two correct answers in a row', () => {
    const first = update(BKT_DEFAULTS.pL0, true);
    expect(first).toBeCloseTo(0.692683, 6);
    expect(posterior(first, true)).toBeCloseTo(0.910256, 6);
    expect(update(first, true)).toBeCloseTo(0.919231, 6);
  });
  it('mastery threshold 0.95', () => {
    expect(isMastered(0.95)).toBe(true);
    expect(isMastered(0.9499)).toBe(false);
  });
});

describe('Rasch / Elo', () => {
  it('worked example', () => {
    expect(pCorrect(0, 0)).toBe(0.5);
    const r = eloUpdate(0, 0, true);
    expect(r.theta).toBeCloseTo(0.2, 12);
    expect(r.b).toBeCloseTo(-0.025, 12);
  });
  it('difficultyFor inverts pCorrect', () => {
    for (const p of [0.55, 0.7, 0.85]) expect(pCorrect(0.3, difficultyFor(0.3, p))).toBeCloseTo(p, 12);
  });
});

describe('SM-2 (S-038)', () => {
  it('the seven-step sequence', () => {
    const expected = [
      [1, 1, 2.6],
      [2, 6, 2.7],
      [3, 16, 2.8],
      [4, 45, 2.8],
      [5, 126, 2.66],
      [0, 1, 2.66],
      [1, 1, 2.76],
    ];
    let s = SM2_START;
    [5, 5, 5, 4, 3, 2, 5].forEach((q, i) => {
      s = review(s, q);
      expect(s.n, `step ${i + 1}`).toBe(expected[i]![0]);
      expect(s.interval, `step ${i + 1}`).toBe(expected[i]![1]);
      expect(s.ef, `step ${i + 1}`).toBeCloseTo(expected[i]![2]!, 10);
    });
  });
  it('EF never falls below 1.3', () => {
    let s = SM2_START;
    for (let i = 0; i < 50; i++) {
      s = review(s, 3);
      expect(s.ef).toBeGreaterThanOrEqual(EF_MIN);
    }
    expect(s.ef).toBe(EF_MIN);
  });
  it('rejects qualities outside 0..5 and maps quiz outcomes', () => {
    expect(() => review(SM2_START, 6)).toThrow(RangeError);
    expect([
      quality(true, 0),
      quality(true, 1),
      quality(true, 3),
      quality(false, 0),
      quality(false, 0, true),
    ]).toEqual([5, 4, 3, 2, 1]);
  });
});
