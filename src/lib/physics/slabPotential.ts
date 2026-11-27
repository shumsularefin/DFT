// Planar-averaged electrostatics of a slab in a periodic cell (M16.13): sheets of charge per area along the normal,
// smeared as Gaussians, solved with the one-dimensional Poisson equation d^2 phi / dz^2 = -rho / eps0.
// Periodic boundary conditions (no correction): the potential must repeat, so the mean field is zero and a slab with a
// dipole sets up a compensating field across the vacuum. With the dipole correction (Neugebauer and Scheffler, S-066;
// Bengtsson, S-109) a dipole sheet at the cell boundary (the middle of the vacuum) cancels that field: the field is
// zero in the vacuum on both sides and the potential steps by p / eps0 at the sheet, p being the dipole per area.
// Units: angstrom, e per angstrom^2 for sheet charges, volts for phi.
// @source S-066 S-109 S-031
import { ELEMENTARY_CHARGE_C, VACUUM_PERMITTIVITY_F_M } from './constants';

/** 1 / eps0 in V angstrom / e (about 180.95). */
export const INV_EPS0_V_A = ELEMENTARY_CHARGE_C / (VACUUM_PERMITTIVITY_F_M * 1e-10);

export interface ChargeSheet {
  /** Height along the normal, angstrom, in [0, c). */
  z: number;
  /** Charge per area, e / angstrom^2. */
  charge: number;
}

export interface PlanarPotential {
  /** Grid heights, angstrom (n points from 0, spacing c / n). */
  z: number[];
  /** Electrostatic potential, V, with its value at z = 0 set to 0. */
  phi: number[];
  /** Field E = -d phi / dz, V / angstrom. */
  field: number[];
  /** Dipole per area of the sheets about the cell origin, e / angstrom. */
  dipole: number;
}

/**
 * Solve for the planar-averaged potential of charge sheets in a cell of height c. The sheets must be neutral in sum
 * (a residual is removed as a uniform background). `width` is the Gaussian smearing, angstrom.
 */
export function planarPotential(
  sheets: readonly ChargeSheet[],
  c: number,
  o: { n?: number; width?: number; dipoleCorrection?: boolean } = {},
): PlanarPotential {
  const n = o.n ?? 400;
  const w = o.width ?? 0.4;
  const h = c / n;
  const z = Array.from({ length: n }, (_, k) => k * h);
  const rho = z.map((zk) => {
    let r = 0;
    for (const s of sheets)
      for (const shift of [-c, 0, c]) {
        const d = zk - s.z - shift;
        r += (s.charge / (w * Math.sqrt(2 * Math.PI))) * Math.exp(-(d * d) / (2 * w * w));
      }
    return r;
  });
  const mean = rho.reduce((x, y) => x + y, 0) / n;
  for (let k = 0; k < n; k++) rho[k] = rho[k]! - mean;
  // field from the integral of rho (midpoint rule), zero at z = 0
  const field = new Array<number>(n).fill(0);
  for (let k = 1; k < n; k++) field[k] = field[k - 1]! + INV_EPS0_V_A * h * 0.5 * (rho[k - 1]! + rho[k]!);
  if (!o.dipoleCorrection) {
    const mf = field.reduce((x, y) => x + y, 0) / n;
    for (let k = 0; k < n; k++) field[k] = field[k]! - mf;
  }
  const phi = new Array<number>(n).fill(0);
  for (let k = 1; k < n; k++) phi[k] = phi[k - 1]! - h * 0.5 * (field[k - 1]! + field[k]!);
  const dipole = sheets.reduce((acc, s) => acc + s.charge * s.z, 0);
  return { z, phi, field, dipole };
}
