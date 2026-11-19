// DFT+U in the Dudarev form for one orbital: the penalty on a fractional occupation n of that orbital. Pure.
// @source S-014 (Dudarev et al. 1998: E_U = (U_eff / 2) sum Tr[n (1 - n)], U_eff = U - J), S-019 (VASP wiki LDAUTYPE = 2)
// One orbital, one spin: n in [0, 1]. The penalty is zero at n = 0 and n = 1 and largest at n = 1/2.

/** Energy penalty E_U = (U_eff / 2) n (1 - n), in the unit of U_eff. */
export function dudarevEnergy(uEff: number, n: number): number {
  return (uEff / 2) * n * (1 - n);
}

/** Potential shift V = dE_U/dn = U_eff (1/2 - n): pushes an occupied level down and an empty one up. */
export function dudarevPotential(uEff: number, n: number): number {
  return uEff * (0.5 - n);
}
