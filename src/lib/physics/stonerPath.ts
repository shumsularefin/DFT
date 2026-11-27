// Downhill path of the moment on the Stoner toy energy (M16.8): where a minimiser started at a MAGMOM-like value ends.
// Plain gradient descent m_(k+1) = m_k - eta_k dE/dm on stonerEnergy, with eta_k = 0.9 / L_k and L_k the largest curvature
// between m_k and the minimum, so every step lowers the energy and never overshoots the minimum. It is a picture of
// "the start decides which stationary point you reach", not VASP's density mixing.
// @source S-059 (the energy E(m) of physics/stoner.ts)
import { solveStoner, stonerEnergy, type StonerParams } from './stoner';

const DEFAULT_MAX = 2.0;

/** dE/dm and d2E/dm2 of stonerEnergy (same coefficients: a m^2 + c m^4). */
export function stonerDerivatives(p: StonerParams, m: number): { slope: number; curvature: number } {
  const a = (1 - p.stonerI * p.dosPerSpin) / (4 * p.dosPerSpin);
  const mx = p.maxMoment ?? DEFAULT_MAX;
  const c = 1 / (4 * p.dosPerSpin * mx * mx);
  return { slope: 2 * a * m + 4 * c * m ** 3, curvature: 2 * a + 12 * c * m * m };
}

/** Moments m_0 = start, m_1, ..., m_steps of the descent, and the energy of each. */
export function stonerDescent(
  p: StonerParams,
  start: number,
  steps: number,
): { moments: number[]; energies: number[] } {
  const mStar = solveStoner(p).equilibriumMoment;
  const c0 = Math.abs(stonerDerivatives(p, 0).curvature);
  const moments = [start];
  for (let k = 0; k < steps; k++) {
    const m = moments[k]!;
    // the next point lies between m and the minimum, so the largest curvature on that stretch bounds the step
    const l = Math.max(c0, Math.abs(stonerDerivatives(p, Math.max(Math.abs(m), mStar)).curvature), 1e-9);
    moments.push(m - (0.9 / l) * stonerDerivatives(p, m).slope);
  }
  return { moments, energies: moments.map((m) => stonerEnergy(p, m)) };
}
