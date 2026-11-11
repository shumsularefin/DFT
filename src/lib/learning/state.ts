// The learner state (M6.2): versioned, JSON-serializable, size-capped, and mergeable for sync (M6.5).
import { BKT_DEFAULTS, update as bktUpdate } from './bkt';
import { eloUpdate } from './irt';
import { quality, review, SM2_START, type Sm2 } from './sm2';

export const STATE_VERSION = 1;
export const HISTORY_CAP = 200;
const DAY_MS = 86_400_000;

export interface AnswerEvent {
  /** Epoch milliseconds. */
  t: number;
  q: string;
  correct: boolean;
  hints: number;
}

export interface ConceptState {
  pL: number;
  theta: number;
  attempts: number;
  lastSeen: number;
  history: AnswerEvent[];
}

export interface QuestionState extends Sm2 {
  b: number;
  /** Epoch milliseconds when the item is due for review. */
  due: number;
  lastReviewed: number;
  /** The policy arm that first showed this question (for the delayed retention bonus, M6.3). */
  introducedBy?: string;
}

export interface Arm {
  alpha: number;
  beta: number;
}

export interface LearnerState {
  version: typeof STATE_VERSION;
  updatedAt: number;
  concepts: Record<string, ConceptState>;
  questions: Record<string, QuestionState>;
  /** Thompson-sampling posteriors per arm (M6.3). */
  arms: Record<string, Arm>;
  /** Local calendar days (YYYY-MM-DD) with at least one answer, for the gentle streak (M6.4). */
  activeDays: string[];
  settings: { hideStreak: boolean };
}

export const emptyState = (): LearnerState => ({
  version: STATE_VERSION,
  updatedAt: 0,
  concepts: {},
  questions: {},
  arms: {},
  activeDays: [],
  settings: { hideStreak: false },
});

export const newConcept = (): ConceptState => ({
  pL: BKT_DEFAULTS.pL0,
  theta: 0,
  attempts: 0,
  lastSeen: 0,
  history: [],
});

export const newQuestion = (difficulty: number): QuestionState => ({
  ...SM2_START,
  b: difficulty,
  due: 0,
  lastReviewed: 0,
});

export const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface AnswerInput {
  questionId: string;
  concepts: string[];
  difficulty: number;
  correct: boolean;
  hints: number;
  gaveUp?: boolean;
  now: number;
  /** The policy arm that chose this question, if any. */
  arm?: string;
}

/** Applies one answer: BKT and Elo per concept, Elo item difficulty and SM-2 for the question. Pure. */
export function applyAnswer(s: LearnerState, a: AnswerInput): LearnerState {
  const concepts = { ...s.concepts };
  const prevQ = s.questions[a.questionId] ?? newQuestion(a.difficulty);
  let b = prevQ.b;
  for (const id of a.concepts) {
    const c = concepts[id] ?? newConcept();
    const elo = eloUpdate(c.theta, prevQ.b, a.correct);
    b += elo.b - prevQ.b;
    const history = [...c.history, { t: a.now, q: a.questionId, correct: a.correct, hints: a.hints }].slice(
      -HISTORY_CAP,
    );
    concepts[id] = {
      pL: bktUpdate(c.pL, a.correct),
      theta: elo.theta,
      attempts: c.attempts + 1,
      lastSeen: a.now,
      history,
    };
  }
  // With several concepts the item moves once per concept, averaged so multi-concept items do not drift faster.
  b = prevQ.b + (b - prevQ.b) / Math.max(1, a.concepts.length);
  const sm = review(prevQ, quality(a.correct, a.hints, a.gaveUp));
  const questions = {
    ...s.questions,
    [a.questionId]: { ...sm, b, due: a.now + sm.interval * DAY_MS, lastReviewed: a.now },
  };
  const day = dayKey(a.now);
  const activeDays = s.activeDays.includes(day) ? s.activeDays : [...s.activeDays, day].sort();
  return { ...s, concepts, questions, activeDays, updatedAt: Math.max(s.updatedAt, a.now) };
}

// ---------- merge (sync) ----------

/** Deterministic tie-break so merge stays commutative when timestamps are equal. */
const later = <T>(a: T, b: T, ta: number, tb: number): T => {
  if (ta !== tb) return ta > tb ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
};

const mergeHistory = (a: AnswerEvent[], b: AnswerEvent[]): AnswerEvent[] => {
  const key = (e: AnswerEvent) => `${e.t}|${e.q}|${e.correct ? 1 : 0}|${e.hints}`;
  const all = new Map<string, AnswerEvent>();
  for (const e of [...a, ...b]) all.set(key(e), e);
  return [...all.values()].sort((x, y) => x.t - y.t || key(x).localeCompare(key(y))).slice(-HISTORY_CAP);
};

/** `pick` also receives one-sided records (with itself), so every merged record is normalized the same way. */
function mergeRecords<T>(
  a: Record<string, T>,
  b: Record<string, T>,
  pick: (x: T, y: T) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const x = a[k] ?? b[k]!;
    const y = b[k] ?? x;
    out[k] = pick(x, y);
  }
  return out;
}

/**
 * Merges two learner states (for example this device and the synced copy). Per concept and per question
 * the most recently updated record wins; answer histories are unioned. Commutative and idempotent.
 */
export function merge(a: LearnerState, b: LearnerState): LearnerState {
  return {
    version: STATE_VERSION,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    concepts: mergeRecords(a.concepts, b.concepts, (x, y) => ({
      ...later(x, y, x.lastSeen, y.lastSeen),
      history: mergeHistory(x.history, y.history),
    })),
    questions: mergeRecords(a.questions, b.questions, (x, y) => later(x, y, x.lastReviewed, y.lastReviewed)),
    arms: mergeRecords(a.arms, b.arms, (x, y) => later(x, y, x.alpha + x.beta, y.alpha + y.beta)),
    activeDays: [...new Set([...a.activeDays, ...b.activeDays])].sort(),
    settings: later(a.settings, b.settings, a.updatedAt, b.updatedAt),
  };
}

// ---------- serialization ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses and validates a stored or imported state; returns null when it is not a valid learner state. */
export function parseState(raw: unknown): LearnerState | null {
  if (!isObj(raw) || raw.version !== STATE_VERSION || !isNum(raw.updatedAt)) return null;
  const { concepts, questions, arms, activeDays, settings } = raw;
  if (!isObj(concepts) || !isObj(questions) || !isObj(arms) || !Array.isArray(activeDays) || !isObj(settings))
    return null;
  for (const c of Object.values(concepts)) {
    if (!isObj(c) || ![c.pL, c.theta, c.attempts, c.lastSeen].every(isNum) || !Array.isArray(c.history))
      return null;
    if ((c.pL as number) < 0 || (c.pL as number) > 1) return null;
    for (const e of c.history as unknown[])
      if (
        !isObj(e) ||
        !isNum(e.t) ||
        typeof e.q !== 'string' ||
        typeof e.correct !== 'boolean' ||
        !isNum(e.hints)
      )
        return null;
  }
  for (const q of Object.values(questions))
    if (!isObj(q) || ![q.n, q.interval, q.ef, q.b, q.due, q.lastReviewed].every(isNum)) return null;
    else if (q.introducedBy !== undefined && typeof q.introducedBy !== 'string') return null;
  for (const a of Object.values(arms)) if (!isObj(a) || !isNum(a.alpha) || !isNum(a.beta)) return null;
  if (!activeDays.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) return null;
  if (typeof settings.hideStreak !== 'boolean') return null;
  const s = raw as unknown as LearnerState;
  // Enforce the cap on import as well, so a hand-edited file cannot grow the document without bound.
  for (const c of Object.values(s.concepts)) c.history = c.history.slice(-HISTORY_CAP);
  return s;
}

export const serialize = (s: LearnerState): string => JSON.stringify(s);
