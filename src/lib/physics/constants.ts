// Physical constants for the Module 2 labs.
// @source S-031 (CODATA 2018 recommended values, Tiesinga et al., Rev. Mod. Phys. 93, 025010)
// h and e are exact by the 2019 SI definition. The mass and Bohr radius carry their CODATA 2018 uncertainty
// (about 3e-10 and 1.5e-10 relative), far below anything these labs display.

/** Planck constant in J s (exact). */
export const PLANCK_J_S = 6.62607015e-34;
/** Elementary charge in C (exact). */
export const ELEMENTARY_CHARGE_C = 1.602176634e-19;
/** Electron mass in kg (CODATA 2018). */
export const ELECTRON_MASS_KG = 9.1093837015e-31;
/** Reduced Planck constant in J s. */
export const HBAR_J_S = PLANCK_J_S / (2 * Math.PI);

/** Planck constant in eV s: h / e. */
export const PLANCK_EV_S = PLANCK_J_S / ELEMENTARY_CHARGE_C;

/** hbar^2 / (2 m_e) in eV Angstrom^2, the constant behind every plane-wave and box energy. VASP uses 3.80998. */
export const HBAR2_OVER_2M_EV_A2 =
  (HBAR_J_S * HBAR_J_S) / (2 * ELECTRON_MASS_KG) / ELEMENTARY_CHARGE_C / 1e-20;

/** Bohr radius in Angstrom (CODATA 2018: 5.29177210903e-11 m). */
export const BOHR_RADIUS_ANGSTROM = 0.529177210903;

/** Rydberg energy h c R_infinity in eV (CODATA 2018). The hydrogen ground-state energy is minus this. */
export const RYDBERG_ENERGY_EV = 13.605693122994;
