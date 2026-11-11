// Learner state store (M6.4): the adaptive engine's memory, persisted with storage.ts. When storage is
// blocked the state lives for this page session only and `persisted` is false so the UI can say so.
import { createStore } from 'zustand/vanilla';
import { getJSON, remove, setJSON } from '../lib/storage';
import { isMastered } from '../lib/learning/bkt';
import { creditRetention, reward, updateArm, type ArmId } from '../lib/learning/policy';
import {
  applyAnswer,
  emptyState,
  merge,
  parseState,
  serialize,
  type LearnerState,
} from '../lib/learning/state';

const KEY = 'learner';

export interface LearnerStore {
  state: LearnerState;
  persisted: boolean;
}

const probe = (): boolean => setJSON('probe', 1) && (remove('probe'), true);

export const learnerStore = createStore<LearnerStore>(() => ({
  state: parseState(getJSON<unknown>(KEY, null)) ?? emptyState(),
  persisted: probe(),
}));

function commit(state: LearnerState) {
  const persisted = setJSON(KEY, state);
  learnerStore.setState({ state, persisted }, true);
}

export interface AnswerRecord {
  questionId: string;
  concepts: string[];
  difficulty: number;
  correct: boolean;
  hints: number;
  maxHints: number;
  gaveUp?: boolean;
  seconds?: number;
  /** The practice-policy arm that chose the question; absent inside topic pages. */
  arm?: ArmId;
  now?: number;
}

export function recordAnswer(a: AnswerRecord): LearnerState {
  const now = a.now ?? Date.now();
  const before = learnerStore.getState().state;
  const prevQ = before.questions[a.questionId];
  let s = applyAnswer(before, { ...a, now });
  if (a.arm) {
    s = updateArm(
      s,
      a.arm,
      reward({ correct: a.correct, hintsUsed: a.hints, maxHints: a.maxHints, seconds: a.seconds }),
    );
    if (a.arm === 'review-due' && a.correct && prevQ && now >= prevQ.due)
      s = creditRetention(s, prevQ.introducedBy as ArmId | undefined);
  }
  commit(s);
  return s;
}

/** Every listed concept has reached mastery. */
export const allMastered = (concepts: readonly string[], s = learnerStore.getState().state): boolean =>
  concepts.length > 0 && concepts.every((c) => isMastered(s.concepts[c]?.pL ?? 0));

export const setHideStreak = (hide: boolean) => {
  const s = learnerStore.getState().state;
  commit({ ...s, settings: { ...s.settings, hideStreak: hide }, updatedAt: Date.now() });
};

export const exportLearner = (): string => serialize(learnerStore.getState().state);

/** Imports a JSON export, merging it with the current state. Returns an error message or null. */
export function importLearner(text: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'This file is not valid JSON.';
  }
  const parsed = parseState(raw);
  if (!parsed)
    return 'This file is not a progress export from this site (or it was edited and no longer matches).';
  commit(merge(learnerStore.getState().state, parsed));
  return null;
}

/** Replaces the state wholesale (used by sync after merging). */
export const replaceLearner = (s: LearnerState) => commit(s);

export function resetLearner(): void {
  remove(KEY);
  learnerStore.setState({ state: emptyState(), persisted: learnerStore.getState().persisted }, true);
}
