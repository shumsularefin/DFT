// Grading (M6.1), kept free of the schema library so the quiz script on topic pages stays small.
import type { Question } from './questions';

export type Response =
  | { type: 'single'; choice: number }
  | { type: 'multi'; choices: number[] }
  | { type: 'numeric'; value: number }
  | { type: 'order'; order: number[] };

export interface Grade {
  correct: boolean;
  /** Fraction of the answer that was right, for multi and order questions. */
  partial?: number;
}

export class MalformedResponse extends Error {}

const isIndex = (i: unknown, n: number): i is number =>
  Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;

/** Grades a response. A response of the wrong shape throws MalformedResponse instead of counting as wrong. */
export function grade(q: Question, r: Response): Grade {
  if (!r || r.type !== q.type) throw new MalformedResponse(`expected a ${q.type} response for ${q.id}`);
  switch (q.type) {
    case 'single': {
      const { choice } = r as Extract<Response, { type: 'single' }>;
      if (!isIndex(choice, q.options.length)) throw new MalformedResponse(`choice out of range for ${q.id}`);
      return { correct: q.options[choice]!.correct };
    }
    case 'multi': {
      const { choices } = r as Extract<Response, { type: 'multi' }>;
      if (
        !Array.isArray(choices) ||
        !choices.every((i) => isIndex(i, q.options.length)) ||
        new Set(choices).size !== choices.length
      )
        throw new MalformedResponse(`choices must be distinct option indices for ${q.id}`);
      const picked = new Set(choices);
      const right = q.options.filter((o, i) => o.correct === picked.has(i)).length;
      return { correct: right === q.options.length, partial: right / q.options.length };
    }
    case 'numeric': {
      const { value } = r as Extract<Response, { type: 'numeric' }>;
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new MalformedResponse(`value must be a finite number for ${q.id}`);
      // Inclusive bound with a tiny allowance for decimal round-off (2.6 - 2.5 is 0.10000000000000009).
      return { correct: Math.abs(value - q.answer) <= q.tolerance + 1e-9 * Math.max(1, Math.abs(q.answer)) };
    }
    case 'order': {
      const { order } = r as Extract<Response, { type: 'order' }>;
      const n = q.options.length;
      if (
        !Array.isArray(order) ||
        order.length !== n ||
        !order.every((i) => isIndex(i, n)) ||
        new Set(order).size !== n
      )
        throw new MalformedResponse(`order must be a permutation of 0..${n - 1} for ${q.id}`);
      const right = order.filter((v, i) => v === i).length;
      return { correct: right === n, partial: right / n };
    }
  }
}
