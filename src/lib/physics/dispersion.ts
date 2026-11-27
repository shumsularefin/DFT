// Grimme's DFT-D2 pair dispersion correction for a rigid graphene bilayer: the energy that the correction adds between
// the two layers as a function of their spacing and of a sliding of the top layer along the C-C bond. Pure.
// @source S-148 (Grimme 2006, DFT-D2: E = -s6 sum_ij C6_ij / R^6 f(R), f(R) = 1 / (1 + exp(-d (R / R_r - 1))),
//   C6_ij = sqrt(C6_i C6_j), R_r = R0_i + R0_j, d = 20, s6 = 0.75 for PBE; carbon C6 = 1.75 J nm^6 / mol, R0 = 1.452 Angstrom)
// @source S-019 (VASP wiki IVDW = 10: the same parameters and units), S-031 (Avogadro constant and e for the unit change)
// Only interlayer pairs are summed: the pairs inside one layer do not change with spacing or sliding. Pairs beyond the
// in-plane radius RHO_CUT are added as a continuum (a uniform sheet of carbon at density sigma), where f = 1 to 1e-9.
import { AVOGADRO_PER_MOL, ELEMENTARY_CHARGE_C } from './constants';

/** 1 J/mol in eV per particle. */
export const EV_PER_J_PER_MOL = 1 / (AVOGADRO_PER_MOL * ELEMENTARY_CHARGE_C);

export const D2 = {
  s6: 0.75,
  d: 20,
  /** Carbon C6 in J nm^6 / mol, as tabulated. */
  c6CarbonJnm6: 1.75,
  /** Carbon van der Waals radius R0 in Angstrom. */
  r0Carbon: 1.452,
} as const;

/** Carbon C6 in eV Angstrom^6 (1 nm^6 = 1e6 Angstrom^6). */
export const C6_CARBON_EV_A6 = D2.c6CarbonJnm6 * 1e6 * EV_PER_J_PER_MOL;
/** R_r for a C-C pair. */
export const RR_CC = 2 * D2.r0Carbon;

/** Fermi-type damping f(R) of D2: 1/2 at R = R_r, tends to 1 at large R and to 0 at short range. */
export const damping = (r: number, rr = RR_CC, d = D2.d): number => 1 / (1 + Math.exp(-d * (r / rr - 1)));

/** D2 energy of one C-C pair at distance r (Angstrom), in eV, with or without the damping. */
export function pairEnergy(r: number, damped = true): number {
  return (-D2.s6 * C6_CARBON_EV_A6 * (damped ? damping(r) : 1)) / r ** 6;
}

/** Graphene: lattice constant (Angstrom, the graphite cell of scene-structures.json), bond length and areal density. */
export const GRAPHENE_A = 2.46;
export const BOND = GRAPHENE_A / Math.sqrt(3);
export const SIGMA = 2 / ((Math.sqrt(3) / 2) * GRAPHENE_A * GRAPHENE_A);
/** Sliding along the bond (y) repeats after a sqrt(3) = 3 bond lengths. */
export const SLIDE_PERIOD = 3 * BOND;

/** In-plane cut-off of the explicit sum; the rest is the continuum tail. */
export const RHO_CUT = 14;

const A1: [number, number] = [GRAPHENE_A, 0];
const A2: [number, number] = [-GRAPHENE_A / 2, (GRAPHENE_A * Math.sqrt(3)) / 2];
/** The two atoms of the cell: at the origin and one bond length along y (the C-C bond is along y). */
export const BASIS: [number, number][] = [
  [0, 0],
  [0, BOND],
];

/** In-plane positions of one graphene layer within radius `r` of the origin. */
export function layerSites(r: number): [number, number][] {
  const n = Math.ceil(r / (GRAPHENE_A * 0.5)) + 2;
  const out: [number, number][] = [];
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (const b of BASIS) {
        const x = i * A1[0] + j * A2[0] + b[0];
        const y = i * A1[1] + j * A2[1] + b[1];
        if (x * x + y * y <= r * r) out.push([x, y]);
      }
  return out;
}

let bottomCache: [number, number][] | undefined;
/** Bottom-layer sites around the origin, wide enough for any top atom of the cell after any sliding. */
function bottom(): [number, number][] {
  bottomCache ??= layerSites(RHO_CUT + SLIDE_PERIOD + 2 * BOND);
  return bottomCache;
}

/**
 * D2 interlayer energy of an AA-registered bilayer slid by `slide` (Angstrom, along the bond) at spacing `d`
 * (Angstrom), in eV per atom of the bilayer (4 atoms per cell). `damped` false drops the damping function.
 */
export function bilayerEnergy(d: number, slide: number, damped = true): number {
  let e = 0;
  const rc2 = RHO_CUT * RHO_CUT;
  for (const b of BASIS) {
    const tx = b[0];
    const ty = b[1] + slide;
    for (const s of bottom()) {
      const dx = s[0] - tx;
      const dy = s[1] - ty;
      const rho2 = dx * dx + dy * dy;
      if (rho2 > rc2) continue;
      e += pairEnergy(Math.sqrt(rho2 + d * d), damped);
    }
    e += tailPerAtom(d);
  }
  return e / 4;
}

/** Continuum tail per top atom: -s6 C6 sigma pi / (2 (rho_c^2 + d^2)^2), the sheet beyond rho_c (f taken as 1). */
export const tailPerAtom = (d: number, rhoCut = RHO_CUT): number =>
  (-D2.s6 * C6_CARBON_EV_A6 * SIGMA * Math.PI) / (2 * (rhoCut * rhoCut + d * d) ** 2);

/** Undamped continuum limit of the whole sheet below one top atom: -s6 C6 sigma pi / (2 d^4), in eV per top atom. */
export const sheetLimitPerAtom = (d: number): number =>
  (-D2.s6 * C6_CARBON_EV_A6 * SIGMA * Math.PI) / (2 * d ** 4);

/** A stacking name for a sliding (AA at 0, AB at one bond, BA at two bonds), or null in between. */
export function stackingName(slide: number, tol = 0.06): string | null {
  const t = (((slide / BOND) % 3) + 3) % 3;
  const near = (k: number) => Math.abs(t - k) < tol / BOND || Math.abs(t - k - 3) < tol / BOND;
  if (near(0)) return 'AA';
  if (near(1)) return 'AB';
  if (near(2)) return 'BA';
  return null;
}
