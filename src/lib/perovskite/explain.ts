/**
 * Plain-language explanations of t, mu and tau at each reading level.
 * All ranges are rules of thumb (Q-005); the text says so. No result is presented as a guarantee.
 */
import type { Level } from '../levels';
import { BARTEL_THRESHOLD } from './factors';
import { MU_MAX as MU_MAX_EXPORT, MU_MIN as MU_MIN_EXPORT } from './checks';

const fixed = (x: number, d: number) => x.toFixed(d);

export function explainT(t: number, level: Level): string {
  const where =
    t < 0.8
      ? 'below the range usually quoted for perovskites, so a distorted or different structure is more likely'
      : t <= 1.0
        ? 'inside the range of about 0.8 to 1.0 usually quoted for perovskites; the nearer to 1, the less the octahedra tilt'
        : 'above 1, where a hexagonal stacking of the layers is often favoured over the cubic perovskite';
  if (level === 'beginner') {
    return `Goldschmidt t compares how big the A ion is with how big the B ion is. Here t = ${fixed(t, 4)}, which is ${where}. It is a rule of thumb, not a guarantee.`;
  }
  if (level === 'intermediate') {
    return `t = (rA + rX) / (sqrt(2) (rB + rX)) asks whether the A ion fits the gaps between the corner-sharing octahedra. t = ${fixed(t, 4)} is ${where}. The ranges are rules of thumb.`;
  }
  return `t = ${fixed(t, 6)} from Shannon ionic radii (S-002). It is ${where}. The cut-offs are heuristic ranges (Q-005) and depend on the radii convention, including the coordination numbers chosen.`;
}

export function explainMu(mu: number, level: Level): string {
  const inside = mu >= MU_MIN_EXPORT && mu <= MU_MAX_EXPORT;
  const range = `${fixed(MU_MIN_EXPORT, 3)} to ${fixed(MU_MAX_EXPORT, 3)}`;
  const where = inside
    ? `inside the range ${range} where a six-coordinated B ion is expected to fit`
    : `outside the range ${range}, so the B ion may be too small or too large for an octahedral site`;
  if (level === 'beginner') {
    return `The octahedral factor compares the B ion with the anion. Here it is ${fixed(mu, 3)}, ${where}. This is a rule of thumb.`;
  }
  if (level === 'intermediate') {
    return `mu = rB / rX = ${fixed(mu, 4)} is ${where}. The limits are the radius-ratio limits for six-fold coordination (S-022).`;
  }
  return `mu = ${fixed(mu, 6)}; limits sqrt(2) - 1 = ${fixed(MU_MIN_EXPORT, 4)} and sqrt(3) - 1 = ${fixed(MU_MAX_EXPORT, 4)} from the radius-ratio rule (S-022), a heuristic that treats ions as hard spheres.`;
}

export function explainTau(value: number, predicts: boolean, level: Level): string {
  const verdict = predicts
    ? `below the threshold ${BARTEL_THRESHOLD}, so the model predicts a perovskite`
    : `not below the threshold ${BARTEL_THRESHOLD}, so the model predicts a non-perovskite`;
  if (level === 'beginner') {
    return `Bartel tau is a newer rule fitted to known compounds. Here tau = ${fixed(value, 2)}, ${verdict}. It is a prediction from past data, not a guarantee.`;
  }
  if (level === 'intermediate') {
    return `tau uses the oxidation state of A and all three radii. tau = ${fixed(value, 3)} is ${verdict}. It was fitted to a data set of known ABX3 compounds (S-003).`;
  }
  return `tau = ${fixed(value, 6)}: ${verdict} (S-003). The threshold is empirical. The term (rA/rB)/ln(rA/rB) grows without bound as rA/rB approaches 1, where tau is undefined.`;
}

export const FORMULAS = {
  t: 't = (rA + rX) / (sqrt(2) * (rB + rX))',
  mu: 'mu = rB / rX',
  tau: 'tau = rX/rB - nA * (nA - (rA/rB) / ln(rA/rB)), perovskite predicted when tau < 4.18',
} as const;
