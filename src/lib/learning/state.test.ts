import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  applyAnswer,
  emptyState,
  HISTORY_CAP,
  merge,
  parseState,
  serialize,
  type LearnerState,
} from './state';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 12);

const answer = (s: LearnerState, q: string, correct: boolean, now: number, hints = 0, concepts = ['encut']) =>
  applyAnswer(s, { questionId: q, concepts, difficulty: 0, correct, hints, now });

/** A random state built from random answers, for property tests. */
function randomState(seed: number, steps = 30): LearnerState {
  const r = mulberry32(seed);
  let s = emptyState();
  for (let i = 0; i < steps; i++) {
    const c = ['a', 'b', 'c', 'd'][Math.floor(r() * 4)]!;
    s = answer(
      s,
      `q-${Math.floor(r() * 6)}`,
      r() < 0.6,
      T0 + Math.floor(r() * 30) * DAY + i,
      Math.floor(r() * 3),
      [c],
    );
  }
  s.arms = { 'new-easy': { alpha: 1 + Math.floor(r() * 5), beta: 1 + Math.floor(r() * 5) } };
  return s;
}

describe('learner state', () => {
  it('applies BKT, Elo and SM-2 for one answer', () => {
    const s = answer(emptyState(), 'q-encut-1', true, T0);
    expect(s.concepts.encut!.pL).toBeCloseTo(0.692683, 6);
    expect(s.concepts.encut!.theta).toBeCloseTo(0.2, 12);
    expect(s.questions['q-encut-1']!.b).toBeCloseTo(-0.025, 12);
    expect(s.questions['q-encut-1']!.due).toBe(T0 + DAY);
    expect(s.activeDays).toHaveLength(1);
  });
  it('round trips through JSON', () => {
    const s = randomState(1);
    expect(parseState(JSON.parse(serialize(s)))).toEqual(s);
  });
  it('rejects malformed states', () => {
    expect(parseState({})).toBeNull();
    expect(parseState({ ...emptyState(), version: 99 })).toBeNull();
    expect(
      parseState({
        ...emptyState(),
        concepts: { x: { pL: 2, theta: 0, attempts: 0, lastSeen: 0, history: [] } },
      }),
    ).toBeNull();
  });
  it('caps history at 200 events per concept', () => {
    let s = emptyState();
    for (let i = 0; i < 250; i++) s = answer(s, 'q-1', i % 2 === 0, T0 + i);
    expect(s.concepts.encut!.history).toHaveLength(HISTORY_CAP);
    expect(s.concepts.encut!.history[0]!.t).toBe(T0 + 50);
  });
  it('merge is commutative and idempotent (property test, 40 seeds)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = randomState(seed);
      const b = randomState(seed + 1000);
      expect(merge(a, b), `seed ${seed}`).toEqual(merge(b, a));
      expect(merge(a, a)).toEqual(merge(a, emptyState()));
      expect(merge(merge(a, b), b)).toEqual(merge(a, b));
    }
  });
  it('merge keeps the newer record and unions answer histories', () => {
    const a = answer(emptyState(), 'q-1', true, T0);
    const b = answer(emptyState(), 'q-1', false, T0 + DAY);
    const m = merge(a, b);
    expect(m.concepts.encut!.lastSeen).toBe(T0 + DAY);
    expect(m.concepts.encut!.history).toHaveLength(2);
    expect(m.questions['q-1']!.lastReviewed).toBe(T0 + DAY);
  });
});
