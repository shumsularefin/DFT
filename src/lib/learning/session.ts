/**
 * Glue between the tested learning models and the UI: record an answer, build the policy
 * context, and read mastery. Pure functions, no storage, no DOM.
 * @source S-037 (BKT, Rasch), S-038 (SM-2), S-039 (Thompson sampling). How they are combined
 * here (one event updates every concept the question lists; "I am not sure" counts as a
 * wrong answer with quality 1) is an engineering choice, D-076.
 */
import { DEFAULT_BKT, MASTERY_PL, update as bktUpdate } from './bkt';
import { readyToLearn, type Concept } from './graph';
import { updateElo } from './irt';
import {
  delayedRetentionUpdate,
  newBandit,
  reward,
  updateBandit,
  type Arm,
  type BanditState,
  type PolicyContext,
} from './policy';
import { INITIAL_SM2, qualityFromOutcome, review } from './sm2';
import { addEvent, newConcept, newQuestion, type LearnerState } from './state';

export const MAX_HINTS = 2;
const DAY_MS = 86_400_000;

/** The slice of a question the engine needs (the full Question satisfies it). */
export interface BankQuestion {
  id: string;
  concepts: readonly string[];
  difficulty: number;
  hints: readonly string[];
}

/** Engine memory that is not part of LearnerState: the bandit, who showed what, the wrong streak. */
export interface PracticeMeta {
  bandit: BanditState;
  /** The arm that first showed each question, for the delayed retention credit. */
  origin: Record<string, Arm>;
  wrongStreak: number;
}

export const newMeta = (): PracticeMeta => ({ bandit: newBandit(), origin: {}, wrongStreak: 0 });

/** Whole local days since the epoch. `offsetMin` is Date.getTimezoneOffset() (minutes behind UTC). */
export function dayNumber(ms: number, offsetMin: number = new Date(ms).getTimezoneOffset()): number {
  return Math.floor((ms - offsetMin * 60_000) / DAY_MS);
}

export interface AnswerInput {
  correct: boolean;
  hintsUsed: number;
  gaveUp?: boolean;
  /** The arm that showed the question, when the practice page chose it. */
  arm?: Arm | null;
  nowMs: number;
}

export interface AnswerResult {
  learner: LearnerState;
  meta: PracticeMeta;
}

/** Apply one answer: BKT and Rasch per concept, SM-2 for the question, bandit for the arm. */
export function recordAnswer(
  learner: LearnerState,
  meta: PracticeMeta,
  q: BankQuestion,
  a: AnswerInput,
): AnswerResult {
  const day = dayNumber(a.nowMs);
  const prior = learner.questions[q.id];
  const qs = prior ?? { ...newQuestion(), b: q.difficulty };
  const concepts = { ...learner.concepts };
  const theta = meanTheta(learner);
  const elo = updateElo(theta, qs.b, a.correct);
  for (const c of q.concepts) {
    const cs = concepts[c] ?? newConcept();
    concepts[c] = {
      ...addEvent(cs, { t: a.nowMs, q: q.id, correct: a.correct }),
      pL: bktUpdate(cs.pL, a.correct, DEFAULT_BKT),
      theta: cs.theta + (elo.theta - theta),
    };
  }
  const sm = review(
    { n: qs.n, interval: qs.interval, ef: qs.ef },
    qualityFromOutcome(a.correct, a.hintsUsed, a.gaveUp),
  );
  const wasDue = !!prior && prior.due > 0 && prior.due <= day;
  const questions = {
    ...learner.questions,
    [q.id]: { b: elo.b, ...sm, due: day + sm.interval, lastSeen: a.nowMs },
  };

  let bandit = meta.bandit;
  const origin = { ...meta.origin };
  if (a.arm) {
    bandit = updateBandit(
      bandit,
      a.arm,
      reward({
        correct: a.correct,
        hintsUsed: a.hintsUsed,
        maxHints: MAX_HINTS,
        speedScore: 0.5,
        retentionBonus: 0,
      }),
    );
    if (!origin[q.id]) origin[q.id] = a.arm;
    if (wasDue && a.arm === 'review-due' && origin[q.id]) {
      bandit = delayedRetentionUpdate(bandit, origin[q.id] as Arm, a.correct);
    }
  }
  return {
    learner: { ...learner, concepts, questions },
    meta: { bandit, origin, wrongStreak: a.correct ? 0 : meta.wrongStreak + 1 },
  };
}

/** The learner's overall ability: the mean of the per-concept thetas seen so far (0 if none). */
export function meanTheta(s: LearnerState): number {
  const t = Object.values(s.concepts).map((c) => c.theta);
  return t.length === 0 ? 0 : t.reduce((x, y) => x + y, 0) / t.length;
}

/** BKT probability per concept for the concepts seen so far. */
export function masteryMap(s: LearnerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, c] of Object.entries(s.concepts)) out[id] = c.pL;
  return out;
}

export type MasteryState = 'new' | 'learning' | 'mastered';

/** Three display states. "new" means no answer yet, whatever the prior is. */
export function stateOf(s: LearnerState, concept: string): MasteryState {
  const c = s.concepts[concept];
  if (!c || c.attempts === 0) return 'new';
  return c.pL >= MASTERY_PL ? 'mastered' : 'learning';
}

/** A topic is complete when every concept it teaches has reached the mastery threshold. */
export function topicMastered(s: LearnerState, concepts: readonly string[]): boolean {
  return concepts.length > 0 && concepts.every((c) => (s.concepts[c]?.pL ?? 0) >= MASTERY_PL);
}

export interface BuildInput {
  learner: LearnerState;
  meta: PracticeMeta;
  bank: readonly BankQuestion[];
  concepts: readonly Concept[];
  nowMs: number;
  /** Open question that was answered wrongly and still has an unused hint. */
  hintAvailable: boolean;
}

/** Context for `choose`: published concepts only, unseen questions as "new" practice. */
export function buildContext(i: BuildInput): PolicyContext {
  const day = dayNumber(i.nowMs);
  const published = new Set(i.concepts.filter((c) => c.status === 'published').map((c) => c.id));
  const usable = i.bank.filter((q) => q.concepts.some((c) => published.has(c)));
  const unseen = usable.filter((q) => !i.learner.questions[q.id]);
  const pool = unseen.length > 0 ? unseen : usable;
  const mastery: Record<string, number> = {};
  for (const c of i.concepts) mastery[c.id] = i.learner.concepts[c.id]?.pL ?? DEFAULT_BKT.pL0;
  const prerequisites: Record<string, string[]> = {};
  for (const c of i.concepts) prerequisites[c.id] = c.prerequisites;
  return {
    theta: meanTheta(i.learner),
    mastery,
    prerequisites,
    candidates: pool.map((q) => ({
      id: q.id,
      concept: q.concepts.find((c) => published.has(c)) ?? (q.concepts[0] as string),
      b: i.learner.questions[q.id]?.b ?? q.difficulty,
    })),
    dueReviews: Object.entries(i.learner.questions)
      .filter(([id, s]) => s.due > 0 && s.due <= day && usable.some((q) => q.id === id))
      .map(([id, s]) => ({ id, overdueDays: day - s.due })),
    consecutiveWrong: i.meta.wrongStreak,
    hintAvailable: i.hintAvailable,
    readyConcepts: readyToLearn(i.concepts, mastery),
  };
}

/** Number of questions due for review on the day of `nowMs`. */
export function dueCount(learner: LearnerState, bank: readonly BankQuestion[], nowMs: number): number {
  const day = dayNumber(nowMs);
  const ids = new Set(bank.map((q) => q.id));
  return Object.entries(learner.questions).filter(([id, s]) => ids.has(id) && s.due > 0 && s.due <= day)
    .length;
}

export { INITIAL_SM2 };
