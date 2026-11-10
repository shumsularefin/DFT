/**
 * SM-2 spaced repetition with this project's precise conventions (D-052).
 * @source S-038 (Wozniak 1990).
 */
export interface Sm2State {
  /** Successful repetitions in a row. */
  n: number;
  /** Current interval in days. */
  interval: number;
  /** Easiness factor. */
  ef: number;
}

export const INITIAL_SM2: Sm2State = { n: 0, interval: 0, ef: 2.5 };
export const EF_MIN = 1.3;

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export function review(state: Sm2State, q: number): Sm2State {
  if (!Number.isInteger(q) || q < 0 || q > 5)
    throw new RangeError(`SM-2 quality must be an integer 0..5, got ${q}`);
  if (q < 3) return { n: 0, interval: 1, ef: state.ef };
  const n = state.n + 1;
  // The interval uses the EF from before this review's update.
  const interval = n === 1 ? 1 : n === 2 ? 6 : Math.round(state.interval * state.ef);
  const ef = Math.max(EF_MIN, state.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { n, interval, ef };
}

/** Quiz outcome to SM-2 quality (convention, D-052). */
export function qualityFromOutcome(correct: boolean, hintsUsed: number, gaveUp = false): Quality {
  if (!correct) return gaveUp ? 1 : 2;
  return hintsUsed <= 0 ? 5 : hintsUsed === 1 ? 4 : 3;
}
