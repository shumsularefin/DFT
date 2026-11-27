// Particle in a one-dimensional box: closed-form results, exact (no simulation).
// @source S-047 (Griffiths and Schroeter: infinite square well, E_n = n^2 pi^2 hbar^2 / (2 m L^2))
// @source S-031 (hbar^2/2m, h)
import { HBAR2_OVER_2M_EV_A2, PLANCK_EV_S } from './constants';

/** Energy of state n (n = 1, 2, ...) in eV for a box of length L in Angstrom: n^2 pi^2 (hbar^2/2m) / L^2. */
export function boxEnergyEV(n: number, lengthA: number): number {
  return (n * n * Math.PI * Math.PI * HBAR2_OVER_2M_EV_A2) / (lengthA * lengthA);
}

/** Wavefunction sqrt(2/L) sin(n pi x / L) in Angstrom^(-1/2); zero outside [0, L]. */
export function boxPsi(n: number, lengthA: number, x: number): number {
  if (x < 0 || x > lengthA) return 0;
  return Math.sqrt(2 / lengthA) * Math.sin((n * Math.PI * x) / lengthA);
}

/** Number of interior nodes (points inside the box where psi is zero): n - 1. */
export const boxInteriorNodes = (n: number): number => n - 1;

/**
 * Probability density |Psi|^2 in 1/Angstrom of the superposition sqrt(1-w) psi_n + sqrt(w) psi_m evolving in time.
 * `beatPhase` is t / T with T the beat period, so the cross term is cos(2 pi beatPhase).
 * With w = 0 this is |psi_n|^2, which does not change in time.
 */
export function boxDensity(
  lengthA: number,
  n: number,
  m: number,
  weight: number,
  beatPhase: number,
  x: number,
): number {
  const a = Math.sqrt(1 - weight);
  const b = Math.sqrt(weight);
  const pn = boxPsi(n, lengthA, x);
  const pm = boxPsi(m, lengthA, x);
  return a * a * pn * pn + b * b * pm * pm + 2 * a * b * pn * pm * Math.cos(2 * Math.PI * beatPhase);
}

/** Beat period T = h / (E_m - E_n) in femtoseconds, for the superposition of states n and m (n != m). */
export function boxBeatPeriodFs(lengthA: number, n: number, m: number): number {
  const dE = Math.abs(boxEnergyEV(m, lengthA) - boxEnergyEV(n, lengthA));
  return (PLANCK_EV_S / dE) * 1e15;
}

// Three-dimensional box and two particles in one box: separable products of the one-dimensional states above.
// @source S-047 (Griffiths and Schroeter: the cubical infinite well, E = (hbar^2 pi^2 / 2m)(nx^2/Lx^2 + ny^2/Ly^2 + nz^2/Lz^2);
// identical particles, psi(x1, x2) = [psi_a(x1) psi_b(x2) +- psi_b(x1) psi_a(x2)] / sqrt(2))

export type Triple = [number, number, number];

/** Energy in eV of state (nx, ny, nz) in a box of sides (Lx, Ly, Lz) in Angstrom: the sum of three 1D energies. */
export function box3dEnergyEV(n: Triple, L: Triple): number {
  return boxEnergyEV(n[0], L[0]) + boxEnergyEV(n[1], L[1]) + boxEnergyEV(n[2], L[2]);
}

/** Wavefunction of state (nx, ny, nz) at (x, y, z), corner of the box at the origin, in Angstrom^(-3/2). */
export function box3dPsi(n: Triple, L: Triple, x: number, y: number, z: number): number {
  return boxPsi(n[0], L[0], x) * boxPsi(n[1], L[1], y) * boxPsi(n[2], L[2], z);
}

/** Largest value of |psi|^2 inside the box: (2/Lx)(2/Ly)(2/Lz), reached at every antinode. */
export const box3dPeakDensity = (L: Triple): number => 8 / (L[0] * L[1] * L[2]);

export interface BoxLevel {
  energy: number;
  /** Every (nx, ny, nz) with this energy; the degeneracy is its length. */
  states: Triple[];
}

/**
 * The lowest `count` distinct energy levels of the 3D box, with the states that share each one (degeneracy), from all
 * states with every quantum number at most `nMax`. Energies equal to a relative 1e-9 count as one level.
 */
export function box3dLevels(L: Triple, count: number, nMax = 6): BoxLevel[] {
  const all: { e: number; n: Triple }[] = [];
  for (let i = 1; i <= nMax; i++)
    for (let j = 1; j <= nMax; j++)
      for (let k = 1; k <= nMax; k++) all.push({ e: box3dEnergyEV([i, j, k], L), n: [i, j, k] });
  all.sort((a, b) => a.e - b.e);
  const out: BoxLevel[] = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (last && Math.abs(s.e - last.energy) <= 1e-9 * last.energy) last.states.push(s.n);
    else {
      if (out.length === count) break;
      out.push({ energy: s.e, states: [s.n] });
    }
  }
  return out;
}

/**
 * Two identical particles in one 1D box of length L, one in state a and one in state b (spin left out).
 * `antisymmetric` (fermions in the same spin state): [psi_a(x1) psi_b(x2) - psi_b(x1) psi_a(x2)] / sqrt(2), zero when a = b.
 * `symmetric` (bosons): the plus sign, and psi_a(x1) psi_a(x2) when a = b. Both are normalised over the square.
 */
export function boxPairPsi(
  a: number,
  b: number,
  lengthA: number,
  x1: number,
  x2: number,
  kind: 'symmetric' | 'antisymmetric',
): number {
  if (a === b) return kind === 'antisymmetric' ? 0 : boxPsi(a, lengthA, x1) * boxPsi(a, lengthA, x2);
  const s = kind === 'antisymmetric' ? -1 : 1;
  return (
    (boxPsi(a, lengthA, x1) * boxPsi(b, lengthA, x2) + s * boxPsi(b, lengthA, x1) * boxPsi(a, lengthA, x2)) /
    Math.SQRT2
  );
}

/**
 * Fill levels from the bottom with at most `perLevel` electrons each (2: one up, one down; Pauli). Returns the number of
 * electrons in each of `levels` levels; electrons that do not fit are dropped (the caller shows enough levels).
 */
export function fillLevels(electrons: number, levels: number, perLevel = 2): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(electrons));
  for (let i = 0; i < levels; i++) {
    const k = Math.min(perLevel, left);
    out.push(k);
    left -= k;
  }
  return out;
}
