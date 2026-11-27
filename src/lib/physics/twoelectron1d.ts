// Exact two-electron ground state of a one-dimensional model atom (module 3 and 4 scenes).
// Model (atomic units: hartree, bohr), the same as scf1d.ts and its generator: v_ext(x) = -Z / sqrt(x^2 + 1), the
// electrons repel through lambda / sqrt((x1 - x2)^2 + 1) (lambda = 1 is the physical strength, 0 switches it off).
// The spatial wavefunction psi(x1, x2) of the singlet is symmetric, of the triplet antisymmetric. On a grid of M interior
// points the Hamiltonian h0(x1) + h0(x2) + w(x1 - x2) is a 2D operator, solved exactly (to a set tolerance) by
// solver2d.ts. With the normalisation sum psi^2 h^2 = 1:
//   density            n(x)        = 2 h sum_x2 psi(x, x2)^2           (integrates to 2)
//   pair density       P(x1, x2)   = 2 psi(x1, x2)^2                    (integrates to N (N - 1) = 2)
//   xc hole            n_xc(x2|x1) = P(x1, x2) / n(x1) - n(x2)          (integrates to -1 for every x1)
// For a closed shell (Hartree-Fock, scf1d) the pair density is n(x1) n(x2) / 2, so the exchange hole is -n(x2) / 2.
// @source S-143 (soft-Coulomb 1D model atom), S-048 (two-electron singlet and triplet, pair density, Hartree-Fock)
// @source S-049 (exchange-correlation hole and its sum rule; HOMO eigenvalue equals minus the ionisation energy)
// @source S-145 (exact Kohn-Sham HOMO equals minus the ionisation energy)
import { densityFromStates, potentialFromDensity } from './density1d';
import { makeGrid, solveLowest } from './solver1d';
import { lowestState2d } from './solver2d';

const C = 0.5; // hbar^2 / 2m in atomic units

export const softCoulomb = (d: number): number => 1 / Math.sqrt(d * d + 1);

export interface TwoElectronOptions {
  /** Nuclear charge of the soft-Coulomb well (default 2). */
  Z?: number;
  /** Strength of the electron repulsion, 1 = physical (default 1). */
  lambda?: number;
  /** Half-width of the box in bohr (default 15) and number of interior points per axis (default 299). */
  L?: number;
  M?: number;
  spin?: 'singlet' | 'triplet';
  tol?: number;
  /** Starting guess on the same grid (for example the state at a nearby lambda); a product of orbitals when absent. */
  start?: ArrayLike<number>;
}

export interface TwoElectronState {
  Z: number;
  lambda: number;
  spin: 'singlet' | 'triplet';
  x: Float64Array;
  h: number;
  M: number;
  /** psi(x_i, x_j) at index i + M j, normalised so that sum psi^2 h^2 = 1. */
  psi: Float64Array;
  energy: number;
  /** Kinetic, external and interaction parts of the energy (they add up to `energy`). */
  kinetic: number;
  external: number;
  interaction: number;
  density: Float64Array;
  vext: Float64Array;
  /** Lowest one-electron energies of h0 alone (eps0, eps1). */
  oneElectron: [number, number];
  /** Energy with the repulsion switched off: 2 eps0 (singlet) or eps0 + eps1 (triplet). */
  nonInteractingEnergy: number;
  iterations: number;
  residual: number;
}

/** Solve for the lowest singlet (default) or triplet state of the model. */
export function solveTwoElectron(o: TwoElectronOptions = {}): TwoElectronState {
  const Z = o.Z ?? 2;
  const lambda = o.lambda ?? 1;
  const spin = o.spin ?? 'singlet';
  const { x, h } = makeGrid(-(o.L ?? 15), o.L ?? 15, o.M ?? 299);
  const M = x.length;
  const vext = Float64Array.from(x, (xi) => -Z * softCoulomb(xi));
  const one = solveLowest(C, h, vext, 2);
  const [p0, p1] = one.states as [Float64Array, Float64Array];
  const V = new Float64Array(M * M);
  const start = new Float64Array(M * M);
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) {
      const k = i + M * j;
      V[k] = vext[i]! + vext[j]! + lambda * softCoulomb(x[i]! - x[j]!);
      start[k] = spin === 'singlet' ? p0[i]! * p0[j]! : p0[i]! * p1[j]! - p1[i]! * p0[j]!;
    }
  const sol = lowestState2d({
    nx: M,
    ny: M,
    hx: h,
    hy: h,
    c: C,
    V,
    start: o.start ?? start,
    symmetry: spin === 'singlet' ? 'symmetric' : 'antisymmetric',
    tol: o.tol ?? 1e-8,
  });
  const psi = sol.state;
  // energy pieces with the same operators
  let ext = 0;
  let int = 0;
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) {
      const k = i + M * j;
      const p2 = psi[k]! * psi[k]!;
      ext += p2 * (vext[i]! + vext[j]!);
      int += p2 * lambda * softCoulomb(x[i]! - x[j]!);
    }
  ext *= h * h;
  int *= h * h;
  return {
    Z,
    lambda,
    spin,
    x,
    h,
    M,
    psi,
    energy: sol.energy,
    kinetic: sol.energy - ext - int,
    external: ext,
    interaction: int,
    density: densityOf(psi, M, h),
    vext,
    oneElectron: [one.energies[0]!, one.energies[1]!],
    nonInteractingEnergy: spin === 'singlet' ? 2 * one.energies[0]! : one.energies[0]! + one.energies[1]!,
    iterations: sol.iterations,
    residual: sol.residual,
  };
}

/** n(x_i) = 2 h sum_j psi(x_i, x_j)^2. */
export function densityOf(psi: ArrayLike<number>, M: number, h: number): Float64Array {
  const n = new Float64Array(M);
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) {
      const v = psi[i + M * j]!;
      n[i] = n[i]! + 2 * h * v * v;
    }
  return n;
}

/** Pair density P(x_i, x_j) = 2 psi^2 at index i + M j. */
export const pairDensity = (s: TwoElectronState): Float64Array => s.psi.map((v) => 2 * v * v);

/**
 * Exchange-correlation hole around an electron at x_i: n_xc(x_j | x_i) = P(x_i, x_j) / n(x_i) - n(x_j). Its sum
 * h sum_j n_xc is -1 for every i where n(x_i) is not zero.
 */
export function xcHole(s: TwoElectronState, i: number): Float64Array {
  const { M, psi, density: n } = s;
  const out = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const v = psi[i + M * j]!;
    out[j] = (2 * v * v) / n[i]! - n[j]!;
  }
  return out;
}

/** Hartree potential v_H(x) = h sum_x' n(x') lambda w(x - x') of a density on the grid. */
export function hartreePotential(
  n: ArrayLike<number>,
  x: ArrayLike<number>,
  h: number,
  lambda = 1,
): Float64Array {
  const M = n.length;
  const v = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    let s = 0;
    for (let j = 0; j < M; j++) s += n[j]! * softCoulomb(x[i]! - x[j]!);
    v[i] = lambda * h * s;
  }
  return v;
}

export interface KohnShamInversion {
  /** The doubly occupied Kohn-Sham orbital phi = sqrt(n / 2) (sum phi^2 h = 1). */
  orbital: Float64Array;
  /** Exact Kohn-Sham potential, with its constant set so that the orbital energy equals minus the ionisation energy. */
  vs: Float64Array;
  /** Hartree potential and the exchange-correlation potential vs - vext - vH. */
  vH: Float64Array;
  vxc: Float64Array;
  /** Kohn-Sham orbital energy (= E(2 electrons) - E(1 electron)) and the ionisation energy (its negative). */
  eps: number;
  ionisation: number;
  /** Non-interacting kinetic energy Ts = 2 <phi|t|phi>, Hartree energy and E_xc = E - Ts - E_ext - E_H. */
  Ts: number;
  EH: number;
  Exc: number;
}

/**
 * The exact Kohn-Sham system of a two-electron singlet: two electrons in one orbital phi = sqrt(n / 2) of a local
 * potential vs that reproduces the interacting density exactly (inversion as in density1d). The constant of vs is
 * fixed by the exact condition that the highest occupied Kohn-Sham energy is minus the ionisation energy
 * I = E(1 electron in v_ext) - E(2 electrons).
 */
export function kohnShamInversion(s: TwoElectronState): KohnShamInversion {
  if (s.spin !== 'singlet') throw new RangeError('the Kohn-Sham inversion here is for the singlet');
  const { x, h, M, density: n } = s;
  const half = Float64Array.from(n, (v) => v / 2);
  const eps = s.energy - s.oneElectron[0];
  const vs = potentialFromDensity(C, h, half, eps);
  const orbital = Float64Array.from(half, (v) => Math.sqrt(v));
  const vH = hartreePotential(n, x, h, s.lambda);
  const vxc = Float64Array.from(vs, (v, i) => v - s.vext[i]! - vH[i]!);
  // Ts = 2 <phi| -1/2 d2/dx2 |phi> with the same 3-point operator and walls
  let t = 0;
  for (let i = 0; i < M; i++) {
    const lap =
      ((i + 1 < M ? orbital[i + 1]! : 0) - 2 * orbital[i]! + (i > 0 ? orbital[i - 1]! : 0)) / (h * h);
    t += orbital[i]! * -0.5 * lap;
  }
  const Ts = 2 * h * t;
  let eh = 0;
  let ex = 0;
  for (let i = 0; i < M; i++) {
    eh += n[i]! * vH[i]!;
    ex += n[i]! * s.vext[i]!;
  }
  const EH = 0.5 * h * eh;
  const Eext = h * ex;
  return {
    orbital,
    vs,
    vH,
    vxc,
    eps,
    ionisation: -eps,
    Ts,
    EH,
    Exc: s.energy - Ts - Eext - EH,
  };
}

/** Density of two electrons in the lowest orbital of a potential (non-interacting, same grid), and that orbital energy. */
export function nonInteractingDensity(
  V: ArrayLike<number>,
  h: number,
): { density: Float64Array; eps: number; orbital: Float64Array } {
  const sol = solveLowest(C, h, V, 1);
  return {
    density: densityFromStates(sol.states, [2]),
    eps: sol.energies[0]!,
    orbital: sol.states[0]!,
  };
}
