// Dudarev DFT+U penalty for one orbital (M7.2, lab "dft-plus-u"). Toy: a single orbital with occupation n.
// E_U = (U_eff / 2) n (1 - n), V = dE_U/dn = U_eff (1/2 - n), with U_eff = U - J in eV.
// @source S-014 (Dudarev et al. 1998, rotationally invariant simplified form)

/** Penalty energy in eV for occupation n (0..1) and U_eff in eV. */
export const penaltyEnergy = (uEff: number, n: number): number => 0.5 * uEff * n * (1 - n);

/** Orbital-dependent potential shift in eV: negative for nearly full orbitals, positive for nearly empty. */
export const penaltyPotential = (uEff: number, n: number): number => uEff * (0.5 - n);
