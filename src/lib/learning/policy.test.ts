import { describe, expect, it } from 'vitest';
import { buildGraph, type Concept } from './graph';
import {
  choose,
  conceptBlocked,
  creditRetention,
  eligible,
  reward,
  speedScore,
  updateArm,
  type BankItem,
  type PolicyContext,
} from './policy';
import { beta, gamma, mulberry32 } from './random';
import { applyAnswer, emptyState, type LearnerState } from './state';
import { graph, questions } from './bank';
import { simulate } from './simulate';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 12);
const mk = (id: string, prerequisites: string[] = []): Concept => ({
  id,
  label: id,
  module: 1,
  level: 'beginner',
  summary: 's',
  prerequisites,
  status: 'published',
});
const g = buildGraph([mk('a'), mk('b', ['a']), mk('c', ['a'])]);
const bank: BankItem[] = [
  { id: 'q-a1', concepts: ['a'], difficulty: -2 },
  { id: 'q-a2', concepts: ['a'], difficulty: 0 },
  { id: 'q-a3', concepts: ['a'], difficulty: 2 },
  { id: 'q-b1', concepts: ['b'], difficulty: 0 },
];
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  now: T0,
  bank,
  graph: g,
  wrongInARow: 0,
  ...over,
});
const ans = (s: LearnerState, id: string, correct: boolean, now = T0) =>
  applyAnswer(s, {
    questionId: id,
    concepts: bank.find((q) => q.id === id)!.concepts,
    difficulty: 0,
    correct,
    hints: 0,
    now,
  });

describe('random numbers', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('Beta(2, 5): mean within 0.003 of 2/7 and variance within 5 % (seed 42, 200 000 samples)', () => {
    const r = mulberry32(42);
    const n = 200_000;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const x = beta(r, 2, 5);
      s1 += x;
      s2 += x * x;
    }
    const mean = s1 / n;
    const variance = s2 / n - mean * mean;
    expect(Math.abs(mean - 2 / 7)).toBeLessThan(0.003);
    expect(Math.abs(variance / 0.025510204 - 1)).toBeLessThan(0.05);
  });
  it('Gamma(0.5) has mean 0.5 (shape below 1 path)', () => {
    const r = mulberry32(3);
    let s = 0;
    for (let i = 0; i < 100_000; i++) s += gamma(r, 0.5);
    expect(s / 100_000).toBeCloseTo(0.5, 1);
  });
});

describe('policy guard rails', () => {
  it('blocks a concept whose prerequisites are all weak, never a root', () => {
    expect(conceptBlocked(emptyState(), g, 'b')).toBe(true);
    expect(conceptBlocked(emptyState(), g, 'a')).toBe(false);
    const s = emptyState();
    s.concepts.a = { pL: 0.7, theta: 0, attempts: 1, lastSeen: T0, history: [] };
    expect(conceptBlocked(s, g, 'b')).toBe(false);
  });
  it('never offers a blocked question while something else is eligible', () => {
    const e = eligible(emptyState(), ctx());
    for (const c of e.values()) if ('questionId' in c) expect(c.questionId).not.toBe('q-b1');
  });
  it('offers blocked questions when nothing else is eligible', () => {
    const only = ctx({ bank: [bank[3]!] });
    expect(choose(emptyState(), only, mulberry32(1))).toMatchObject({ questionId: 'q-b1' });
  });
  it('overdue reviews older than 3 days come first', () => {
    let s = ans(emptyState(), 'q-a2', true);
    s = updateArm(updateArm(s, 'new-easy', 1), 'new-easy', 1);
    const c = choose(s, ctx({ now: T0 + 5 * DAY }), mulberry32(1));
    expect(c).toMatchObject({ arm: 'review-due', questionId: 'q-a2', reason: 'overdue for review' });
  });
  it('after three wrong answers in a row only a hint or an easier item is offered', () => {
    for (let seed = 1; seed < 30; seed++) {
      const c = choose(emptyState(), ctx({ wrongInARow: 3, hintFor: 'q-a2' }), mulberry32(seed))!;
      expect(['hint', 'new-easy']).toContain(c.arm);
    }
  });
  it('targets success probabilities 0.85, 0.7 and 0.55 from the Rasch model', () => {
    const e = eligible(emptyState(), ctx());
    expect(e.get('new-easy')).toMatchObject({ questionId: 'q-a1' });
    expect(e.get('new-target')).toMatchObject({ questionId: 'q-a2' });
    expect(e.get('new-stretch')).toMatchObject({ questionId: 'q-a2' });
  });
  it('suggests the next topic whose prerequisites are at least 0.6', () => {
    expect(eligible(emptyState(), ctx()).get('suggest-topic')).toMatchObject({ conceptId: 'a' });
  });
  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 10 }, () => choose(emptyState(), ctx(), r)!.arm);
    };
    expect(run(11)).toEqual(run(11));
  });
});

describe('rewards', () => {
  it('weights 0.5 correct, 0.2 hints, 0.1 speed; retention credited later', () => {
    expect(reward({ correct: true, hintsUsed: 0, maxHints: 2, seconds: 5 })).toBeCloseTo(0.8, 12);
    expect(reward({ correct: false, hintsUsed: 2, maxHints: 2, seconds: 120 })).toBe(0);
    expect(speedScore(35)).toBeCloseTo(0.5, 12);
    const s = creditRetention(emptyState(), 'new-target');
    expect(s.arms['new-target']).toEqual({ alpha: 1.2, beta: 1 });
  });
  it('Beta update with a fractional reward', () => {
    expect(updateArm(emptyState(), 'hint', 0.3).arms.hint).toEqual({ alpha: 1.3, beta: 1.7 });
  });
});

describe('simulation against a random policy (modules 1 to 3, 50 learners, 200 steps)', () => {
  const simBank: BankItem[] = questions.map((q) => ({
    id: q.id,
    concepts: q.concepts,
    difficulty: q.difficulty,
  }));
  it.each([1, 2, 3, 4, 5])('seed %i: policy >= random', (seed) => {
    const p = simulate('thompson', graph, simBank, 50, 200, seed);
    const r = simulate('random', graph, simBank, 50, 200, seed);
    console.log(`SIM seed ${seed}: thompson ${p.toFixed(4)} random ${r.toFixed(4)}`);
    expect(p).toBeGreaterThanOrEqual(r);
  });
});
