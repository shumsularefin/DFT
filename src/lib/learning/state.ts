/**
 * Learner state: versioned, serialisable, size capped, mergeable (M6.5 sync).
 * @source S-037, S-038 for the quantities stored. The storage layout and the merge rule are
 * engineering choices (D-052).
 */
import { DEFAULT_BKT } from './bkt';
import { INITIAL_SM2 } from './sm2';

export const STATE_VERSION = 1;
export const MAX_EVENTS_PER_CONCEPT = 200;

export interface LearnEvent {
  /** Epoch milliseconds. */
  t: number;
  /** Question id. */
  q: string;
  correct: boolean;
}

export interface ConceptState {
  pL: number;
  theta: number;
  attempts: number;
  lastSeen: number;
  /** Most recent events only, pruned to MAX_EVENTS_PER_CONCEPT. */
  events: LearnEvent[];
}

export interface QuestionState {
  b: number;
  n: number;
  interval: number;
  ef: number;
  /** Epoch day number the question is next due. */
  due: number;
  lastSeen: number;
}

export interface LearnerState {
  version: number;
  concepts: Record<string, ConceptState>;
  questions: Record<string, QuestionState>;
}

export function emptyState(): LearnerState {
  return { version: STATE_VERSION, concepts: {}, questions: {} };
}

export function newConcept(): ConceptState {
  return { pL: DEFAULT_BKT.pL0, theta: 0, attempts: 0, lastSeen: 0, events: [] };
}

export function newQuestion(): QuestionState {
  return { b: 0, n: INITIAL_SM2.n, interval: INITIAL_SM2.interval, ef: INITIAL_SM2.ef, due: 0, lastSeen: 0 };
}

const eventOrder = (a: LearnEvent, b: LearnEvent) =>
  a.t - b.t || (a.q < b.q ? -1 : a.q > b.q ? 1 : Number(a.correct) - Number(b.correct));

/** Keep only the newest MAX_EVENTS_PER_CONCEPT events, in time order. */
export function pruneEvents(events: LearnEvent[]): LearnEvent[] {
  const sorted = [...events].sort(eventOrder);
  return sorted.slice(Math.max(0, sorted.length - MAX_EVENTS_PER_CONCEPT));
}

/** Drop exact duplicate events, then prune. */
function dedupePrune(events: LearnEvent[]): LearnEvent[] {
  const seen = new Set<string>();
  const out: LearnEvent[] = [];
  for (const e of events) {
    const k = `${e.t}|${e.q}|${e.correct}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(e);
    }
  }
  return pruneEvents(out);
}

/** Append an event and prune. Returns a new concept state. */
export function addEvent(c: ConceptState, e: LearnEvent): ConceptState {
  return {
    ...c,
    events: pruneEvents([...c.events, e]),
    attempts: c.attempts + 1,
    lastSeen: Math.max(c.lastSeen, e.t),
  };
}

export function serialize(s: LearnerState): string {
  return JSON.stringify(s);
}

export function deserialize(text: string): LearnerState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Learner state is not valid JSON');
  }
  const o = raw as Partial<LearnerState> | null;
  if (!o || typeof o !== 'object' || o.version !== STATE_VERSION || !o.concepts || !o.questions) {
    throw new Error(`Learner state has an unsupported shape or version (expected version ${STATE_VERSION})`);
  }
  return { version: STATE_VERSION, concepts: o.concepts, questions: o.questions };
}

const key = (v: unknown) => JSON.stringify(v);

/** The record that wins: newer lastSeen, then a fixed tie-break so the choice is order independent. */
function newer<T extends { lastSeen: number }>(a: T, b: T): T {
  if (a.lastSeen !== b.lastSeen) return a.lastSeen > b.lastSeen ? a : b;
  return key(a) >= key(b) ? a : b;
}

function mergeConcept(a: ConceptState, b: ConceptState): ConceptState {
  const w = newer(a, b);
  return {
    pL: w.pL,
    theta: w.theta,
    lastSeen: Math.max(a.lastSeen, b.lastSeen),
    // Attempts survive pruning, so take the larger count rather than the event count.
    attempts: Math.max(a.attempts, b.attempts),
    events: dedupePrune([...a.events, ...b.events]),
  };
}

/** Commutative and idempotent merge of two learner states (for sync, M6.5). */
export function mergeStates(a: LearnerState, b: LearnerState): LearnerState {
  const concepts: Record<string, ConceptState> = {};
  for (const id of new Set([...Object.keys(a.concepts), ...Object.keys(b.concepts)])) {
    const x = a.concepts[id];
    const y = b.concepts[id];
    concepts[id] = x && y ? mergeConcept(x, y) : { ...(x ?? y!), events: dedupePrune((x ?? y!).events) };
  }
  const questions: Record<string, QuestionState> = {};
  for (const id of new Set([...Object.keys(a.questions), ...Object.keys(b.questions)])) {
    const x = a.questions[id];
    const y = b.questions[id];
    questions[id] = x && y ? newer(x, y) : { ...(x ?? y!) };
  }
  return { version: STATE_VERSION, concepts, questions };
}
