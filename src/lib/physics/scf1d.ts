// One-dimensional self-consistent-field toy model for the SCF lab (M7.1). A port, operator by operator, of
// scripts/reference/gen_scf1d_reference.py: two electrons in one spatial orbital (closed-shell restricted
// Hartree-Fock) in a soft-Coulomb potential v_ext(x) = -Z / sqrt(x^2 + 1), interacting through
// w(x - x') = 1 / sqrt((x - x')^2 + 1). Atomic units (hartree, bohr). For a closed shell of two electrons the
// exchange potential cancels half the Hartree potential, so the Fock operator is h0 + v_H / 2.
// This is NOT Kohn-Sham DFT: there is no exchange-correlation functional. It shows the self-consistency loop.
// @source S-047 (finite-difference Schrodinger equation)
// @source S-048 (Hartree-Fock, closed shell, Hartree and exchange terms)
// @source S-012 (the self-consistency cycle of Kohn and Sham)
import { makeGrid, solveLowest } from './solver1d';

export interface ScfOptions {
  /** Nuclear charge of the soft-Coulomb well (the lab offers 1 and 2). */
  Z: number;
  /** Linear mixing parameter: n_next = (1 - alpha) n_in + alpha n_out. */
  alpha: number;
  /** Include the electron-electron interaction (false: two independent electrons, converged in one step). */
  interacting?: boolean;
  /** Stop when the density residual is below this. */
  tol?: number;
  maxIterations?: number;
  /** Half-width of the box in bohr (generator: 15). */
  L?: number;
  /** Interior grid points (generator: 299, spacing 0.1 bohr). */
  M?: number;
}

export interface ScfIteration {
  /** 1-based iteration number. */
  index: number;
  /** Input density of this iteration. */
  densityIn: Float64Array;
  /** Density from the orbital solved in this iteration's potential. */
  densityOut: Float64Array;
  /** Effective potential v_ext + v_H / 2 used in this iteration. */
  potential: Float64Array;
  /** Orbital energy of the solved orbital (hartree). */
  orbitalEnergy: number;
  /** Total energy evaluated with the output orbital (hartree). */
  totalEnergy: number;
  /** sqrt(h * sum (n_out - n_in)^2). */
  residual: number;
}

export interface ScfResult {
  x: Float64Array;
  h: number;
  vext: Float64Array;
  iterations: ScfIteration[];
  converged: boolean;
  /** 'converged' | 'oscillating' (residual history goes up and down without settling) | 'slow' | 'diverging'. */
  behaviour: 'converged' | 'oscillating' | 'slow' | 'diverging';
  /** Final quantities after convergence (or after the last iteration), as the generator computes them. */
  E: number;
  orbitalEnergy: number;
  J: number;
  densityIntegral: number;
  /** Two times the lowest orbital energy without interaction. */
  E_noninteracting: number;
}

const kernels = new Map<string, Float64Array>();
/** The interaction matrix w(x_i - x_j), computed once per grid. */
function kernel(x: Float64Array): Float64Array {
  const key = `${x.length}:${x[0]}`;
  let W = kernels.get(key);
  if (!W) {
    const M = x.length;
    W = new Float64Array(M * M);
    for (let i = 0; i < M; i++)
      for (let j = 0; j < M; j++) {
        const d = x[i]! - x[j]!;
        W[i * M + j] = 1 / Math.sqrt(d * d + 1);
      }
    kernels.set(key, W);
  }
  return W;
}

function hartree(x: Float64Array, h: number, n: Float64Array): Float64Array {
  const M = x.length;
  const W = kernel(x);
  const vH = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    let s = 0;
    const row = i * M;
    for (let j = 0; j < M; j++) s += W[row + j]! * n[j]!;
    vH[i] = h * s;
  }
  return vH;
}

function lowest(c: number, h: number, V: Float64Array): { eps: number; phi: Float64Array } {
  const sol = solveLowest(c, h, V, 1);
  return { eps: sol.energies[0]!, phi: sol.states[0]! };
}

function energyOf(
  phi: Float64Array,
  h: number,
  vext: Float64Array,
  n: Float64Array,
  vH: Float64Array,
): {
  E: number;
  J: number;
} {
  const M = phi.length;
  let h0 = 0;
  for (let i = 0; i < M; i++) {
    const right = i + 1 < M ? phi[i + 1]! : 0;
    const left = i > 0 ? phi[i - 1]! : 0;
    const lap = (right - 2 * phi[i]! + left) / (h * h);
    h0 += phi[i]! * (-0.5 * lap + vext[i]! * phi[i]!);
  }
  h0 *= h;
  // J = (1/4) h^2 n W n = (1/4) h * sum_i n_i vH_i, since vH = h W n
  let J = 0;
  for (let i = 0; i < M; i++) J += n[i]! * vH[i]!;
  J *= 0.25 * h;
  return { E: 2 * h0 + J, J };
}

/**
 * Classify a run from its residual history. `cycle` is the distance between the input densities of the last
 * iteration and the one two steps earlier, relative to the last residual: near 0 means the loop jumps back and
 * forth between two densities (a period-2 oscillation, typical of too much mixing).
 */
export function classify(res: number[], converged: boolean, cycle = Infinity): ScfResult['behaviour'] {
  if (converged) return 'converged';
  const tail = res.slice(-40);
  if (tail.length < 4) return 'slow';
  const first = tail[0]!;
  const last = tail[tail.length - 1]!;
  if (!Number.isFinite(last) || last > 10 * first) return 'diverging';
  if (cycle < 1e-3) return 'oscillating';
  let turns = 0;
  for (let i = 1; i < tail.length - 1; i++) {
    const a = tail[i]! - tail[i - 1]!;
    const b = tail[i + 1]! - tail[i]!;
    if (a * b < 0) turns++;
  }
  if (turns > tail.length / 2 && last > first / 10) return 'oscillating';
  return 'slow';
}

function cycleDistance(its: ScfIteration[], h: number): number {
  if (its.length < 3) return Infinity;
  const a = its[its.length - 1]!;
  const b = its[its.length - 3]!;
  let s = 0;
  for (let i = 0; i < a.densityIn.length; i++) s += (a.densityIn[i]! - b.densityIn[i]!) ** 2;
  return Math.sqrt(h * s) / Math.max(a.residual, 1e-300);
}

export function runScf(opts: ScfOptions): ScfResult {
  const { Z, alpha } = opts;
  const interacting = opts.interacting ?? true;
  const tol = opts.tol ?? 1e-12;
  const maxIterations = opts.maxIterations ?? 2000;
  const L = opts.L ?? 15;
  const M = opts.M ?? 299;
  const c = 0.5;
  const { x, h } = makeGrid(-L, L, M);
  const vext = new Float64Array(M);
  for (let i = 0; i < M; i++) vext[i] = -Z / Math.sqrt(x[i]! * x[i]! + 1);

  const start = lowest(c, h, vext);
  let n = new Float64Array(M);
  for (let i = 0; i < M; i++) n[i] = 2 * start.phi[i]! ** 2;
  const iterations: ScfIteration[] = [];
  let converged = false;
  const veff = (dens: Float64Array) => {
    const vH = interacting ? hartree(x, h, dens) : new Float64Array(M);
    const v = new Float64Array(M);
    for (let i = 0; i < M; i++) v[i] = vext[i]! + 0.5 * vH[i]!;
    return { v, vH };
  };

  for (let it = 1; it <= maxIterations; it++) {
    const { v } = veff(n);
    const { eps, phi } = lowest(c, h, v);
    const nOut = new Float64Array(M);
    let s = 0;
    for (let i = 0; i < M; i++) {
      nOut[i] = 2 * phi[i]! ** 2;
      s += (nOut[i]! - n[i]!) ** 2;
    }
    const residual = Math.sqrt(h * s);
    const { E } = energyOf(phi, h, vext, nOut, interacting ? hartree(x, h, nOut) : new Float64Array(M));
    iterations.push({
      index: it,
      densityIn: n,
      densityOut: nOut,
      potential: v,
      orbitalEnergy: eps,
      totalEnergy: E,
      residual,
    });
    if (residual < tol) {
      n = nOut;
      converged = true;
      break;
    }
    if (!Number.isFinite(residual)) break;
    const next = new Float64Array(M);
    for (let i = 0; i < M; i++) next[i] = (1 - alpha) * n[i]! + alpha * nOut[i]!;
    n = next;
  }
  const { v, vH } = veff(n);
  const fin = lowest(c, h, v);
  const { E, J } = energyOf(fin.phi, h, vext, n, vH);
  let integral = 0;
  for (let i = 0; i < M; i++) integral += n[i]!;
  return {
    x,
    h,
    vext,
    iterations,
    converged,
    behaviour: classify(
      iterations.map((i) => i.residual),
      converged,
      cycleDistance(iterations, h),
    ),
    E,
    orbitalEnergy: fin.eps,
    J,
    densityIntegral: h * integral,
    E_noninteracting: 2 * start.eps,
  };
}
