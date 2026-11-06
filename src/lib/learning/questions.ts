/**
 * Question bank: schema, loader and grading.
 *
 * Question shape follows docs/CONTENT_GUIDE.md section 7. There are no timers
 * (`timeLimitSec` must stay undefined). Grading is exact and deterministic.
 *
 * @source S-037 (the optional discrimination `a` and logit `difficulty` are the
 * parameters a later adaptive model, M6.2, will read; M6.1 only stores them)
 */
import { z } from 'astro/zod';

const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case');
const sourceId = z.string().regex(/^S-\d{3}$/, 'source id must look like S-012');

const optionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  why: z.string().min(1),
});

const common = {
  id: idSchema,
  concepts: z.array(idSchema).min(1),
  prompt: z.string().min(1),
  hints: z.array(z.string().min(1)),
  /** Logit prior, about -2 (easy) to +2 (hard). */
  difficulty: z.number().min(-4).max(4),
  /** Discrimination, default 1. */
  a: z.number().positive().default(1),
  level: z.enum(['beginner', 'intermediate', 'pro']),
  sources: z.array(sourceId),
  /** Timers are not allowed anywhere on this site. */
  timeLimitSec: z.undefined().optional(),
};

const choiceOptions = z.array(optionSchema).min(2);

export const questionSchema = z.discriminatedUnion('type', [
  z.object({
    ...common,
    type: z.literal('single'),
    options: choiceOptions.refine((o) => o.filter((x) => x.correct).length === 1, {
      message: 'a single question needs exactly one correct option',
    }),
  }),
  z.object({
    ...common,
    type: z.literal('multi'),
    options: choiceOptions.refine((o) => o.some((x) => x.correct), {
      message: 'a multi question needs at least one correct option',
    }),
  }),
  z.object({
    ...common,
    type: z.literal('numeric'),
    answer: z.number().finite(),
    tolerance: z.number().nonnegative().finite(),
    unit: z.string().optional(),
  }),
  z.object({
    ...common,
    type: z.literal('order'),
    /** Items in the correct order. */
    items: z.array(z.string().min(1)).min(2),
  }),
]);

export type Question = z.infer<typeof questionSchema>;

export type Response =
  | { type: 'single'; index: number }
  | { type: 'multi'; indices: number[] }
  | { type: 'numeric'; value: number }
  | { type: 'order'; items: string[] };

export interface GradeResult {
  correct: boolean;
  /** Fraction in [0, 1] of the multi or order answer that is right, informational only. */
  partial?: number;
}

/** Thrown for a response that cannot be graded (wrong shape, NaN, bad index). */
export class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedResponseError';
  }
}

/** Parse and validate raw question JSON. The error names the offending question. */
export function parseQuestions(raw: unknown, origin = 'questions'): Question[] {
  if (!Array.isArray(raw)) throw new Error(`${origin}: expected an array of questions`);
  return raw.map((item, i) => {
    const r = questionSchema.safeParse(item);
    if (!r.success) {
      const id = (item as { id?: unknown } | null)?.id;
      const label = typeof id === 'string' ? id : `#${i}`;
      const issue = r.error.issues[0];
      throw new Error(`${origin}: question ${label}: ${issue?.path.join('.')} ${issue?.message}`);
    }
    return r.data;
  });
}

/** Parse several modules and reject duplicate ids across them. */
export function loadQuestionBank(modules: Record<string, unknown>): Question[] {
  const all: Question[] = [];
  const seen = new Map<string, string>();
  for (const [name, raw] of Object.entries(modules)) {
    for (const q of parseQuestions(raw, name)) {
      const prior = seen.get(q.id);
      if (prior) throw new Error(`duplicate question id ${q.id} in ${name} and ${prior}`);
      seen.set(q.id, name);
      all.push(q);
    }
  }
  return all;
}

/**
 * Grade a response. Malformed responses throw MalformedResponseError; they are
 * never treated as wrong answers.
 */
export function grade(question: Question, response: Response): GradeResult {
  if (response === null || typeof response !== 'object' || response.type !== question.type) {
    throw new MalformedResponseError(`response type does not match a ${question.type} question`);
  }
  switch (question.type) {
    case 'single': {
      const r = response as Extract<Response, { type: 'single' }>;
      if (!Number.isInteger(r.index) || r.index < 0 || r.index >= question.options.length) {
        throw new MalformedResponseError('option index out of range');
      }
      return { correct: question.options[r.index]?.correct === true };
    }
    case 'multi': {
      const r = response as Extract<Response, { type: 'multi' }>;
      if (
        !Array.isArray(r.indices) ||
        r.indices.some((i) => !Number.isInteger(i) || i < 0 || i >= question.options.length)
      ) {
        throw new MalformedResponseError('option index out of range');
      }
      const chosen = new Set(r.indices);
      if (chosen.size !== r.indices.length) throw new MalformedResponseError('duplicate indices');
      let right = 0;
      question.options.forEach((o, i) => {
        if (o.correct === chosen.has(i)) right += 1;
      });
      const correct = right === question.options.length;
      return { correct, partial: right / question.options.length };
    }
    case 'numeric': {
      const r = response as Extract<Response, { type: 'numeric' }>;
      if (typeof r.value !== 'number' || !Number.isFinite(r.value)) {
        throw new MalformedResponseError('numeric response must be a finite number');
      }
      // Inclusive tolerance, with a tiny slack for binary rounding of the difference.
      const diff = Math.abs(r.value - question.answer);
      return { correct: diff <= question.tolerance + 1e-12 * Math.max(1, Math.abs(question.answer)) };
    }
    case 'order': {
      const r = response as Extract<Response, { type: 'order' }>;
      const want = question.items;
      if (
        !Array.isArray(r.items) ||
        r.items.length !== want.length ||
        new Set(r.items).size !== want.length ||
        r.items.some((x) => !want.includes(x))
      ) {
        throw new MalformedResponseError('order response must be a permutation of the items');
      }
      const right = r.items.filter((x, i) => x === want[i]).length;
      return { correct: right === want.length, partial: right / want.length };
    }
  }
}
