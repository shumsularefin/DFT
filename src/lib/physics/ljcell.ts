// A periodic cell of Lennard-Jones atoms: energy, forces, the virial stress tensor and three structure optimizers
// (steepest descent, damped dynamics, quasi-Newton BFGS). A teaching model for reading forces, stress and relaxations;
// the parameters are chosen so forces have the size of typical DFT forces, not to describe a real element.
//
//   phi(r) = 4 eps [ (s/r)^12 - (s/r)^6 ] - phi(rc), cut at rc (shifted so the energy is continuous)
//   F_i = -dE/dR_i,  sigma_ab = (1/V) sum_pairs phi'(r) r_a r_b / r = (1/V) dE/d(strain_ab),  p = -tr(sigma) / 3
// The stress sign follows the handbook text: a squeezed cell has dE/dV < 0, so p > 0 (VASP prints p in kB).
// @source S-125 (Frenkel and Smit, and Verlet 1967: Lennard-Jones model, minimum image, virial pressure)
// @source S-092 (Nielsen and Martin: stress as the strain derivative of the energy), S-093 (forces as -dE/dR)
// @source S-068 (Numerical Recipes: steepest descent and the BFGS quasi-Newton update), S-041 and S-019 (IBRION, POTIM)
import { EV_PER_A3_IN_GPA, KBAR_IN_GPA } from './constants';

export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];

export interface LJ {
  /** Well depth in eV. */
  eps: number;
  /** Zero crossing in Angstrom. */
  sigma: number;
  /** Cutoff in Angstrom (must be shorter than the smallest cell width). */
  rc: number;
}

/** Toy parameters: a well of 0.05 eV and a nearest-neighbour distance near 2.5 Angstrom (copper-like spacing). */
export const TOY_LJ: LJ = { eps: 0.05, sigma: 2.3, rc: 2.5 * 2.3 };

export function ljPair(p: LJ, r: number): { e: number; de: number } {
  const sr6 = (p.sigma / r) ** 6;
  const src6 = (p.sigma / p.rc) ** 6;
  const e = 4 * p.eps * (sr6 * sr6 - sr6) - 4 * p.eps * (src6 * src6 - src6);
  const de = (4 * p.eps * (-12 * sr6 * sr6 + 6 * sr6)) / r;
  return { e, de };
}

export interface Cell {
  /** Lattice rows in Angstrom. */
  lattice: M3;
  /** Cartesian positions in Angstrom. */
  positions: V3[];
}

export interface EFS {
  /** Total energy in eV. */
  energy: number;
  /** Force on each atom in eV/Angstrom. */
  forces: V3[];
  /** Stress tensor (1/V) dE/d(strain) in eV/Angstrom^3. */
  stress: M3;
  volume: number;
}

const det = (m: M3): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Energy, forces and stress of a periodic cell (all image shifts -1, 0, 1; rc below the smallest cell width). */
export function evaluate(cell: Cell, p: LJ = TOY_LJ): EFS {
  const { lattice: L, positions: X } = cell;
  const n = X.length;
  const forces: V3[] = X.map(() => [0, 0, 0]);
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let energy = 0;
  const rc2 = p.rc * p.rc;
  const shifts: V3[] = [];
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (let c = -1; c <= 1; c++)
        shifts.push([0, 1, 2].map((k) => a * L[0][k]! + b * L[1][k]! + c * L[2][k]!) as V3);
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++)
      for (const t of shifts) {
        if (i === j && !t[0] && !t[1] && !t[2]) continue;
        const d: V3 = [X[j]![0] + t[0] - X[i]![0], X[j]![1] + t[1] - X[i]![1], X[j]![2] + t[2] - X[i]![2]];
        const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (r2 >= rc2) continue;
        const r = Math.sqrt(r2);
        const { e, de } = ljPair(p, r);
        const w = i === j ? 0.5 : 1; // a self-image pair is met twice (t and -t)
        energy += w * e;
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 3; b++) S[3 * a + b] = S[3 * a + b]! + (w * de * d[a]! * d[b]!) / r;
        if (i !== j)
          for (let a = 0; a < 3; a++) {
            const f = (de * d[a]!) / r; // dE/dR_j along a
            forces[j]![a] = forces[j]![a]! - f;
            forces[i]![a] = forces[i]![a]! + f;
          }
      }
  const volume = Math.abs(det(L));
  const stress: M3 = [
    [S[0]! / volume, S[1]! / volume, S[2]! / volume],
    [S[3]! / volume, S[4]! / volume, S[5]! / volume],
    [S[6]! / volume, S[7]! / volume, S[8]! / volume],
  ];
  return { energy, forces, stress, volume };
}

/** Pressure p = -tr(sigma) / 3 in kB (1 kB = 0.1 GPa, S-041). */
export const pressureKbar = (s: M3): number =>
  (-(s[0][0] + s[1][1] + s[2][2]) / 3) * (EV_PER_A3_IN_GPA / KBAR_IN_GPA);

/** Apply a strain: every vector x becomes (I + e) x, lattice rows and positions alike. */
export function strainCell(cell: Cell, e: M3): Cell {
  const f = (v: V3): V3 =>
    [0, 1, 2].map((a) => v[a]! + e[a]![0]! * v[0] + e[a]![1]! * v[1] + e[a]![2]! * v[2]) as V3;
  return { lattice: cell.lattice.map(f) as M3, positions: cell.positions.map(f) };
}

/** Conventional fcc supercell n x n x n (4 n^3 atoms) with cubic constant a. */
export function fccSupercell(a: number, n: number): Cell {
  const basis: V3[] = [
    [0, 0, 0],
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ];
  const positions: V3[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        for (const b of basis) positions.push([(i + b[0]) * a, (j + b[1]) * a, (k + b[2]) * a]);
  return {
    lattice: [
      [n * a, 0, 0],
      [0, n * a, 0],
      [0, 0, n * a],
    ],
    positions,
  };
}

/** The cubic constant at which the fcc crystal has zero pressure (bisection on p). */
export function equilibriumFcc(p: LJ = TOY_LJ, n = 2): number {
  let lo = p.sigma * 1.4;
  let hi = p.sigma * 1.75;
  const pr = (a: number) => pressureKbar(evaluate(fccSupercell(a, n), p).stress);
  for (let it = 0; it < 60; it++) {
    const m = 0.5 * (lo + hi);
    if (pr(m) > 0) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

export const maxForce = (f: readonly V3[]): { value: number; index: number } => {
  let value = 0;
  let index = 0;
  f.forEach((v, i) => {
    const m = Math.hypot(v[0], v[1], v[2]);
    if (m > value) [value, index] = [m, i];
  });
  return { value, index };
};

export type Optimizer = 'sd' | 'damped' | 'bfgs';

export interface RelaxStep {
  positions: V3[];
  energy: number;
  fmax: number;
}

/** Largest move of one atom in one step, in Angstrom (a safety cap, as optimizers in practice also limit the step). */
export const MAX_STEP = 0.25;

/**
 * Relax the positions at fixed cell. `potim` scales the step like VASP's POTIM: steepest descent moves potim times
 * 0.4 Angstrom^2/eV times the force; damped dynamics uses potim as the time step with damping 0.25 per step
 * (velocity v <- 0.75 v + 0.4 potim F, then x <- x + potim v); BFGS starts from the inverse Hessian 0.4 potim Angstrom^2/eV and updates it from the force history (S-068).
 */
export function relax(
  start: Cell,
  method: Optimizer,
  potim: number,
  steps: number,
  p: LJ = TOY_LJ,
): RelaxStep[] {
  const n = start.positions.length;
  const dim = 3 * n;
  let x = start.positions.flatMap((v) => [...v]);
  const evalAt = (q: number[]) => {
    const pos: V3[] = [];
    for (let i = 0; i < n; i++) pos.push([q[3 * i]!, q[3 * i + 1]!, q[3 * i + 2]!]);
    const r = evaluate({ lattice: start.lattice, positions: pos }, p);
    return { pos, e: r.energy, g: r.forces.flatMap((f) => [...f]), fmax: maxForce(r.forces).value };
  };
  let cur = evalAt(x);
  const out: RelaxStep[] = [{ positions: cur.pos, energy: cur.e, fmax: cur.fmax }];
  const cap = (d: number[]) => {
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.hypot(d[3 * i]!, d[3 * i + 1]!, d[3 * i + 2]!));
    const s = m > MAX_STEP ? MAX_STEP / m : 1;
    return d.map((v) => v * s);
  };
  let vel = new Array<number>(dim).fill(0);
  const h0 = 0.4 * potim;
  // inverse Hessian, dense (dim is at most about 100 here)
  let H: number[][] | null = null;
  if (method === 'bfgs')
    H = Array.from({ length: dim }, (_, i) => Array.from({ length: dim }, (_, j) => (i === j ? h0 : 0)));
  for (let s = 0; s < steps; s++) {
    let d: number[];
    if (method === 'sd') d = cur.g.map((f) => h0 * f);
    else if (method === 'damped') {
      vel = vel.map((v, i) => 0.75 * v + 0.4 * potim * cur.g[i]!);
      d = vel.map((v) => potim * v);
    } else d = H!.map((row) => row.reduce((acc, h, j) => acc + h * cur.g[j]!, 0));
    d = cap(d);
    const xn = x.map((v, i) => v + d[i]!);
    const nxt = evalAt(xn);
    if (method === 'bfgs') {
      // gradient is -force; y = grad_new - grad_old, sx = step
      const y = nxt.g.map((f, i) => -(f - cur.g[i]!));
      const sy = d.reduce((acc, v, i) => acc + v * y[i]!, 0);
      if (sy > 1e-12) {
        const Hy = H!.map((row) => row.reduce((acc, h, j) => acc + h * y[j]!, 0));
        const yHy = y.reduce((acc, v, i) => acc + v * Hy[i]!, 0);
        const c1 = (sy + yHy) / (sy * sy);
        H = H!.map((row, i) =>
          row.map((h, j) => h + c1 * d[i]! * d[j]! - (Hy[i]! * d[j]! + d[i]! * Hy[j]!) / sy),
        );
      }
    }
    x = xn;
    cur = nxt;
    out.push({ positions: cur.pos, energy: cur.e, fmax: cur.fmax });
  }
  return out;
}

/** A small deterministic pseudo-random generator (mulberry32) for reproducible rattles. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
