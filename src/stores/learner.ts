import { createStore } from 'zustand/vanilla';
import { canPersist, getJSON, remove, setJSON } from '../lib/storage';
import { emptyActivity, parseActivity, recordActivity, type Activity } from '../lib/learning/activity';
import { ARMS, newBandit, type BanditState } from '../lib/learning/policy';
import {
  dayNumber,
  newMeta,
  recordAnswer,
  type AnswerInput,
  type BankQuestion,
  type PracticeMeta,
} from '../lib/learning/session';
import { deserialize, emptyState, serialize, type LearnerState } from '../lib/learning/state';
import { parseProgress } from '../lib/progress';
import { progressStore, resetProgress } from './progress';

export interface LearnerStore {
  learner: LearnerState;
  meta: PracticeMeta;
  activity: Activity;
  /** False once a write to storage has failed: progress then lasts only for this tab. */
  persisted: boolean;
}

export const EXPORT_FORMAT = 'dft-learner-export';
export const MAX_IMPORT_BYTES = 5_000_000;

function parseLearner(value: unknown): LearnerState {
  try {
    return deserialize(JSON.stringify(value));
  } catch {
    return emptyState();
  }
}

/** A bandit with finite positive alpha and beta for every arm, or a fresh one. */
export function parseBandit(value: unknown): BanditState {
  const o = value as Record<string, { alpha?: unknown; beta?: unknown }> | null;
  if (!o || typeof o !== 'object') return newBandit();
  const out = newBandit();
  for (const arm of ARMS) {
    const p = o[arm];
    const ok =
      p &&
      typeof p.alpha === 'number' &&
      typeof p.beta === 'number' &&
      Number.isFinite(p.alpha) &&
      Number.isFinite(p.beta) &&
      p.alpha > 0 &&
      p.beta > 0;
    if (!ok) return newBandit();
    out[arm] = { alpha: p.alpha as number, beta: p.beta as number };
  }
  return out;
}

export function parseMeta(value: unknown): PracticeMeta {
  const o = value as Partial<PracticeMeta> | null;
  if (!o || typeof o !== 'object') return newMeta();
  const origin: Record<string, (typeof ARMS)[number]> = {};
  if (o.origin && typeof o.origin === 'object') {
    for (const [k, v] of Object.entries(o.origin)) if ((ARMS as readonly string[]).includes(v)) origin[k] = v;
  }
  return {
    bandit: parseBandit(o.bandit),
    origin,
    wrongStreak:
      Number.isInteger(o.wrongStreak) && (o.wrongStreak as number) >= 0 ? (o.wrongStreak as number) : 0,
  };
}

export const learnerStore = createStore<LearnerStore>(() => ({
  learner: parseLearner(getJSON<unknown>('learner', null)),
  meta: parseMeta(getJSON<unknown>('practice-meta', null)),
  activity: parseActivity(getJSON<unknown>('activity', null)),
  persisted: canPersist(),
}));

function persist(next: LearnerStore): void {
  const ok = [
    setJSON('learner', next.learner),
    setJSON('practice-meta', next.meta),
    setJSON('activity', next.activity),
  ].every(Boolean);
  learnerStore.setState({ ...next, persisted: ok }, true);
}

/** Replace the learner state, for example with the result of a sync merge. */
export function setLearner(learner: LearnerState): void {
  persist({ ...learnerStore.getState(), learner });
}

/** Record one answer for the question and return the new store state. */
export function answerQuestion(q: BankQuestion, input: Omit<AnswerInput, 'nowMs'>): LearnerStore {
  const s = learnerStore.getState();
  const nowMs = Date.now();
  const r = recordAnswer(s.learner, s.meta, q, { ...input, nowMs });
  persist({ ...s, learner: r.learner, meta: r.meta, activity: recordActivity(s.activity, dayNumber(nowMs)) });
  return learnerStore.getState();
}

export function setHideStreaks(hide: boolean): void {
  const s = learnerStore.getState();
  persist({ ...s, activity: { ...s.activity, hideStreaks: hide } });
}

/** Erase practice data, the streak and topic progress on this device. */
export function resetAll(): void {
  for (const k of ['learner', 'practice-meta', 'activity']) remove(k);
  learnerStore.setState(
    { learner: emptyState(), meta: newMeta(), activity: emptyActivity(), persisted: true },
    true,
  );
  resetProgress();
}

export function exportData(): string {
  const s = learnerStore.getState();
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      exported: new Date().toISOString(),
      learner: JSON.parse(serialize(s.learner)),
      meta: s.meta,
      activity: s.activity,
      progress: progressStore.getState(),
    },
    null,
    2,
  );
}

export type ImportResult = { ok: true } | { ok: false; error: string };

/** Validate a file made by exportData, then replace the current data with it. Nothing is changed on error. */
export function importData(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'This file is larger than 5 MB.' };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object' || raw.format !== EXPORT_FORMAT || raw.version !== 1) {
    return {
      ok: false,
      error: 'This is not a progress file exported from this site (or its version is not supported).',
    };
  }
  let learner: LearnerState;
  try {
    learner = deserialize(JSON.stringify(raw.learner));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const progress = parseProgress(raw.progress);
  persist({ learner, meta: parseMeta(raw.meta), activity: parseActivity(raw.activity), persisted: true });
  progressStore.setState(progress, true);
  setJSON('progress', progress);
  return { ok: true };
}
