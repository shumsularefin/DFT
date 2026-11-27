// Restarts of the 1D two-electron SCF toy (M16.9, the ISTART and ICHARG topic): the same model as scf1d.ts, operator by
// operator, but the loop can start from a density read from an earlier run, or keep that density fixed (no update), as
// VASP does with ICHARG = 1 (read CHGCAR, then iterate) and ICHARG = 11 (read CHGCAR, keep it fixed).
// @source S-011 (self-consistent field), S-047 (finite-difference Schrodinger equation), S-019 (VASP wiki ICHARG)
// It is NOT Kohn-Sham DFT: restricted Hartree-Fock for two electrons, soft-Coulomb potentials, atomic units.
// With the default start (the density of the bare well, as runScf) the iterations equal runScf's exactly (tested).
import { makeGrid, solveLowest } from './solver1d';

export interface RestartOptions {
  Z?: number;
  alpha?: number;
  tol?: number;
  maxIterations?: number;
  L?: number;
  M?: number;
  /** Starting density on the grid; absent: the density of the lowest orbital of the bare well (runScf's start). */
  start?: Float64Array;
  /** Keep the starting density fixed: one solve in its potential, no update (ICHARG = 11). */
  fixed?: boolean;
}

export interface RestartIteration {
  iteration: number;
  densityIn: Float64Array;
  densityOut: Float64Array;
  orbitalEnergy: number;
  totalEnergy: number;
  residual: number;
}

export interface RestartResult {
  x: Float64Array;
  h: number;
  iterations: RestartIteration[];
  converged: boolean;
  /** Density after the loop (the fixed one when `fixed`). */
  density: Float64Array;
  /** Lowest orbital energy in the potential of the final density. */
  orbitalEnergy: number;
}

const C = 0.5;

function hartree(n: Float64Array, x: Float64Array, h: number): Float64Array {
  const m = n.length;
  const v = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += n[j]! / Math.sqrt((x[i]! - x[j]!) ** 2 + 1);
    v[i] = h * s;
  }
  return v;
}

function h0Expectation(phi: Float64Array, vext: Float64Array, h: number): number {
  const m = phi.length;
  let s = 0;
  for (let i = 0; i < m; i++) {
    const lap = ((i + 1 < m ? phi[i + 1]! : 0) - 2 * phi[i]! + (i > 0 ? phi[i - 1]! : 0)) / (h * h);
    s += phi[i]! * (-0.5 * lap + vext[i]! * phi[i]!);
  }
  return h * s;
}

function hartreeEnergy(n: Float64Array, vH: Float64Array, h: number): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) s += n[i]! * vH[i]!;
  return 0.25 * h * s;
}

const square2 = (phi: Float64Array) => phi.map((p) => 2 * p * p);

/** Run the SCF loop from the given start (or keep it fixed) and return every iteration. */
export function runRestart(o: RestartOptions = {}): RestartResult {
  const Z = o.Z ?? 2;
  const alpha = o.alpha ?? 0.3;
  const tol = o.tol ?? 1e-12;
  const maxit = o.fixed ? 1 : (o.maxIterations ?? 2000);
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError('The mixing parameter must be in (0, 1].');
  const { x, h } = makeGrid(-(o.L ?? 15), o.L ?? 15, o.M ?? 299);
  const m = x.length;
  if (o.start && o.start.length !== m)
    throw new RangeError('The starting density has the wrong length for this grid.');
  const vext = x.map((xi) => -Z / Math.sqrt(xi * xi + 1));
  let n = o.start ? Float64Array.from(o.start) : square2(solveLowest(C, h, vext, 1).states[0]!);
  const iterations: RestartIteration[] = [];
  let converged = false;
  for (let it = 1; it <= maxit; it++) {
    const vH = hartree(n, x, h);
    const veff = new Float64Array(m);
    for (let i = 0; i < m; i++) veff[i] = vext[i]! + 0.5 * vH[i]!;
    const s = solveLowest(C, h, veff, 1);
    const phi = s.states[0]!;
    const nOut = square2(phi);
    let r2 = 0;
    for (let i = 0; i < m; i++) r2 += (nOut[i]! - n[i]!) ** 2;
    const residual = Math.sqrt(h * r2);
    const totalEnergy = 2 * h0Expectation(phi, vext, h) + hartreeEnergy(nOut, hartree(nOut, x, h), h);
    iterations.push({
      iteration: it,
      densityIn: n,
      densityOut: nOut,
      orbitalEnergy: s.energies[0]!,
      totalEnergy,
      residual,
    });
    if (o.fixed) break;
    if (!Number.isFinite(residual)) break;
    if (residual < tol) {
      n = nOut;
      converged = true;
      break;
    }
    const next = new Float64Array(m);
    for (let i = 0; i < m; i++) next[i] = (1 - alpha) * n[i]! + alpha * nOut[i]!;
    n = next;
  }
  const vH = hartree(n, x, h);
  const fin = solveLowest(
    C,
    h,
    vext.map((v, i) => v + 0.5 * vH[i]!),
    1,
  );
  return { x, h, iterations, converged, density: n, orbitalEnergy: fin.energies[0]! };
}
