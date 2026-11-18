// Perovskite tolerance factors.
// @source S-002 Goldschmidt t = (rA + rX) / (sqrt(2) (rB + rX))
// @source S-003 Bartel et al., Sci. Adv. 5, eaav0693 (2019), eq. 2: tau = rX/rB - nA (nA - (rA/rB) / ln(rA/rB)),
//   rA > rB by definition, tau < 4.18 indicates perovskite. Read in arXiv:1801.07700v2 on 2026-11-18 (Q-003).
// Octahedral factor mu = rB / rX (S-003 writes rX/rB = 1/mu).

export const TAU_THRESHOLD = 4.18;
/**
 * Status of the tau formula. Equation 2, the 4.18 threshold and the radius conventions were read in the
 * arXiv version (1801.07700v2); the published Science Advances text was not reachable (Q-003).
 */
export const TAU_STATUS = {
  confirmed: true,
  checkedAgainst: 'arXiv:1801.07700v2 (equation 2, threshold, Methods "Radii assignment")',
  note: 'Equation and threshold confirmed against the arXiv version of the paper; the published version was not compared.',
} as const;

export function goldschmidt(rA: number, rB: number, rX: number): number {
  return (rA + rX) / (Math.SQRT2 * (rB + rX));
}

export function octahedral(rB: number, rX: number): number {
  return rB / rX;
}

export type TauResult =
  | {
      ok: true;
      value: number;
      predictsPerovskite: boolean;
      threshold: number;
      confirmed: boolean;
      /** rA < rB: the formula evaluates, but S-003 defines A as the larger cation. Never swapped silently. */
      sitesLookSwapped: boolean;
    }
  | { ok: false; reason: 'rA equals rB'; message: string };

const isOne = (x: number) => Math.abs(x - 1) <= 1e-9 * Math.max(1, Math.abs(x));

export function bartelTau(rA: number, rB: number, rX: number, nA: number): TauResult {
  const ratio = rA / rB;
  if (isOne(ratio))
    return {
      ok: false,
      reason: 'rA equals rB',
      message: 'tau is undefined when rA = rB: ln(rA/rB) = 0 divides the second term by zero.',
    };
  const value = rX / rB - nA * (nA - ratio / Math.log(ratio));
  return {
    ok: true,
    value,
    predictsPerovskite: value < TAU_THRESHOLD,
    threshold: TAU_THRESHOLD,
    confirmed: TAU_STATUS.confirmed,
    sitesLookSwapped: rA < rB,
  };
}
