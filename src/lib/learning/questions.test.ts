import { describe, it, expect } from 'vitest';
import m1 from '../../data/questions/module-01.json';
import m2 from '../../data/questions/module-02.json';
import m3 from '../../data/questions/module-03.json';
import { grade, loadQuestionBank, parseQuestions, MalformedResponseError, type Question } from './questions';

const base = {
  concepts: ['x'],
  hints: ['a', 'b'],
  difficulty: 0,
  level: 'beginner',
  sources: [],
};
const opts = [
  { text: 'A', correct: true, why: 'w' },
  { text: 'B', correct: false, why: 'w' },
  { text: 'C', correct: true, why: 'w' },
];
const mk = (extra: Record<string, unknown>) =>
  parseQuestions([{ id: 'q-t', prompt: 'p', ...base, ...extra }])[0] as Question;

describe('schema', () => {
  it('accepts the shipped banks and defaults discrimination to 1', () => {
    const bank = loadQuestionBank({ m1, m2, m3 });
    expect(bank.length).toBeGreaterThanOrEqual(72);
    expect(bank.every((q) => q.a === 1 || q.a > 0)).toBe(true);
  });
  it('rejects a timer', () => {
    expect(() =>
      parseQuestions([
        { id: 'q-t', prompt: 'p', ...base, type: 'numeric', answer: 1, tolerance: 0, timeLimitSec: 30 },
      ]),
    ).toThrow(/timeLimitSec/);
  });
  it('rejects a numeric question without tolerance and a single with two correct options', () => {
    expect(() => parseQuestions([{ id: 'q-t', prompt: 'p', ...base, type: 'numeric', answer: 1 }])).toThrow(
      /tolerance/,
    );
    expect(() =>
      parseQuestions([{ id: 'q-t', prompt: 'p', ...base, type: 'single', options: opts }]),
    ).toThrow(/exactly one/);
  });
  it('rejects duplicate ids across modules', () => {
    const q = { id: 'q-t', prompt: 'p', ...base, type: 'numeric', answer: 1, tolerance: 0 };
    expect(() => loadQuestionBank({ a: [q], b: [q] })).toThrow(/duplicate question id q-t/);
  });
});

describe('grade', () => {
  it('single', () => {
    const q = mk({ type: 'single', options: [opts[0], opts[1]] });
    expect(grade(q, { type: 'single', index: 0 }).correct).toBe(true);
    expect(grade(q, { type: 'single', index: 1 }).correct).toBe(false);
    expect(() => grade(q, { type: 'single', index: 2 })).toThrow(MalformedResponseError);
    expect(() => grade(q, { type: 'single', index: 0.5 })).toThrow(MalformedResponseError);
  });
  it('multi is an exact set', () => {
    const q = mk({ type: 'multi', options: opts });
    expect(grade(q, { type: 'multi', indices: [2, 0] })).toEqual({ correct: true, partial: 1 });
    expect(grade(q, { type: 'multi', indices: [0] }).correct).toBe(false);
    expect(grade(q, { type: 'multi', indices: [0, 1, 2] }).correct).toBe(false);
    expect(() => grade(q, { type: 'multi', indices: [0, 0] })).toThrow(MalformedResponseError);
    expect(() => grade(q, { type: 'multi', indices: [5] })).toThrow(MalformedResponseError);
  });
  it('numeric tolerance is inclusive', () => {
    const q = mk({ type: 'numeric', answer: 10, tolerance: 0.5 });
    expect(grade(q, { type: 'numeric', value: 10.5 }).correct).toBe(true);
    expect(grade(q, { type: 'numeric', value: 9.5 }).correct).toBe(true);
    expect(grade(q, { type: 'numeric', value: 10.51 }).correct).toBe(false);
    expect(() => grade(q, { type: 'numeric', value: NaN })).toThrow(MalformedResponseError);
    expect(() => grade(q, { type: 'numeric', value: Infinity })).toThrow(MalformedResponseError);
  });
  it('order is an exact sequence', () => {
    const q = mk({ type: 'order', items: ['a', 'b', 'c'] });
    expect(grade(q, { type: 'order', items: ['a', 'b', 'c'] }).correct).toBe(true);
    const r = grade(q, { type: 'order', items: ['a', 'c', 'b'] });
    expect(r.correct).toBe(false);
    expect(r.partial).toBeCloseTo(1 / 3);
    expect(() => grade(q, { type: 'order', items: ['a', 'b'] })).toThrow(MalformedResponseError);
    expect(() => grade(q, { type: 'order', items: ['a', 'a', 'b'] })).toThrow(MalformedResponseError);
  });
  it('rejects a response of the wrong type', () => {
    const q = mk({ type: 'numeric', answer: 1, tolerance: 0 });
    expect(() => grade(q, { type: 'single', index: 0 })).toThrow(MalformedResponseError);
  });
  it('grades a shipped numeric question at its own answer', () => {
    const q = loadQuestionBank({ m2 }).find((x) => x.id === 'q-wave-5') as Question;
    expect(q.type).toBe('numeric');
    if (q.type === 'numeric') {
      expect(grade(q, { type: 'numeric', value: q.answer }).correct).toBe(true);
      expect(grade(q, { type: 'numeric', value: q.answer + 1 }).correct).toBe(false);
    }
  });
});
