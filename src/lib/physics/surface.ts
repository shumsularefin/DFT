// Small research-planner calculators with exact SI unit conversions (M14.2).
// @source S-031 (exact e), S-042 (surface energy and formation enthalpy formulas)
import { ELEMENTARY_CHARGE_C } from './constants';

/**
 * 1 eV / Angstrom^2 in J / m^2: e * 1e20 = 16.02176634 (exact, from the 2019 SI elementary charge, S-031).
 */
export const EV_PER_A2_IN_J_PER_M2 = ELEMENTARY_CHARGE_C * 1e20;

export interface SurfaceEnergyResult {
  /** Surface energy in eV / Angstrom^2. */
  gammaEvPerA2: number;
  /** Surface energy in J / m^2. */
  gammaJPerM2: number;
}

/**
 * Symmetric stoichiometric slab surface energy (S-065, S-042):
 *   gamma = (E_slab - N * E_bulk) / (2 * A)
 * where E_slab is total slab energy (eV), E_bulk is bulk energy per formula unit (eV),
 * N is the number of bulk formula units in the slab, and A is the single-side surface area (Angstrom^2).
 */
export function surfaceEnergy(
  eSlabEv: number,
  eBulkPerUnitEv: number,
  nUnits: number,
  areaA2: number,
): SurfaceEnergyResult {
  if (!(areaA2 > 0) || !Number.isFinite(areaA2)) throw new RangeError('Surface area must be positive.');
  if (!(nUnits > 0) || !Number.isFinite(nUnits))
    throw new RangeError('Number of bulk units must be positive.');
  const gammaEvPerA2 = (eSlabEv - nUnits * eBulkPerUnitEv) / (2 * areaA2);
  return {
    gammaEvPerA2,
    gammaJPerM2: gammaEvPerA2 * EV_PER_A2_IN_J_PER_M2,
  };
}

export interface FormationTerm {
  symbol: string;
  count: number;
  refEnergyPerAtomEv: number;
}

export interface FormationEnergyResult {
  /** Total formation energy for the cell/formula unit in eV. */
  totalEv: number;
  /** Formation energy per atom in eV/atom. */
  perAtomEv: number;
  totalAtoms: number;
}

/**
 * Formation enthalpy of a compound from elemental references (S-042, Workflow Handbook "Other calculations"):
 *   Delta H_f = [E(A_x B_y) - x E(A) - y E(B)] / (x + y)  per atom; totalEv is the bracket.
 * Not a defect formation energy: that needs E_defect - E_host -/+ n_i mu_i (plus charge terms), which this
 * function does not compute (M15.2 audit).
 */
export function neutralFormationEnergy(
  eTotalEv: number,
  terms: readonly FormationTerm[],
): FormationEnergyResult {
  let refSum = 0;
  let totalAtoms = 0;
  for (const t of terms) {
    refSum += t.count * t.refEnergyPerAtomEv;
    totalAtoms += t.count;
  }
  const totalEv = eTotalEv - refSum;
  return {
    totalEv,
    perAtomEv: totalAtoms > 0 ? totalEv / totalAtoms : 0,
    totalAtoms,
  };
}

/**
 * Total energy normalized per formula unit (S-042): E / Z.
 */
export function energyPerFormulaUnit(eTotalEv: number, formulaUnits: number): number {
  if (!(formulaUnits > 0) || !Number.isFinite(formulaUnits)) {
    throw new RangeError('Formula units must be positive.');
  }
  return eTotalEv / formulaUnits;
}
