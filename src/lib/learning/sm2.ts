// SM-2 spaced repetition (S-038) with this project's precise conventions (M6.2, D-052).
export interface Sm2 {
  /** Repetitions in a row with quality >= 3. */
  n: number;
  /** Current interval in days. */
  interval: number;
  /** Easiness factor, never below 1.3. */
  ef: number;
}

export const SM2_START: Sm2 = { n: 0, interval: 0, ef: 2.5 };
export const EF_MIN = 1.3;

export function review(s: Sm2, q: number): Sm2 {
  if (!Number.isInteger(q) || q < 0 || q > 5)
    throw new RangeError(`SM-2 quality must be an integer 0..5, got ${q}`);
  if (q < 3) return { n: 0, interval: 1, ef: s.ef };
  const n = s.n + 1;
  // The interval uses the EF from before this review's update.
  const interval = n === 1 ? 1 : n === 2 ? 6 : Math.round(s.interval * s.ef);
  const ef = Math.max(EF_MIN, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { n, interval, ef };
}

/** Quiz outcome to SM-2 quality (convention, D-052). */
export function quality(correct: boolean, hintsUsed: number, gaveUp = false): number {
  if (correct) return hintsUsed === 0 ? 5 : hintsUsed === 1 ? 4 : 3;
  return gaveUp ? 1 : 2;
}
