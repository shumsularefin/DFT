// Thompson-sampling policy over a small set of actions (S-039), with fixed guard rails (M6.3).
// The reward weights and guard-rail numbers are conventions (D-053), labelled "Heuristic" in the UI.
import type { Graph } from './graph';
import { difficultyFor } from './irt';
import { beta } from './random';
import type { Arm, LearnerState } from './state';

export const ARMS = ['review-due', 'new-easy', 'new-target', 'new-stretch', 'hint', 'suggest-topic'] as const;
export type ArmId = (typeof ARMS)[number];

/** Target probability of success for each kind of new item (from the Rasch model). */
export const TARGET_P = { 'new-easy': 0.85, 'new-target': 0.7, 'new-stretch': 0.55 } as const;
export const PREREQ_FLOOR = 0.6;
export const OVERDUE_FIRST_MS = 3 * 86_400_000;
export const MAX_WRONG_IN_A_ROW = 3;

export interface BankItem {
  id: string;
  concepts: string[];
  difficulty: number;
}

export interface PolicyContext {
  now: number;
  bank: BankItem[];
  graph: Graph;
  /** Wrong answers in a row in this session. */
  wrongInARow: number;
  /** The question just answered wrongly, if a hint for it can still be offered. */
  hintFor?: string;
  /** Concepts the learner may practise (published ones). Defaults to every concept in the bank. */
  concepts?: Set<string>;
}

export type Choice =
  | { arm: 'review-due'; questionId: string; reason: string }
  | { arm: 'new-easy' | 'new-target' | 'new-stretch'; questionId: string; reason: string }
  | { arm: 'hint'; questionId: string; reason: string }
  | { arm: 'suggest-topic'; conceptId: string; reason: string };

const armOf = (s: LearnerState, a: ArmId): Arm => s.arms[a] ?? { alpha: 1, beta: 1 };
const pL = (s: LearnerState, c: string) => s.concepts[c]?.pL ?? 0;
const theta = (s: LearnerState, cs: string[]) =>
  cs.reduce((t, c) => t + (s.concepts[c]?.theta ?? 0), 0) / Math.max(1, cs.length);
const label = (g: Graph, c: string) => g.byId.get(c)?.label ?? c;

/** Guard rail: a concept whose prerequisites are all weak (pL < 0.6) is blocked. Roots are never blocked. */
export function conceptBlocked(s: LearnerState, g: Graph, c: string): boolean {
  const pre = g.byId.get(c)?.prerequisites ?? [];
  return pre.length > 0 && pre.every((p) => pL(s, p) < PREREQ_FLOOR);
}

/** Questions due for review, most overdue first. */
export function dueQuestions(s: LearnerState, ctx: PolicyContext): string[] {
  const inBank = new Set(ctx.bank.map((q) => q.id));
  return Object.entries(s.questions)
    .filter(([id, q]) => inBank.has(id) && q.lastReviewed > 0 && q.due <= ctx.now)
    .sort(([a, x], [b, y]) => x.due - y.due || a.localeCompare(b))
    .map(([id]) => id);
}

/** New (never answered) questions, split into allowed ones and ones blocked by the prerequisite rail. */
function newQuestions(s: LearnerState, ctx: PolicyContext) {
  const allowedConcepts = ctx.concepts;
  const fresh = ctx.bank.filter(
    (q) => !s.questions[q.id] && (!allowedConcepts || q.concepts.every((c) => allowedConcepts.has(c))),
  );
  const open = fresh.filter((q) => !q.concepts.some((c) => conceptBlocked(s, ctx.graph, c)));
  return { fresh, open };
}

/** The new question whose difficulty is closest to the one that gives success probability p. */
function closestTo(s: LearnerState, items: BankItem[], p: number): BankItem | undefined {
  let best: BankItem | undefined;
  let bestGap = Infinity;
  for (const q of items) {
    const gap = Math.abs(q.difficulty - difficultyFor(theta(s, q.concepts), p));
    if (gap < bestGap || (gap === bestGap && best && q.id < best.id)) {
      best = q;
      bestGap = gap;
    }
  }
  return best;
}

/** The next concept to read about: not yet practised, all prerequisites at least PREREQ_FLOOR. */
function topicToSuggest(s: LearnerState, ctx: PolicyContext): string | undefined {
  const inBank = new Set(ctx.bank.flatMap((q) => q.concepts));
  return ctx.graph.order.find(
    (c) =>
      inBank.has(c) &&
      (!ctx.concepts || ctx.concepts.has(c)) &&
      !s.concepts[c] &&
      (ctx.graph.byId.get(c)?.prerequisites ?? []).every((p) => pL(s, p) >= PREREQ_FLOOR),
  );
}

/** Builds the candidate choice for every eligible arm (no randomness). */
export function eligible(s: LearnerState, ctx: PolicyContext): Map<ArmId, Choice> {
  const out = new Map<ArmId, Choice>();
  const due = dueQuestions(s, ctx);
  if (due[0]) out.set('review-due', { arm: 'review-due', questionId: due[0], reason: 'due for review' });

  const { fresh, open } = newQuestions(s, ctx);
  // Guard rail: blocked concepts are allowed only when nothing else is eligible.
  const pool = open.length > 0 || due.length > 0 ? open : fresh;
  for (const arm of ['new-easy', 'new-target', 'new-stretch'] as const) {
    const q = closestTo(s, pool, TARGET_P[arm]);
    if (q) {
      const why =
        arm === 'new-easy'
          ? 'an easier question'
          : arm === 'new-stretch'
            ? 'a stretch question'
            : 'the next step';
      out.set(arm, { arm, questionId: q.id, reason: `${why} on ${label(ctx.graph, q.concepts[0]!)}` });
    }
  }
  if (ctx.hintFor)
    out.set('hint', { arm: 'hint', questionId: ctx.hintFor, reason: 'a hint for the last question' });
  const topic = topicToSuggest(s, ctx);
  if (topic)
    out.set('suggest-topic', {
      arm: 'suggest-topic',
      conceptId: topic,
      reason: `read about ${label(ctx.graph, topic)} next`,
    });
  return out;
}

/**
 * Picks the next action. Fixed rails first (overdue reviews, a run of wrong answers), then Thompson
 * sampling: draw from each eligible arm's Beta posterior and take the largest. Returns null when nothing
 * is eligible.
 */
export function choose(s: LearnerState, ctx: PolicyContext, rng: () => number): Choice | null {
  const options = eligible(s, ctx);
  const due = options.get('review-due');
  if (due?.arm === 'review-due') {
    const q = s.questions[due.questionId]!;
    if (ctx.now - q.due >= OVERDUE_FIRST_MS) return { ...due, reason: 'overdue for review' };
  }
  let arms = [...options.keys()];
  if (ctx.wrongInARow >= MAX_WRONG_IN_A_ROW) {
    const easier = arms.filter((a) => a === 'hint' || a === 'new-easy');
    if (easier.length) arms = easier;
  }
  if (arms.length === 0) return null;
  let best: ArmId = arms[0]!;
  let bestDraw = -1;
  for (const a of arms) {
    const { alpha, beta: b } = armOf(s, a);
    const draw = beta(rng, alpha, b);
    if (draw > bestDraw) {
      best = a;
      bestDraw = draw;
    }
  }
  return options.get(best)!;
}

export interface Outcome {
  correct: boolean;
  hintsUsed: number;
  maxHints: number;
  /** Seconds to answer; used only to tune the picker, never shown or scored. */
  seconds?: number;
}

export const REWARD_WEIGHTS = { correct: 0.5, hints: 0.2, speed: 0.1, retention: 0.2 } as const;

/** 1 at 10 s or less, 0 at 60 s or more, linear between. Missing time counts as neutral (0.5). */
export const speedScore = (seconds?: number): number =>
  seconds === undefined ? 0.5 : Math.min(1, Math.max(0, 1 - (seconds - 10) / 50));

/** Immediate reward in [0, 1]; the retention part is credited later (creditRetention). */
export function reward(o: Outcome): number {
  const hintPart = o.maxHints > 0 ? 1 - Math.min(o.hintsUsed, o.maxHints) / o.maxHints : 1;
  return (
    REWARD_WEIGHTS.correct * (o.correct ? 1 : 0) +
    REWARD_WEIGHTS.hints * hintPart +
    REWARD_WEIGHTS.speed * speedScore(o.seconds)
  );
}

/** Beta update with a fractional reward. */
export function updateArm(s: LearnerState, arm: ArmId, r: number): LearnerState {
  const a = armOf(s, arm);
  const rr = Math.min(1, Math.max(0, r));
  return { ...s, arms: { ...s.arms, [arm]: { alpha: a.alpha + rr, beta: a.beta + (1 - rr) } } };
}

/**
 * Delayed retention bonus: when a review is answered correctly at or after its due time, the arm that
 * first introduced the item gets the retention share as extra success.
 */
export function creditRetention(s: LearnerState, introducedBy: ArmId | undefined): LearnerState {
  if (!introducedBy) return s;
  const a = armOf(s, introducedBy);
  return {
    ...s,
    arms: { ...s.arms, [introducedBy]: { alpha: a.alpha + REWARD_WEIGHTS.retention, beta: a.beta } },
  };
}
