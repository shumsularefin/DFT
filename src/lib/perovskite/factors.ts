/**
 * Tolerance factors for ABX3 perovskites.
 * @source S-002 Goldschmidt t; S-022 octahedral factor (radius-ratio rule); S-003 Bartel tau
 */

/** Perovskite predicted when tau < 4.18 (S-003, arXiv:1801.07700 text, empirically determined). */
export const BARTEL_THRESHOLD = 4.18;

/**
 * Status of the tau formula against the paper (Q-003). Equation 2 and the 4.18 threshold were read in the
 * arXiv preprint text. The published Science Advances version was not readable, so that is stated.
 */
export const TAU_CONFIRMATION = {
  confirmed: true,
  basis:
    'Equation 2 and threshold 4.18 as printed in the arXiv:1801.07700 text; the journal version was not read (Q-003)',
} as const;

/** t = (rA + rX) / (sqrt(2) (rB + rX)). Radii in Angstrom, all positive. */
export function goldschmidt(rA: number, rB: number, rX: number): number {
  return (rA + rX) / (Math.SQRT2 * (rB + rX));
}

/** mu = rB / rX. */
export function octahedral(rB: number, rX: number): number {
  return rB / rX;
}

export type TauResult =
  | {
      ok: true;
      value: number;
      predictsPerovskite: boolean;
      confirmed: boolean;
      confirmation: string;
      siteOrderWarning: boolean;
    }
  | { ok: false; reason: string };

/** tau = rX/rB - nA (nA - (rA/rB) / ln(rA/rB)). Undefined when rA = rB. */
export function bartelTau(rA: number, rB: number, rX: number, nA: number): TauResult {
  if (!(rA > 0 && rB > 0 && rX > 0) || !Number.isFinite(rA + rB + rX + nA)) {
    return { ok: false, reason: 'tau needs positive radii and a finite A-site oxidation state.' };
  }
  const x = rA / rB;
  if (x === 1) {
    return {
      ok: false,
      reason: 'tau is undefined when rA equals rB (ln 1 = 0): the term (rA/rB)/ln(rA/rB) diverges.',
    };
  }
  const value = rX / rB - nA * (nA - x / Math.log(x));
  return {
    ok: true,
    value,
    predictsPerovskite: value < BARTEL_THRESHOLD,
    confirmed: TAU_CONFIRMATION.confirmed,
    confirmation: TAU_CONFIRMATION.basis,
    siteOrderWarning: rA < rB,
  };
}

/** A is by convention the larger cation (S-003 states rA > rB by definition). Never swaps silently. */
export function siteOrderWarning(rA: number, rB: number): string | null {
  return rA < rB
    ? 'The A-site cation is smaller than the B-site cation. In ABX3 perovskites A is by convention the larger cation, so the site assignment looks swapped. Consider swapping A and B.'
    : null;
}
