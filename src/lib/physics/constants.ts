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

/**
 * 1 eV/Angstrom^3 in GPa: e * 1e30 / 1e9 = 160.2176634 (exact, from the exact elementary charge). Bulk moduli from
 * an E(V) fit come out in eV/Angstrom^3 and are shown in GPa with this factor (M13.6). The Workflow Handbook
 * (S-042) rounds it to 160.2177; the golden file takes it from scipy.constants.
 */
export const EV_PER_A3_IN_GPA = (ELEMENTARY_CHARGE_C * 1e30) / 1e9;

/** Boltzmann constant in J/K (exact by the 2019 SI definition). */
export const BOLTZMANN_J_K = 1.380649e-23;
/** Boltzmann constant in eV/K: k_B / e = 8.617333262e-5. The Workflow Handbook (S-042) rounds it to 8.617e-5. */
export const BOLTZMANN_EV_K = BOLTZMANN_J_K / ELEMENTARY_CHARGE_C;

/**
 * 1 kBar in GPa: 1 bar = 1e5 Pa exactly, so 1 kBar = 1e8 Pa = 0.1 GPa. VASP prints stress and the elastic moduli in
 * kBar; the Workflow Handbook (S-042, units table) gives the same factor ("divide by 10 for GPa").
 */
export const KBAR_IN_GPA = 0.1;

/** Speed of light in vacuum in m/s (exact by the SI definition of the metre, S-031). */
export const SPEED_OF_LIGHT_M_S = 299792458;
/** Vacuum permittivity in F/m (CODATA 2018, S-031; relative uncertainty 1.5e-10). */
export const VACUUM_PERMITTIVITY_F_M = 8.8541878128e-12;
