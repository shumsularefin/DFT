// Question bank schema and grading (M6.1). Accepts exactly the shape in docs/CONTENT_GUIDE.md section 7.
import { z } from 'astro/zod';

const option = z.object({
  text: z.string().min(1),
  correct: z.boolean().default(false),
  why: z.string().min(1),
});
const base = {
  id: z.string().regex(/^q-[a-z0-9-]+$/, 'must look like q-encut-1'),
  concepts: z.array(z.string()).min(1),
  prompt: z.string().min(5),
  hints: z.array(z.string().min(1)).min(1),
  /** Logit prior for item difficulty: 0 is average, -2 easy, +2 hard. */
  difficulty: z.number().min(-4).max(4),
  level: z.enum(['beginner', 'intermediate', 'pro']),
  sources: z.array(z.string().regex(/^S-\d{3}$/)).min(1),
  /** IRT discrimination; this project uses the Rasch model, so 1 unless a stage decides otherwise. */
  a: z.number().positive().default(1),
  /** No timers (CONTENT_GUIDE section 7): the field exists only so that setting it fails validation. */
  timeLimitSec: z.undefined().optional(),
};

export const questionSchema = z.discriminatedUnion('type', [
  z
    .object({ ...base, type: z.literal('single'), options: z.array(option).min(2) })
    .refine(
      (q) => q.options.filter((o) => o.correct).length === 1,
      'single questions need exactly one correct option',
    ),
  z
    .object({ ...base, type: z.literal('multi'), options: z.array(option).min(2) })
    .refine((q) => q.options.some((o) => o.correct), 'multi questions need at least one correct option'),
  z.object({
    ...base,
    type: z.literal('numeric'),
    answer: z.number(),
    tolerance: z.number().nonnegative(),
    unit: z.string().optional(),
  }),
  /** `order`: the options are listed in the correct order; the learner sees them shuffled. */
  z.object({ ...base, type: z.literal('order'), options: z.array(option).min(2) }),
]);

export type Question = z.infer<typeof questionSchema>;

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

/** Parses a whole question file; throws with every problem listed. */
export function parseQuestions(raw: unknown, file = 'questions'): Question[] {
  const res = z.array(questionSchema).safeParse(raw);
  if (!res.success)
    throw new Error(res.error.issues.map((i) => `${file}: ${i.path.join('.')}: ${i.message}`).join('\n'));
  return res.data;
}
