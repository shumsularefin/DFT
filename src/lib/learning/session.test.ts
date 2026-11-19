import { describe, expect, it } from 'vitest';
import { DEFAULT_BKT, MASTERY_PL, update } from './bkt';
import { updateElo } from './irt';
import { choose, newBandit } from './policy';
import { mulberry32 } from './random';
import { qualityFromOutcome, review, INITIAL_SM2 } from './sm2';
import { emptyState } from './state';
import {
  buildContext,
  dayNumber,
  dueCount,
  newMeta,
  recordAnswer,
  stateOf,
  topicMastered,
  type BankQuestion,
} from './session';
import type { Concept } from './graph';

const T0 = Date.UTC(2026, 5, 10, 12, 0, 0);
const DAY = 86_400_000;
const q1: BankQuestion = { id: 'q1', concepts: ['a'], difficulty: 0.5, hints: ['h1', 'h2'] };
const q2: BankQuestion = { id: 'q2', concepts: ['b'], difficulty: 0, hints: [] };
const concept = (id: string, prerequisites: string[] = []): Concept => ({
  id,
  label: id,
  module: 1,
  summary: 's',
  prerequisites,
  level: 'beginner',
  status: 'published',
});

describe('dayNumber', () => {
  it('counts local days using the given offset', () => {
    expect(dayNumber(Date.UTC(2026, 0, 1, 0, 30), 0)).toBe(dayNumber(Date.UTC(2026, 0, 1, 23, 0), 0));
    // 00:30 UTC is still the previous local day in a zone 60 minutes behind UTC
    expect(dayNumber(Date.UTC(2026, 0, 1, 0, 30), 60)).toBe(dayNumber(Date.UTC(2026, 0, 1, 0, 30), 0) - 1);
  });
});

describe('recordAnswer', () => {
  it('moves BKT, the Rasch pair and the SM-2 schedule exactly as the models do', () => {
    const r = recordAnswer(emptyState(), newMeta(), q1, { correct: true, hintsUsed: 0, nowMs: T0 });
    expect(r.learner.concepts['a']?.pL).toBe(update(DEFAULT_BKT.pL0, true, DEFAULT_BKT));
    expect(r.learner.concepts['a']?.attempts).toBe(1);
    const elo = updateElo(0, 0.5, true);
    expect(r.learner.questions['q1']?.b).toBe(elo.b);
    expect(r.learner.concepts['a']?.theta).toBeCloseTo(elo.theta, 12);
    const sm = review(INITIAL_SM2, qualityFromOutcome(true, 0));
    expect(r.learner.questions['q1']).toMatchObject({ n: sm.n, interval: sm.interval, ef: sm.ef });
    expect(r.learner.questions['q1']?.due).toBe(dayNumber(T0) + sm.interval);
  });

  it('does not mutate its input and updates every listed concept', () => {
    const s0 = emptyState();
    const q: BankQuestion = { id: 'qq', concepts: ['a', 'b'], difficulty: 0, hints: [] };
    const r = recordAnswer(s0, newMeta(), q, { correct: false, hintsUsed: 0, nowMs: T0 });
    expect(s0.concepts).toEqual({});
    expect(Object.keys(r.learner.concepts).sort()).toEqual(['a', 'b']);
    expect(r.meta.wrongStreak).toBe(1);
  });

  it('"I am not sure" is a wrong answer with SM-2 quality 1, due tomorrow', () => {
    const r = recordAnswer(emptyState(), newMeta(), q1, {
      correct: false,
      hintsUsed: 0,
      gaveUp: true,
      nowMs: T0,
    });
    expect(r.learner.questions['q1']?.interval).toBe(1);
    expect(r.learner.questions['q1']?.n).toBe(0);
  });

  it('feeds the bandit only when an arm is given, and credits retention on a due review', () => {
    const a = recordAnswer(emptyState(), newMeta(), q1, { correct: true, hintsUsed: 0, nowMs: T0 });
    expect(a.meta.bandit).toEqual(newBandit());
    const b = recordAnswer(a.learner, a.meta, q1, {
      correct: true,
      hintsUsed: 0,
      nowMs: T0,
      arm: 'new-target',
    });
    expect(b.meta.bandit['new-target'].alpha).toBeGreaterThan(1);
    expect(b.meta.origin['q1']).toBe('new-target');
    // a week later the question is due (second correct answer gives a 6 day interval); the review credits the arm that first showed it
    const c = recordAnswer(b.learner, b.meta, q1, {
      correct: true,
      hintsUsed: 0,
      nowMs: T0 + 7 * DAY,
      arm: 'review-due',
    });
    expect(c.meta.bandit['new-target'].alpha).toBeGreaterThan(b.meta.bandit['new-target'].alpha);
  });
});

describe('mastery states and topic completion', () => {
  it('is new, then learning, then mastered at the BKT threshold', () => {
    let s = emptyState();
    expect(stateOf(s, 'a')).toBe('new');
    let meta = newMeta();
    let n = 0;
    while (stateOf(s, 'a') !== 'mastered' && n < 50) {
      const r = recordAnswer(s, meta, q1, { correct: true, hintsUsed: 0, nowMs: T0 + n });
      s = r.learner;
      meta = r.meta;
      n += 1;
      if (n === 1) expect(stateOf(s, 'a')).toBe('learning');
    }
    expect(s.concepts['a']!.pL).toBeGreaterThanOrEqual(MASTERY_PL);
    expect(topicMastered(s, ['a'])).toBe(true);
    expect(topicMastered(s, ['a', 'b'])).toBe(false);
    expect(topicMastered(s, [])).toBe(false);
  });
});

describe('buildContext and due counting', () => {
  const concepts = [concept('a'), concept('b', ['a'])];
  const bank = [q1, q2];
  it('offers unseen questions and reports due reviews', () => {
    const ctx0 = buildContext({
      learner: emptyState(),
      meta: newMeta(),
      bank,
      concepts,
      nowMs: T0,
      hintAvailable: false,
    });
    expect(ctx0.candidates.map((c) => c.id)).toEqual(['q1', 'q2']);
    expect(ctx0.dueReviews).toEqual([]);
    expect(ctx0.readyConcepts).toEqual(['a']);
    const r = recordAnswer(emptyState(), newMeta(), q1, { correct: true, hintsUsed: 0, nowMs: T0 });
    const later = T0 + 2 * DAY;
    const ctx1 = buildContext({
      learner: r.learner,
      meta: r.meta,
      bank,
      concepts,
      nowMs: later,
      hintAvailable: false,
    });
    expect(ctx1.candidates.map((c) => c.id)).toEqual(['q2']);
    expect(ctx1.dueReviews.map((d) => d.id)).toEqual(['q1']);
    expect(dueCount(r.learner, bank, later)).toBe(1);
    expect(dueCount(r.learner, bank, T0)).toBe(0);
  });

  it('is deterministic with a fixed seed and picks something', () => {
    const ctx = buildContext({
      learner: emptyState(),
      meta: newMeta(),
      bank,
      concepts,
      nowMs: T0,
      hintAvailable: false,
    });
    const d1 = choose(newBandit(), ctx, mulberry32(7));
    const d2 = choose(newBandit(), ctx, mulberry32(7));
    expect(d1).toEqual(d2);
    expect(d1.arm).not.toBeNull();
  });
});
