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
