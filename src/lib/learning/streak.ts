// Gentle streaks and milestones (M6.4). No losses are ever reported: a missing day is either a rest day
// (one free day in any 7) or simply the start of a new streak.
import type { LearnerState } from './state';
import { dayKey } from './state';

const DAY_MS = 86_400_000;
export const FREE_DAY_WINDOW = 7;

/**
 * Current streak in active days, counting back from today. Today not yet practised does not end it.
 * A gap of one day is forgiven when no other day in the previous 7 was forgiven.
 */
export function streak(activeDays: readonly string[], now: number): { days: number; restDaysUsed: number } {
  const active = new Set(activeDays);
  let days = 0;
  let restDaysUsed = 0;
  let lastFree = -Infinity;
  let gapRun = 0;
  for (let i = active.has(dayKey(now)) ? 0 : 1; i < 3660; i++) {
    const key = dayKey(now - i * DAY_MS);
    if (active.has(key)) {
      days++;
      gapRun = 0;
      continue;
    }
    if (days > 0 && gapRun === 0 && i - lastFree >= FREE_DAY_WINDOW) {
      lastFree = i;
      restDaysUsed++;
      gapRun = 1;
      continue;
    }
    break;
  }
  // A rest day only counts if an active day lies beyond it.
  if (gapRun === 1) restDaysUsed--;
  return { days, restDaysUsed: Math.max(0, restDaysUsed) };
}

export interface Milestone {
  id: string;
  label: string;
  reached: boolean;
}

/** Milestones; `completedModules` is the number of modules whose topics are all complete. */
export function milestones(
  s: LearnerState,
  completedModules: number,
  isMastered: (pL: number) => boolean,
): Milestone[] {
  const answers = Object.values(s.concepts).reduce((n, c) => n + c.history.length, 0);
  const questionsSeen = Object.keys(s.questions).length;
  return [
    { id: 'first-answer', label: 'First question answered', reached: questionsSeen > 0 },
    {
      id: 'first-mastered',
      label: 'First concept mastered',
      reached: Object.values(s.concepts).some((c) => isMastered(c.pL)),
    },
    { id: 'first-module', label: 'First module complete', reached: completedModules > 0 },
    { id: 'fifty-reviews', label: 'First 50 answers', reached: answers >= 50 },
  ];
}
