// A two-centre LCAO model of a homonuclear diatomic (H2-like): two normalized 1s Slater orbitals, their overlap, the
// bonding and antibonding molecular orbitals, the density of the bond against the superposed atoms, and a two-level
// Hamiltonian whose off-diagonal part gives the crystal orbital Hamilton population (COHP) of the pair.
// Lengths in bohr (a0), densities in electrons per a0^3, energies in eV.
//
//   phi(r) = sqrt(z^3 / pi) exp(-z r),  S(R) = exp(-z R) (1 + z R + (z R)^2 / 3)
//   sigma_g = (phiA + phiB) / sqrt(2 (1 + S)),  sigma_u = (phiA - phiB) / sqrt(2 (1 - S))
//   rho_bond = 2 sigma_g^2,  rho_atoms = phiA^2 + phiB^2,  delta rho = rho_bond - rho_atoms (integrates to 0)
//   H = [[eA, b], [b, eB]] (orthogonal two-level model): COHP_j = 2 b cA cB (b < 0 and cA cB > 0 for a bonding level)
// @source S-048 (Szabo and Ostlund: minimal-basis H2, the STO exponent 1.24 and the overlap integral of two 1s orbitals)
// @source S-128 (Dronskowski and Blochl: COHP = H_AB times the off-site density matrix; bonding is negative)
// @source S-049 (Martin: LCAO and two-level bonding)

/** Optimized Slater exponent of the minimal-basis H2 molecule (S-048). */
export const ZETA_H2 = 1.24;

export const slater1s = (zeta: number, r: number): number =>
  Math.sqrt(zeta ** 3 / Math.PI) * Math.exp(-zeta * r);

/** Overlap of two normalized 1s Slater orbitals with the same exponent at distance R (closed form, S-048). */
export function overlap1s(zeta: number, R: number): number {
  const x = zeta * R;
  return Math.exp(-x) * (1 + x + (x * x) / 3);
}

export interface Diatomic {
  /** Bond length in a0; atom A at x = -R/2, atom B at x = +R/2. */
  R: number;
  zeta: number;
}

export function orbitals(m: Diatomic) {
  const h = m.R / 2;
  const S = overlap1s(m.zeta, m.R);
  const phiA = (x: number, y: number, z: number) => slater1s(m.zeta, Math.hypot(x + h, y, z));
  const phiB = (x: number, y: number, z: number) => slater1s(m.zeta, Math.hypot(x - h, y, z));
  const nb = 1 / Math.sqrt(2 * (1 + S));
  const na = 1 / Math.sqrt(2 * (1 - S));
  return {
    S,
    phiA,
    phiB,
    bonding: (x: number, y: number, z: number) => nb * (phiA(x, y, z) + phiB(x, y, z)),
    antibonding: (x: number, y: number, z: number) => na * (phiA(x, y, z) - phiB(x, y, z)),
    /** A normalized combination cA phiA + cB phiB. */
    combination: (cA: number, cB: number) => {
      const n = 1 / Math.sqrt(cA * cA + cB * cB + 2 * cA * cB * S);
      return (x: number, y: number, z: number) => n * (cA * phiA(x, y, z) + cB * phiB(x, y, z));
    },
  };
}

/** Density of two electrons in the bonding orbital, of the two separate atoms, and their difference. */
export function densities(m: Diatomic) {
  const o = orbitals(m);
  const bond = (x: number, y: number, z: number) => 2 * o.bonding(x, y, z) ** 2;
  const atoms = (x: number, y: number, z: number) => o.phiA(x, y, z) ** 2 + o.phiB(x, y, z) ** 2;
  return { S: o.S, bond, atoms, diff: (x: number, y: number, z: number) => bond(x, y, z) - atoms(x, y, z) };
}

export interface TwoLevel {
  /** On-site energies in eV. */
  eA: number;
  eB: number;
  /** Hopping (Hamiltonian matrix element) in eV, negative for a bonding interaction. */
  beta: number;
}

export interface Level {
  E: number;
  cA: number;
  cB: number;
  /** Occupation, 0 to 2. */
  f: number;
  /** COHP weight of this level, 2 beta cA cB (eV), negative = bonding. */
  cohp: number;
}

/** Eigen-solution of the orthogonal two-level model, filled with `electrons` electrons from the bottom. */
export function twoLevel(h: TwoLevel, electrons: number): Level[] {
  const m = (h.eA + h.eB) / 2;
  const d = (h.eA - h.eB) / 2;
  const r = Math.hypot(d, h.beta);
  const levels: Level[] = [];
  for (const sgn of [-1, 1]) {
    const E = m + sgn * r;
    // (eA - E) cA + beta cB = 0  ->  (cA, cB) proportional to (beta, E - eA), or to (E - eB, beta)
    let cA = h.beta;
    let cB = E - h.eA;
    if (Math.hypot(cA, cB) < 1e-12) [cA, cB] = [E - h.eB, h.beta];
    if (Math.hypot(cA, cB) < 1e-12) [cA, cB] = sgn < 0 ? [1, 0] : [0, 1];
    const n = Math.hypot(cA, cB);
    cA /= n;
    cB /= n;
    if (cA < 0 || (cA === 0 && cB < 0)) [cA, cB] = [-cA, -cB];
    levels.push({ E, cA, cB, f: 0, cohp: 2 * h.beta * cA * cB });
  }
  let left = electrons;
  for (const l of levels) {
    l.f = Math.min(2, Math.max(0, left));
    left -= l.f;
  }
  return levels;
}

/** Integrated COHP up to the Fermi level: the sum of f_j COHP_j (eV). Negative means net bonding. */
export const icohp = (levels: readonly Level[]): number => levels.reduce((s, l) => s + l.f * l.cohp, 0);

/**
 * Gaussian-broadened COHP(E) of every level, filled or empty, counting both spins (eV per eV), width w in eV. Its
 * integral over the filled levels equals the ICOHP when the filled levels hold two electrons each.
 */
export function cohpCurve(levels: readonly Level[], E: number, w: number): number {
  let s = 0;
  for (const l of levels) {
    const x = (E - l.E) / w;
    s += (2 * l.cohp * Math.exp(-x * x)) / (w * Math.sqrt(Math.PI));
  }
  return s;
}
