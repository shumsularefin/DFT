/**
 * Bayesian knowledge tracing (BKT), one skill at a time.
 * @source S-037 (Corbett and Anderson 1994). The default parameters and the 0.95 mastery
 * threshold are teaching conventions (D-052), not measured values.
 */
export interface BktParams {
  /** Prior probability the learner already knows the concept. */
  pL0: number;
  /** Probability of learning the concept at each opportunity. */
  pT: number;
  /** Slip: knows it but answers wrong. */
  pS: number;
  /** Guess: does not know it but answers right. */
  pG: number;
}

export const DEFAULT_BKT: BktParams = { pL0: 0.3, pT: 0.1, pS: 0.1, pG: 0.2 };
/** Conventional BKT mastery criterion (convention, D-052). */
export const MASTERY_PL = 0.95;

function check(p: BktParams): void {
  for (const [k, v] of Object.entries(p)) {
    if (!(v >= 0 && v <= 1)) throw new RangeError(`BKT parameter ${k} must be in [0, 1], got ${v}`);
  }
}

/** Posterior given the response, then the learning transition. */
export function update(pL: number, correct: boolean, params: BktParams = DEFAULT_BKT): number {
  check(params);
  if (!(pL >= 0 && pL <= 1)) throw new RangeError(`pL must be in [0, 1], got ${pL}`);
  const { pT, pS, pG } = params;
  const num = correct ? pL * (1 - pS) : pL * pS;
  const den = correct ? pL * (1 - pS) + (1 - pL) * pG : pL * pS + (1 - pL) * (1 - pG);
  const post = den === 0 ? pL : num / den;
  return post + (1 - post) * pT;
}

export function isMastered(pL: number, threshold: number = MASTERY_PL): boolean {
  return pL >= threshold;
}
