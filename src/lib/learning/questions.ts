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

/** Parses a whole question file; throws with every problem listed. */
export function parseQuestions(raw: unknown, file = 'questions'): Question[] {
  const res = z.array(questionSchema).safeParse(raw);
  if (!res.success)
    throw new Error(res.error.issues.map((i) => `${file}: ${i.path.join('.')}: ${i.message}`).join('\n'));
  return res.data;
}
