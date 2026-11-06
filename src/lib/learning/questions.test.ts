import { describe, expect, it } from 'vitest';
import { grade, MalformedResponse, parseQuestions, questionSchema, type Question } from './questions';
import { graph, questions } from './bank';

const common = {
  concepts: ['encut'],
  prompt: 'A prompt',
  hints: ['h1', 'h2'],
  difficulty: 0,
  level: 'beginner',
  sources: ['S-049'],
};
const opt = (text: string, correct = false) => ({ text, correct, why: 'because' });
const single = questionSchema.parse({
  ...common,
  id: 'q-s',
  type: 'single',
  options: [opt('a', true), opt('b')],
}) as Question;
const multi = questionSchema.parse({
  ...common,
  id: 'q-m',
  type: 'multi',
  options: [opt('a', true), opt('b'), opt('c', true)],
}) as Question;
const numeric = questionSchema.parse({
  ...common,
  id: 'q-n',
  type: 'numeric',
  answer: 2.5,
  tolerance: 0.1,
}) as Question;
const order = questionSchema.parse({
  ...common,
  id: 'q-o',
  type: 'order',
  options: [opt('1'), opt('2'), opt('3')],
}) as Question;

describe('question schema', () => {
  it('accepts the CONTENT_GUIDE shape and defaults a = 1', () => {
    expect(single.a).toBe(1);
  });
  it('refuses timers and single questions without exactly one correct option', () => {
    expect(
      questionSchema.safeParse({
        ...common,
        id: 'q-t',
        type: 'numeric',
        answer: 1,
        tolerance: 0,
        timeLimitSec: 30,
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...common,
        id: 'q-x',
        type: 'single',
        options: [opt('a', true), opt('b', true)],
      }).success,
    ).toBe(false);
  });
});

describe('grading', () => {
  it('single', () => {
    expect(grade(single, { type: 'single', choice: 0 })).toEqual({ correct: true });
    expect(grade(single, { type: 'single', choice: 1 })).toEqual({ correct: false });
  });
  it('multi needs the exact set', () => {
    expect(grade(multi, { type: 'multi', choices: [2, 0] }).correct).toBe(true);
    const g = grade(multi, { type: 'multi', choices: [0] });
    expect(g.correct).toBe(false);
    expect(g.partial).toBeCloseTo(2 / 3, 12);
  });
  it('numeric within tolerance, inclusive', () => {
    expect(grade(numeric, { type: 'numeric', value: 2.6 }).correct).toBe(true);
    expect(grade(numeric, { type: 'numeric', value: 2.4 }).correct).toBe(true);
    expect(grade(numeric, { type: 'numeric', value: 2.61 }).correct).toBe(false);
  });
  it('order needs the exact sequence', () => {
    expect(grade(order, { type: 'order', order: [0, 1, 2] }).correct).toBe(true);
    expect(grade(order, { type: 'order', order: [1, 0, 2] })).toEqual({ correct: false, partial: 1 / 3 });
  });
  it('rejects malformed responses instead of grading them wrong', () => {
    expect(() => grade(single, { type: 'single', choice: 5 })).toThrow(MalformedResponse);
    expect(() => grade(single, { type: 'numeric', value: 1 })).toThrow(MalformedResponse);
    expect(() => grade(multi, { type: 'multi', choices: [0, 0] })).toThrow(MalformedResponse);
    expect(() => grade(numeric, { type: 'numeric', value: Number.NaN })).toThrow(MalformedResponse);
    expect(() => grade(order, { type: 'order', order: [0, 0, 1] })).toThrow(MalformedResponse);
  });
  it('parseQuestions lists every problem', () => {
    expect(() => parseQuestions([{ id: 'bad' }], 'f.json')).toThrow(/f\.json/);
  });
});

describe('the real bank', () => {
  it('parses and every concept exists in the graph', () => {
    expect(questions.length).toBeGreaterThan(70);
    for (const q of questions)
      for (const c of q.concepts) expect(graph.byId.has(c), `${q.id}: ${c}`).toBe(true);
  });
});
