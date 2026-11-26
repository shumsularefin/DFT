// Static dielectric response from an LEPSILON / LCALCEPS OUTCAR (M15.5).
// @source S-042 (Workflow Handbook, Dielectric tensor and Born effective charges: eps0 = eps_inf + eps_ion; acoustic
//   sum rule "sum over kappa of Z*_kappa should be about 0 for each tensor component; a sum above ~0.1 means the
//   k-mesh or EDIFF is too loose")
import type { OutcarResult } from '../vasp/outcar';

/** Heuristic limit on |sum_kappa Z*_kappa| per component, in e (S-042, "~0.1"). */
export const BORN_SUM_RULE_LIMIT = 0.1;

export interface SumRuleCheck {
  /** sum over ions of Z*, 3x3, in e. */
  sum: number[][];
  maxAbs: number;
  limit: number;
  holds: boolean;
  heuristic: true;
  message: string;
}

export function bornSumRule(
  charges: readonly (readonly (readonly number[])[])[],
  limit = BORN_SUM_RULE_LIMIT,
): SumRuleCheck {
  const sum = [0, 1, 2].map((r) => [0, 1, 2].map((c) => charges.reduce((s, z) => s + z[r]![c]!, 0)));
  const maxAbs = Math.max(...sum.flat().map(Math.abs));
  const holds = maxAbs <= limit;
  return {
    sum,
    maxAbs,
    limit,
    holds,
    heuristic: true,
    message: holds
      ? `Acoustic sum rule: largest |sum Z*| = ${maxAbs.toFixed(3)} e, within the ${limit} e rule of thumb.`
      : `Acoustic sum rule: largest |sum Z*| = ${maxAbs.toFixed(3)} e exceeds the ${limit} e rule of thumb; tighten the k-mesh or EDIFF (S-042).`,
  };
}

export interface StaticDielectric {
  epsInf?: number[][];
  epsIon?: number[][];
  /** eps_inf + eps_ion, when both are present. */
  epsStatic?: number[][];
  sumRule?: SumRuleCheck;
}

export function staticDielectric(
  outcar: Pick<OutcarResult, 'epsilonInf' | 'epsilonIon' | 'born'>,
): StaticDielectric {
  const out: StaticDielectric = {};
  if (outcar.epsilonInf) out.epsInf = outcar.epsilonInf.tensor;
  if (outcar.epsilonIon) out.epsIon = outcar.epsilonIon.tensor;
  if (out.epsInf && out.epsIon)
    out.epsStatic = out.epsInf.map((r, i) => r.map((v, j) => v + out.epsIon![i]![j]!));
  if (outcar.born) out.sumRule = bornSumRule(outcar.born.charges);
  return out;
}
