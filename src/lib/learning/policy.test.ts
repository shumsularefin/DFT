import { describe, expect, it } from 'vitest';
import {
  ARMS,
  OVERDUE_DAYS,
  choose,
  delayedRetentionUpdate,
  newBandit,
  pickQuestion,
  reward,
  updateBandit,
  type PolicyContext,
} from './policy';
import { beta, gamma, mulberry32 } from './random';
import { compare } from './simulate';

// @source S-039, S-037
describe('random samplers', () => {
  it('Beta(2, 5) has the textbook mean and variance (seed 42, 200000 draws)', () => {
    const rng = mulberry32(42);
    const n = 200000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const x = beta(rng, 2, 5);
      sum += x;
      sq += x * x;
    }
    const mean = sum / n;
    const variance = sq / n - mean * mean;
    expect(Math.abs(mean - 2 / 7)).toBeLessThan(0.003);
    expect(Math.abs(variance / 0.02551020408 - 1)).toBeLessThan(0.05);
  });
  it('Gamma with shape below 1 has mean equal to the shape', () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 100000; i++) sum += gamma(rng, 0.5);
    expect(Math.abs(sum / 100000 - 0.5)).toBeLessThan(0.01);
  });
  it('same seed, same sequence; bad shape rejected', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(() => gamma(mulberry32(1), 0)).toThrow(RangeError);
  });
});

const q = (id: string, concept: string, b: number) => ({ id, concept, b });
function ctx(over: Partial<PolicyContext> = {}): PolicyContext {
  return {
    theta: 0,
    mastery: {},
    prerequisites: { a: [], b: ['a'] },
    candidates: [q('a1', 'a', -1), q('a2', 'a', 0), q('a3', 'a', 1)],
    dueReviews: [],
    consecutiveWrong: 0,
    hintAvailable: false,
    readyConcepts: ['a'],
    ...over,
  };
}

describe('policy', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const rng = mulberry32(5);
      return Array.from({ length: 20 }, () => choose(newBandit(), ctx(), rng).arm);
    };
    expect(run()).toEqual(run());
  });
  it('picks the item nearest the Rasch target difficulty b = theta - logit(p)', () => {
    // theta 0, p 0.85: b target -1.735 (nearest -1); p 0.7: -0.847 (nearest -1)
    expect(pickQuestion(ctx(), 0.85)!.id).toBe('a1');
    expect(pickQuestion(ctx(), 0.7)!.id).toBe('a1');
    // theta 1, p 0.55: b target 0.799 (nearest 1)
    expect(pickQuestion(ctx({ theta: 1 }), 0.55)!.id).toBe('a3');
  });
  it('overdue reviews older than 3 days come first', () => {
    const d = choose(
      newBandit(),
      ctx({ dueReviews: [{ id: 'r1', overdueDays: OVERDUE_DAYS + 1 }] }),
      mulberry32(1),
    );
    expect(d.arm).toBe('review-due');
    expect(d.guard).toBe('overdue-review');
    expect(d.questionId).toBe('r1');
    const e = choose(
      newBandit(),
      ctx({ dueReviews: [{ id: 'r1', overdueDays: OVERDUE_DAYS }] }),
      mulberry32(1),
    );
    expect(e.guard).toBeUndefined();
  });
  it('three wrong answers in a row give a hint, or an easier item when no hint is left', () => {
    const h = choose(newBandit(), ctx({ consecutiveWrong: 3, hintAvailable: true }), mulberry32(1));
    expect([h.arm, h.guard]).toEqual(['hint', 'wrong-streak']);
    const e = choose(newBandit(), ctx({ consecutiveWrong: 3 }), mulberry32(1));
    expect([e.arm, e.guard]).toEqual(['new-easy', 'wrong-streak']);
    expect(
      choose(newBandit(), ctx({ consecutiveWrong: 2, hintAvailable: false }), mulberry32(1)).guard,
    ).toBeUndefined();
  });
  it('avoids concepts whose prerequisites are all below 0.6, unless nothing else is eligible', () => {
    const c = ctx({ candidates: [q('a1', 'a', 0), q('b1', 'b', 0)], mastery: { a: 0.5 } });
    expect(pickQuestion(c, 0.7)!.id).toBe('a1');
    const only = ctx({ candidates: [q('b1', 'b', 0)], mastery: { a: 0.5 } });
    expect(pickQuestion(only, 0.7)!.id).toBe('b1');
    const ok = ctx({
      candidates: [q('b1', 'b', 0), q('a1', 'a', 0)],
      mastery: { a: 0.7 },
      readyConcepts: [],
    });
    expect(pickQuestion(ok, 0.7)!.id).toBe('b1'); // b is the least known concept (0.3 against 0.7)
  });
  it('only eligible arms are sampled', () => {
    const d = choose(newBandit(), ctx({ candidates: [], readyConcepts: [] }), mulberry32(1));
    expect(d.arm).toBeNull();
    const s = choose(newBandit(), ctx(), mulberry32(1));
    expect(Object.keys(s.samples!)).not.toContain('review-due');
    expect(Object.keys(s.samples!)).not.toContain('hint');
  });
  it('reward lies in [0, 1] and follows the formula', () => {
    expect(
      reward({ correct: true, hintsUsed: 0, maxHints: 2, speedScore: 1, retentionBonus: 1 }),
    ).toBeCloseTo(1, 12);
    expect(reward({ correct: false, hintsUsed: 2, maxHints: 2, speedScore: 0, retentionBonus: 0 })).toBe(0);
    expect(
      reward({ correct: true, hintsUsed: 1, maxHints: 2, speedScore: 0.5, retentionBonus: 0 }),
    ).toBeCloseTo(0.5 + 0.1 + 0.05, 12);
  });
  it('updates alpha += r, beta += 1 - r, and credits retention later', () => {
    const s = updateBandit(newBandit(), 'new-target', 0.75);
    expect(s['new-target']).toEqual({ alpha: 1.75, beta: 1.25 });
    expect(delayedRetentionUpdate(s, 'new-target', true)['new-target'].alpha).toBeCloseTo(1.95, 12);
    expect(delayedRetentionUpdate(s, 'new-target', false)['new-target'].beta).toBeCloseTo(1.45, 12);
    expect(() => updateBandit(newBandit(), 'hint', 1.5)).toThrow(RangeError);
    expect(ARMS).toHaveLength(6);
  });
});

describe('simulation (fixed seeds, 50 learners, 200 steps)', () => {
  it('the policy is at least as good as a random policy for every seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = compare(seed);
      expect(r.policy, `seed ${seed}`).toBeGreaterThanOrEqual(r.random);
    }
  }, 60000);
});
