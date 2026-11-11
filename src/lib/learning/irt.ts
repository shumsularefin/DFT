// Rasch model with Elo-style updates (S-037 for the learner model it feeds; K values are conventions, D-052).
export const K_LEARNER = 0.4;
export const K_ITEM = 0.05;

/** Probability of a correct answer for ability theta on an item of difficulty b (logits). */
export const pCorrect = (theta: number, b: number): number => 1 / (1 + Math.exp(-(theta - b)));

/** Moves the learner up and the item down after a correct answer (and the reverse after a wrong one). */
export function eloUpdate(theta: number, b: number, correct: boolean, k = K_LEARNER, kb = K_ITEM) {
  const surprise = (correct ? 1 : 0) - pCorrect(theta, b);
  return { theta: theta + k * surprise, b: b - kb * surprise };
}

/** The item difficulty at which the learner's chance of success equals `p` (inverse of pCorrect). */
export const difficultyFor = (theta: number, p: number): number => theta - Math.log(p / (1 - p));
