// Bayesian knowledge tracing (S-037). Defaults and the mastery threshold are conventions (D-052).
export interface BktParams {
  /** Prior probability that the concept is already known. */
  pL0: number;
  /** Probability of learning it at each practice opportunity. */
  pT: number;
  /** Slip: knows it but answers wrong. */
  pS: number;
  /** Guess: does not know it but answers right. */
  pG: number;
}

export const BKT_DEFAULTS: BktParams = { pL0: 0.3, pT: 0.1, pS: 0.1, pG: 0.2 };
export const MASTERY_THRESHOLD = 0.95;

/** Posterior probability of knowing the concept after observing one answer (before learning). */
export function posterior(pL: number, correct: boolean, p: BktParams = BKT_DEFAULTS): number {
  return correct
    ? (pL * (1 - p.pS)) / (pL * (1 - p.pS) + (1 - pL) * p.pG)
    : (pL * p.pS) / (pL * p.pS + (1 - pL) * (1 - p.pG));
}

/** One BKT step: Bayes update on the answer, then the learning transition. */
export function update(pL: number, correct: boolean, p: BktParams = BKT_DEFAULTS): number {
  const post = posterior(pL, correct, p);
  return post + (1 - post) * p.pT;
}

export const isMastered = (pL: number): boolean => pL >= MASTERY_THRESHOLD;
