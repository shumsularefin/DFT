/**
 * Thompson-sampling policy over kinds of practice action, with fixed guard rails.
 * A transparent heuristic, not trained reinforcement learning.
 * @source S-039 (Thompson 1933), S-037. Arm set, reward weights, targets and guard rails are
 * teaching conventions (D-053).
 */
import { pCorrect } from './irt';
import { MASTERY_PL } from './bkt';
import { beta, type Rng } from './random';

export const ARMS = ['review-due', 'new-easy', 'new-target', 'new-stretch', 'hint', 'suggest-topic'] as const;
export type Arm = (typeof ARMS)[number];

export interface ArmPosterior {
  alpha: number;
  beta: number;
}
export type BanditState = Record<Arm, ArmPosterior>;

export function newBandit(): BanditState {
  return Object.fromEntries(ARMS.map((a) => [a, { alpha: 1, beta: 1 }])) as BanditState;
}

/** Target probability of a correct answer per arm (from the Rasch model). */
export const TARGET_P = { 'new-easy': 0.85, 'new-target': 0.7, 'new-stretch': 0.55 } as const;
export const PREREQ_FLOOR = 0.6;
export const OVERDUE_DAYS = 3;
export const MAX_WRONG_STREAK = 3;

export interface PolicyQuestion {
  id: string;
  concept: string;
  /** Item difficulty b from the Rasch model. */
  b: number;
}
export interface DueReview {
  id: string;
  overdueDays: number;
}
export interface PolicyContext {
  theta: number;
  /** BKT pL per concept id; missing means not seen yet (treated as 0.3, the default prior). */
  mastery: Readonly<Record<string, number>>;
  prerequisites: Readonly<Record<string, readonly string[]>>;
  /** Questions that may be shown as new practice. */
  candidates: readonly PolicyQuestion[];
  dueReviews: readonly DueReview[];
  consecutiveWrong: number;
  /** A question is open and still has an unused hint. */
  hintAvailable: boolean;
  /** Concepts whose prerequisites are met and which are not mastered yet. */
  readyConcepts: readonly string[];
}

export interface Decision {
  arm: Arm | null;
  questionId?: string;
  topic?: string;
  /** Plain-language reason, shown in "How this works". */
  reason: string;
  /** Set when a fixed guard rail, not the sampler, made the choice. */
  guard?: 'overdue-review' | 'wrong-streak';
  samples?: Partial<Record<Arm, number>>;
}

const DEFAULT_PL = 0.3;
const pl = (m: PolicyContext['mastery'], id: string) => m[id] ?? DEFAULT_PL;
const logit = (p: number) => Math.log(p / (1 - p));

/** Candidates after the prerequisite and mastery guard rails (each relaxed if nothing is left). */
function usable(ctx: PolicyContext): PolicyQuestion[] {
  let pool = [...ctx.candidates];
  const notBlocked = pool.filter((q) => {
    const pre = ctx.prerequisites[q.concept] ?? [];
    return pre.length === 0 || !pre.every((p) => pl(ctx.mastery, p) < PREREQ_FLOOR);
  });
  if (notBlocked.length > 0) pool = notBlocked;
  const open = pool.filter((q) => pl(ctx.mastery, q.concept) < MASTERY_PL);
  return open.length > 0 ? open : pool;
}

/** The usable question whose difficulty best matches the target chance of a correct answer. */
export function pickQuestion(ctx: PolicyContext, targetP: number): PolicyQuestion | undefined {
  const pool = usable(ctx);
  if (pool.length === 0) return undefined;
  const least = Math.min(...pool.map((q) => pl(ctx.mastery, q.concept)));
  const here = pool.filter((q) => pl(ctx.mastery, q.concept) === least);
  const bTarget = ctx.theta - logit(targetP);
  return here.reduce((best, q) => {
    const d = Math.abs(q.b - bTarget);
    const bd = Math.abs(best.b - bTarget);
    return d < bd || (d === bd && q.id < best.id) ? q : best;
  });
}

function isEligible(arm: Arm, ctx: PolicyContext): boolean {
  switch (arm) {
    case 'review-due':
      return ctx.dueReviews.length > 0;
    case 'hint':
      return ctx.hintAvailable;
    case 'suggest-topic':
      return ctx.readyConcepts.length > 0;
    default:
      return pickQuestion(ctx, TARGET_P[arm]) !== undefined;
  }
}

function realise(arm: Arm, ctx: PolicyContext, reason: string, extra: Partial<Decision> = {}): Decision {
  if (arm === 'review-due') {
    const first = ctx.dueReviews.reduce((a, b) =>
      b.overdueDays > a.overdueDays || (b.overdueDays === a.overdueDays && b.id < a.id) ? b : a,
    );
    return { arm, questionId: first.id, reason, ...extra };
  }
  if (arm === 'hint') return { arm, reason, ...extra };
  if (arm === 'suggest-topic') return { arm, topic: ctx.readyConcepts[0], reason, ...extra };
  const q = pickQuestion(ctx, TARGET_P[arm]);
  return { arm, questionId: q?.id, reason, ...extra };
}

/** Guard rails first (fixed, not learned), then Thompson sampling among eligible arms. */
export function choose(bandit: BanditState, ctx: PolicyContext, rng: Rng): Decision {
  const worst = ctx.dueReviews.reduce((m, d) => Math.max(m, d.overdueDays), -Infinity);
  if (worst > OVERDUE_DAYS) {
    return realise(
      'review-due',
      ctx,
      `A review is more than ${OVERDUE_DAYS} days overdue, so it comes first.`,
      { guard: 'overdue-review' },
    );
  }
  if (ctx.consecutiveWrong >= MAX_WRONG_STREAK) {
    const arm: Arm = ctx.hintAvailable ? 'hint' : 'new-easy';
    if (isEligible(arm, ctx)) {
      return realise(
        arm,
        ctx,
        `${MAX_WRONG_STREAK} wrong answers in a row, so you get ${arm === 'hint' ? 'a hint' : 'an easier question'}.`,
        { guard: 'wrong-streak' },
      );
    }
  }
  const samples: Partial<Record<Arm, number>> = {};
  let best: Arm | null = null;
  for (const arm of ARMS) {
    if (!isEligible(arm, ctx)) continue;
    const s = beta(rng, bandit[arm].alpha, bandit[arm].beta);
    samples[arm] = s;
    if (best === null || s > (samples[best] as number)) best = arm;
  }
  if (best === null) return { arm: null, reason: 'Nothing is available right now.', samples };
  return realise(
    best,
    ctx,
    `Sampled the best expected payoff among ${Object.keys(samples).length} available kinds of action.`,
    { samples },
  );
}

export interface Outcome {
  correct: boolean;
  hintsUsed: number;
  maxHints: number;
  /** 0..1, 1 for a quick answer. No timers are shown to the learner; callers may pass 0.5. */
  speedScore: number;
  /** 0 or 1, credited later (see delayedRetentionUpdate). Pass 0 at answer time. */
  retentionBonus: number;
}

export const REWARD_WEIGHTS = { correct: 0.5, hints: 0.2, speed: 0.1, retention: 0.2 } as const;

/** Reward in [0, 1] (heuristic, D-053). */
export function reward(o: Outcome): number {
  const hintTerm = o.maxHints > 0 ? 1 - Math.min(o.hintsUsed, o.maxHints) / o.maxHints : 1;
  const r =
    REWARD_WEIGHTS.correct * (o.correct ? 1 : 0) +
    REWARD_WEIGHTS.hints * hintTerm +
    REWARD_WEIGHTS.speed * Math.min(1, Math.max(0, o.speedScore)) +
    REWARD_WEIGHTS.retention * Math.min(1, Math.max(0, o.retentionBonus));
  return Math.min(1, Math.max(0, r));
}

/** alpha += r, beta += 1 - r. Returns a new state. */
export function updateBandit(state: BanditState, arm: Arm, r: number): BanditState {
  if (!(r >= 0 && r <= 1)) throw new RangeError(`reward must be in [0, 1], got ${r}`);
  const p = state[arm];
  return { ...state, [arm]: { alpha: p.alpha + r, beta: p.beta + (1 - r) } };
}

/**
 * Delayed retention credit: when an item scheduled by `arm` is answered correctly after its
 * interval, add a pseudo-observation of weight 0.2 (the retention weight): alpha += 0.2 b,
 * beta += 0.2 (1 - b) with b = 1 for retained, 0 for forgotten.
 */
export function delayedRetentionUpdate(state: BanditState, arm: Arm, retained: boolean): BanditState {
  const w = REWARD_WEIGHTS.retention;
  const p = state[arm];
  return { ...state, [arm]: { alpha: p.alpha + (retained ? w : 0), beta: p.beta + (retained ? 0 : w) } };
}

/** Chance of a correct answer under the Rasch model, for UI explanations. */
export const expectedCorrect = pCorrect;

/** Text for the "How this works" panel (beginner level, honest about being a heuristic). */
export const HOW_THIS_WORKS = [
  'This is a simple helper that picks your next practice item. It is a set of rules of thumb, not an artificial intelligence that has studied you.',
  'It keeps a rough guess of how well you know each idea, using a standard method from the education research literature called knowledge tracing. The guess is an estimate. It can be wrong, and it never leaves your browser.',
  'It chooses between six kinds of action: a review that is due, an easier question, a question near your level, a harder stretch question, a hint, or a suggested topic. Each kind has a score that starts equal. When a kind of action seems to help you (you answer correctly, with few hints), its score rises, so you see more of it. A little randomness keeps it trying the others. This is called Thompson sampling.',
  'Some rules are fixed and never learned: a review that is more than 3 days overdue comes first, three wrong answers in a row bring a hint or an easier question, and it avoids ideas whose basics you have not met yet.',
  'The numbers in the reward and the targets (aiming for about 7 correct in 10) are choices made by the authors of this site for teaching, not measured laws. Treat all of it as a coach that makes suggestions, not a test result.',
] as const;
