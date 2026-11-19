/**
 * Gentle motivation: a streak that forgives rest days, and milestones. No timers, no
 * leaderboards, and nothing is ever shown as "lost". A streak chain may miss one day in
 * any 7 (one free rest day per 7). These are design conventions, not science (D-064).
 */
export const ACTIVITY_VERSION = 1;
export const MAX_ACTIVE_DAYS = 400;

export interface Activity {
  version: number;
  /** Distinct local day numbers with at least one answer, ascending, newest last. */
  days: number[];
  /** Answers given on any practice or check question (total, not capped). */
  answers: number;
  /** Learner setting: hide the streak everywhere. */
  hideStreaks: boolean;
}

export const emptyActivity = (): Activity => ({
  version: ACTIVITY_VERSION,
  days: [],
  answers: 0,
  hideStreaks: false,
});

export function recordActivity(a: Activity, day: number): Activity {
  const days = a.days.includes(day) ? a.days : [...a.days, day].sort((x, y) => x - y).slice(-MAX_ACTIVE_DAYS);
  return { ...a, days, answers: a.answers + 1 };
}

/**
 * Length of the current run, in active days. The run is alive while the newest active day is
 * today, yesterday, or (using the free rest day) the day before. Walking back, a single missed
 * day is forgiven if no other day was forgiven within the previous 7 days; two missed days in
 * a row end the run. Returns 0 when there is no live run (the UI then says nothing negative).
 */
export function streak(days: readonly number[], today: number): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let d = today;
  let forgivenAt: number | null = null;
  // Today not done yet is not a miss: start from yesterday.
  if (!set.has(d)) d -= 1;
  let count = 0;
  let steps = 0;
  while (steps < 800) {
    steps += 1;
    if (set.has(d)) {
      count += 1;
      d -= 1;
      continue;
    }
    // d is a missed day. Forgive it only if the day before was active and the free day is unused.
    const free = forgivenAt === null || forgivenAt - d >= 7;
    if (free && set.has(d - 1)) {
      forgivenAt = d;
      d -= 1;
      continue;
    }
    break;
  }
  return count;
}

export interface Milestone {
  id: string;
  label: string;
  reached: boolean;
}

/** Milestones are derived from counts, so nothing is stored and nothing can be "lost". */
export function milestones(answers: number, modulesDone: number): Milestone[] {
  return [
    { id: 'first-answer', label: 'Answered your first question', reached: answers >= 1 },
    { id: 'first-module', label: 'Finished your first module', reached: modulesDone >= 1 },
    { id: 'fifty-answers', label: 'Answered 50 questions', reached: answers >= 50 },
  ];
}

export function parseActivity(value: unknown): Activity {
  const o = value as Partial<Activity> | null;
  if (!o || typeof o !== 'object' || o.version !== ACTIVITY_VERSION) return emptyActivity();
  const days = Array.isArray(o.days) ? o.days.filter((x) => Number.isInteger(x)) : [];
  return {
    version: ACTIVITY_VERSION,
    days: [...new Set(days)].sort((x, y) => x - y).slice(-MAX_ACTIVE_DAYS),
    answers: Number.isInteger(o.answers) && (o.answers as number) >= 0 ? (o.answers as number) : 0,
    hideStreaks: o.hideStreaks === true,
  };
}
