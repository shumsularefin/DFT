import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS_PER_CONCEPT,
  addEvent,
  deserialize,
  emptyState,
  mergeStates,
  newConcept,
  newQuestion,
  serialize,
  type LearnerState,
} from './state';

// Property style tests over a seeded generator (no Math.random). @source S-037, S-038
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
function randomState(seed: number): LearnerState {
  const r = rng(seed);
  const s = emptyState();
  for (const id of ['a', 'b', 'c']) {
    if (r() < 0.7) {
      let c = { ...newConcept(), pL: Math.round(r() * 100) / 100, theta: Math.round(r() * 10) / 10 };
      for (let i = 0; i < Math.floor(r() * 5); i++)
        c = addEvent(c, { t: Math.floor(r() * 20), q: `q${Math.floor(r() * 3)}`, correct: r() < 0.5 });
      s.concepts[id] = c;
    }
    if (r() < 0.7)
      s.questions[`q-${id}`] = {
        ...newQuestion(),
        b: Math.round(r() * 10) / 10,
        due: Math.floor(r() * 9),
        lastSeen: Math.floor(r() * 5),
      };
  }
  return s;
}

describe('learner state', () => {
  it('round trips through JSON', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomState(i);
      expect(deserialize(serialize(s))).toEqual(s);
    }
  });
  it('rejects bad input', () => {
    expect(() => deserialize('{nope')).toThrow(/JSON/);
    expect(() => deserialize('{"version":99,"concepts":{},"questions":{}}')).toThrow(/version/);
  });
  it('caps events per concept at 200, keeping the newest', () => {
    let c = newConcept();
    for (let i = 0; i < 300; i++) c = addEvent(c, { t: i, q: 'q', correct: true });
    expect(c.events).toHaveLength(MAX_EVENTS_PER_CONCEPT);
    expect(c.events[0]!.t).toBe(100);
    expect(c.attempts).toBe(300);
  });
  it('merge is commutative and idempotent', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomState(i);
      const b = randomState(i + 1000);
      expect(mergeStates(a, b)).toEqual(mergeStates(b, a));
      const m = mergeStates(a, b);
      expect(mergeStates(m, m)).toEqual(m);
      expect(mergeStates(m, a)).toEqual(m);
    }
  });
  it('merge keeps the newer record', () => {
    const a = emptyState();
    const b = emptyState();
    a.concepts.x = { ...newConcept(), pL: 0.9, lastSeen: 5 };
    b.concepts.x = { ...newConcept(), pL: 0.4, lastSeen: 9 };
    expect(mergeStates(a, b).concepts.x!.pL).toBe(0.4);
  });
});
