/**
 * Rasch / Elo style ability and difficulty estimates.
 * @source S-037 (the knowledge-tracing family this site uses). The K values are teaching
 * conventions (D-052), not fitted constants.
 */
export const K_THETA = 0.4;
export const K_B = 0.05;

export function pCorrect(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b)));
}

/** One response: the learner moves fast, the item difficulty moves slowly. */
export function updateElo(
  theta: number,
  b: number,
  correct: boolean,
  kTheta: number = K_THETA,
  kB: number = K_B,
): { theta: number; b: number; p: number } {
  const p = pCorrect(theta, b);
  const err = (correct ? 1 : 0) - p;
  return { theta: theta + kTheta * err, b: b - kB * err, p };
}
