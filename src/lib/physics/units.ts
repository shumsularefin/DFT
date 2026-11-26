// Unit conversions used across the readers and tools (M15.6).
// @source S-031 (CODATA 2018 / 2019 SI exact constants), S-042 (Workflow Handbook units table, which the tests check
// to 4 significant figures). Every factor below is computed from a constant in ./constants, never typed in, except
// the definitions of the SI prefixes and of the bar (1 bar = 1e5 Pa exactly).
import {
  AVOGADRO_PER_MOL,
  ELEMENTARY_CHARGE_C,
  EV_PER_A3_IN_GPA,
  PLANCK_J_S,
  RYDBERG_ENERGY_EV,
  SPEED_OF_LIGHT_M_S,
} from './constants';

/** 1 bar in Pa (definition). */
const BAR_PA = 1e5;

/** 1 kBar in GPa: 1e3 bar * 1e5 Pa / 1e9 = 0.1. */
export const KBAR_TO_GPA = (1e3 * BAR_PA) / 1e9;
/** 1 eV/Angstrom^3 in GPa: e * 1e30 / 1e9 = 160.2176634. */
export const EV_PER_A3_TO_GPA = EV_PER_A3_IN_GPA;
/** 1 THz in cm^-1: nu / c with c in cm/s, 1e12 / (c * 100) = 33.356. */
export const THZ_TO_CM1 = 1e12 / (SPEED_OF_LIGHT_M_S * 100);
/** 1 THz in meV: h nu / e * 1e3 = 4.1357. */
export const THZ_TO_MEV = ((PLANCK_J_S * 1e12) / ELEMENTARY_CHARGE_C) * 1e3;
/** 1 cm^-1 in meV: h c (100 / m) / e * 1e3 = 0.12398. */
export const CM1_TO_MEV = ((PLANCK_J_S * SPEED_OF_LIGHT_M_S * 100) / ELEMENTARY_CHARGE_C) * 1e3;
/** 1 Ry in eV (CODATA 2018 Rydberg energy). */
export const RY_TO_EV = RYDBERG_ENERGY_EV;
/** 1 Hartree in eV: E_h = 2 Ry exactly (by the definition of the Rydberg constant). */
export const HARTREE_TO_EV = 2 * RYDBERG_ENERGY_EV;
/** 1 eV per atom in kJ/mol: e N_A / 1e3 = 96.485. */
export const EV_PER_ATOM_TO_KJ_MOL = (ELEMENTARY_CHARGE_C * AVOGADRO_PER_MOL) / 1e3;
/** 1 eV/Angstrom in nN: e / 1e-10 m in N, times 1e9 = 1.6022. */
export const EV_PER_A_TO_NN = (ELEMENTARY_CHARGE_C / 1e-10) * 1e9;

/** A frequency in the three units VASP prints next to THz (2pi THz is left out, it is only THz times 2 pi). */
export interface Frequency {
  thz: number;
  cm1: number;
  meV: number;
}

/** Express a frequency given in THz in THz, cm^-1 and meV. Imaginary modes keep a negative sign by convention. */
export function frequencyFromThz(thz: number): Frequency {
  return { thz, cm1: thz * THZ_TO_CM1, meV: thz * THZ_TO_MEV };
}
