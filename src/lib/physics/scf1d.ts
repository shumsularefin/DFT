// 1D two-electron self-consistent-field toy (M7.1): restricted Hartree-Fock for two electrons in one spatial orbital,
// soft-Coulomb external potential and interaction, atomic units (hartree, bohr). A port, operator by operator, of
// scripts/reference/gen_scf1d_reference.py; it is NOT Kohn-Sham DFT (no exchange-correlation functional).
// @source S-011 (self-consistent field), S-047 (finite-difference Schrodinger equation)
// @source S-031 (1 hartree = 27.211386245988 eV, CODATA 2018)
// Model: v_ext(x) = -Z / sqrt(x^2 + 1), w(x - x') = 1 / sqrt((x - x')^2 + 1), n = 2 |phi|^2,
// v_H(x) = h sum_x' w(x - x') n(x'), Fock operator h0 + v_H / 2 (exchange cancels half of v_H for a closed shell),
// E = 2 <phi|h0|phi> + J, J = (1/4) h^2 sum sum n(x) w n(x'). Linear mixing n_in <- (1 - alpha) n_in + alpha n_out.
import { makeGrid, solveLowest } from './solver1d';

export const HARTREE_EV = 27.211386245988;

export interface ScfOptions {
  /** Nuclear charge of the soft-Coulomb well (the lab offers 1 and 2). */
  Z?: number;
  /** Linear mixing parameter, 0 < alpha <= 1 (default 0.3, as in the generator). */
  alpha?: number;
  /** Stop when the density residual is below this (default 1e-12, as in the generator). */
  tol?: number;
  maxIterations?: number;
  /** Drop the Hartree term: two non-interacting electrons (converges in one step). */
  nonInteracting?: boolean;
  /** Half-width of the box in bohr (default 15) and number of interior points (default 299). */
  L?: number;
  M?: number;
}

export interface ScfIteration {
  /** 1-based iteration number. */
  iteration: number;
  /** Input density of this iteration (the one the potential was built from). */
  densityIn: Float64Array;
  /** Density of the new orbital. */
  densityOut: Float64Array;
  /** Effective potential v_ext + v_H / 2 built from densityIn. */
  potential: Float64Array;
  /** Hartree potential v_H built from densityIn. */
  hartree: Float64Array;
  orbitalEnergy: number;
  /** Hartree-Fock energy expression evaluated with the new orbital and its density. */
  totalEnergy: number;
  /** sqrt(h sum (n_out - n_in)^2). */
  residual: number;
  /** Dot product of this and the previous density change; negative means the update flipped direction. */
  turn: number;
}

export type ScfBehaviour = 'converged' | 'oscillating' | 'diverging' | 'slow';

export interface ScfResult {
  x: Float64Array;
  h: number;
  vext: Float64Array;
  iterations: ScfIteration[];
  converged: boolean;
  /** Heuristic label from the residual history (see `classify`). */
  behaviour: ScfBehaviour;
  /** Final values, computed as the generator does after the loop. */
  energy: number;
  orbitalEnergy: number;
  J: number;
  density: Float64Array;
  densityIntegral: number;
  /** 2 x lowest eigenvalue of h0 alone. */
  nonInteractingEnergy: number;
}

const C = 0.5; // hbar^2 / 2m in atomic units

function hartreePotential(n: Float64Array, x: Float64Array, h: number): Float64Array {
  const m = n.length;
  const v = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += n[j]! / Math.sqrt((x[i]! - x[j]!) ** 2 + 1);
    v[i] = h * s;
  }
  return v;
}

function lowest(V: Float64Array, h: number): { eps: number; phi: Float64Array } {
  const s = solveLowest(C, h, V, 1);
  return { eps: s.energies[0]!, phi: s.states[0]! };
}

/** <phi|h0|phi> with the same 3-point operator and Dirichlet walls. */
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
  return 0.25 * h * s; // (1/4) h^2 n W n, with vH = h W n
}

const square2 = (phi: Float64Array) => phi.map((p) => 2 * p * p);

/**
 * Heuristic classification of a residual history: 'converged' when the last residual is below tol; 'oscillating' when
 * at least half of the last 20 updates flip direction (negative `turn`) and the residual is not falling by half;
 * 'diverging' when the residual grew by more than 10x from its smallest value; otherwise 'slow'.
 */
export function classify(its: readonly ScfIteration[], tol: number): ScfBehaviour {
  const last = its[its.length - 1];
  if (!last) return 'slow';
  if (last.residual < tol) return 'converged';
  const tail = its.slice(-20);
  const flips = tail.filter((i) => i.turn < 0).length;
  const falling = tail.length > 1 && tail[tail.length - 1]!.residual < 0.5 * tail[0]!.residual;
  if (flips >= tail.length / 2 && !falling) return 'oscillating';
  const minR = Math.min(...its.map((i) => i.residual));
  if (last.residual > 10 * minR || !Number.isFinite(last.residual)) return 'diverging';
  return 'slow';
}

/** Run the SCF loop and return every iteration. */
export function runScf(opts: ScfOptions = {}): ScfResult {
  const Z = opts.Z ?? 2;
  const alpha = opts.alpha ?? 0.3;
  const tol = opts.tol ?? 1e-12;
  const maxit = opts.maxIterations ?? 2000;
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError('The mixing parameter must be in (0, 1].');
  const { x, h } = makeGrid(-(opts.L ?? 15), opts.L ?? 15, opts.M ?? 299);
  const m = x.length;
  const vext = x.map((xi) => -Z / Math.sqrt(xi * xi + 1));
  const zero = new Float64Array(m);
  const vHof = (n: Float64Array) => (opts.nonInteracting ? zero : hartreePotential(n, x, h));
  const start = lowest(vext, h);
  let n = square2(start.phi);
  const iterations: ScfIteration[] = [];
  let prevDiff: Float64Array | undefined;
  let converged = false;
  for (let it = 1; it <= maxit; it++) {
    const vH = vHof(n);
    const veff = new Float64Array(m);
    for (let i = 0; i < m; i++) veff[i] = vext[i]! + 0.5 * vH[i]!;
    const { eps, phi } = lowest(veff, h);
    const nOut = square2(phi);
    const diff = new Float64Array(m);
    let r2 = 0;
    for (let i = 0; i < m; i++) {
      diff[i] = nOut[i]! - n[i]!;
      r2 += diff[i]! * diff[i]!;
    }
    let turn = 0;
    if (prevDiff) for (let i = 0; i < m; i++) turn += diff[i]! * prevDiff[i]!;
    prevDiff = diff;
    const residual = Math.sqrt(h * r2);
    const vHout = vHof(nOut);
    const totalEnergy = 2 * h0Expectation(phi, vext, h) + hartreeEnergy(nOut, vHout, h);
    iterations.push({
      iteration: it,
      densityIn: n,
      densityOut: nOut,
      potential: veff,
      hartree: vH,
      orbitalEnergy: eps,
      totalEnergy,
      residual,
      turn,
    });
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
  // final evaluation exactly as the generator does it
  const vH = vHof(n);
  const veff = vext.map((v, i) => v + 0.5 * vH[i]!);
  const fin = lowest(veff, h);
  const J = hartreeEnergy(n, vH, h);
  const energy = 2 * h0Expectation(fin.phi, vext, h) + J;
  let integral = 0;
  for (let i = 0; i < m; i++) integral += n[i]!;
  return {
    x,
    h,
    vext,
    iterations,
    converged,
    behaviour: classify(iterations, tol),
    energy,
    orbitalEnergy: fin.eps,
    J,
    density: n,
    densityIntegral: h * integral,
    nonInteractingEnergy: 2 * start.eps,
  };
}
