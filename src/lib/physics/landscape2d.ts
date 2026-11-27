// Toy model for relaxation trouble (M16.9): one "atom" on a two-dimensional energy landscape E(x, y), relaxed by the three
// kinds of optimiser VASP offers. Pure, no dependencies. Positions in Angstrom, energies in eV, forces in eV per Angstrom.
// This is a teaching model of how optimisers behave; it is not VASP's implementation of IBRION.
//   Steepest descent with a fixed step:  r <- r + h F(r)                                   (Nocedal and Wright ch. 3)
//   Damped dynamics (heavy ball):        v <- (1 - mu) v + h F(r),  r <- r + v           (Polyak 1964)
//   Nonlinear conjugate gradient:        d <- F + beta d (Polak-Ribiere, beta >= 0), one line minimisation per step
//                                        along d by a safeguarded secant search on the slope -F.d (Nocedal and Wright ch. 5)
// On a quadratic landscape with exact line searches conjugate gradient reaches the minimum in at most two steps (n = 2).
// @source S-156 (steepest descent, Polak-Ribiere conjugate gradient, line search), S-157 (heavy-ball damped dynamics)

export type LandscapeId = 'valley' | 'double-well';

export interface Landscape {
  id: LandscapeId;
  energy(x: number, y: number): number;
  /** Gradient dE/dx, dE/dy (the force is minus this). */
  gradient(x: number, y: number): [number, number];
  /** Stationary points with their kind, for labels and tests. */
  stationary: { x: number; y: number; energy: number; kind: 'minimum' | 'saddle' }[];
  /** Default start of the relaxation. */
  start: [number, number];
  /** Box drawn around the landscape, Angstrom. */
  range: [[number, number], [number, number]];
}

/** Narrow valley: E = (k1 u^2 + k2 v^2) / 2 in axes turned by 30 degrees; soft along u, stiff across (k in eV per A^2). */
export const VALLEY_K: [number, number] = [1, 12];
const TH = Math.PI / 6;
const [CT, ST] = [Math.cos(TH), Math.sin(TH)];

/** Rotate (x, y) into the valley axes (u along the floor, v across it). */
export const valleyAxes = (x: number, y: number): [number, number] => [CT * x + ST * y, -ST * x + CT * y];

const valley: Landscape = {
  id: 'valley',
  energy(x, y) {
    const [u, v] = valleyAxes(x, y);
    return 0.5 * (VALLEY_K[0] * u * u + VALLEY_K[1] * v * v);
  },
  gradient(x, y) {
    const [u, v] = valleyAxes(x, y);
    const gu = VALLEY_K[0] * u;
    const gv = VALLEY_K[1] * v;
    return [CT * gu - ST * gv, ST * gu + CT * gv];
  },
  stationary: [{ x: 0, y: 0, energy: 0, kind: 'minimum' }],
  start: [-1.9, 0.2],
  range: [
    [-2.2, 2.2],
    [-2.2, 2.2],
  ],
};

/**
 * Curved double well, symmetric under x -> -x: E = (x^2 - 1)^2 + 2 (y - 0.3 x^2)^2. Minima at (+-1, 0.3) with E = 0, a
 * saddle at (0, 0) with E = 1. A start on the line x = 0 feels no force along x, so every optimiser stays on it.
 */
const doubleWell: Landscape = {
  id: 'double-well',
  energy(x, y) {
    const w = y - 0.3 * x * x;
    return (x * x - 1) ** 2 + 2 * w * w;
  },
  gradient(x, y) {
    const w = y - 0.3 * x * x;
    return [4 * x * (x * x - 1) - 2.4 * x * w, 4 * w];
  },
  stationary: [
    { x: -1, y: 0.3, energy: 0, kind: 'minimum' },
    { x: 1, y: 0.3, energy: 0, kind: 'minimum' },
    { x: 0, y: 0, energy: 1, kind: 'saddle' },
  ],
  start: [0, 1.5],
  range: [
    [-1.9, 1.9],
    [-1, 1.9],
  ],
};

export const LANDSCAPES: Record<LandscapeId, Landscape> = { valley, 'double-well': doubleWell };

export type Method = 'sd' | 'cg' | 'damped';

export interface RelaxOptions {
  method: Method;
  /** Step factor h in Angstrom^2 per eV: the displacement is h times the force (POTIM plays this part in VASP). */
  step: number;
  /** Number of optimiser steps to take. */
  steps: number;
  start?: [number, number];
  /** Error added to every force, eV per Angstrom (a stand-in for forces from a loosely converged density). */
  noise?: number;
  /** Friction of damped dynamics, 0 < mu <= 1 (default 0.4). */
  damping?: number;
  /** Converged when the true force is below this, eV per Angstrom (default 0.01). */
  fmax?: number;
}

export interface RelaxStep {
  x: number;
  y: number;
  energy: number;
  /** Size of the true force, eV per Angstrom. */
  force: number;
  /** Points where the line search evaluated the force on the way to this point (conjugate gradient only). */
  trials: [number, number][];
}

export interface RelaxResult {
  path: RelaxStep[];
  /** First step index with |F| < fmax, or -1. */
  convergedAt: number;
  /** True when the energy ran away (above 50 eV or 10 Angstrom from the start). */
  diverged: boolean;
  /** True when a line search could not find a point where the slope changes sign (the toy's ZBRENT). */
  bracketFailed: boolean;
}

/** Small deterministic generator (mulberry32) so a noisy relaxation is the same on every build. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run an optimiser on a landscape and return every step (step 0 is the start). */
export function relax(l: Landscape, o: RelaxOptions): RelaxResult {
  const fmax = o.fmax ?? 0.01;
  const mu = o.damping ?? 0.4;
  const noise = o.noise ?? 0;
  const rand = rng(12345);
  const force = (x: number, y: number): [number, number] => {
    const g = l.gradient(x, y);
    if (!noise) return [-g[0], -g[1]];
    const a = 2 * Math.PI * rand();
    return [-g[0] + noise * Math.cos(a), -g[1] + noise * Math.sin(a)];
  };
  const record = (x: number, y: number, trials: [number, number][] = []): RelaxStep => {
    const g = l.gradient(x, y);
    return { x, y, energy: l.energy(x, y), force: Math.hypot(g[0], g[1]), trials };
  };
  let [x, y] = o.start ?? l.start;
  const x0 = x;
  const y0 = y;
  const path: RelaxStep[] = [record(x, y)];
  let vx = 0;
  let vy = 0;
  let F = force(x, y);
  let d: [number, number] = [F[0], F[1]];
  let bracketFailed = false;
  let diverged = false;
  for (let n = 1; n <= o.steps; n++) {
    let trials: [number, number][] = [];
    if (o.method === 'sd') {
      x += o.step * F[0];
      y += o.step * F[1];
    } else if (o.method === 'damped') {
      vx = (1 - mu) * vx + o.step * F[0];
      vy = (1 - mu) * vy + o.step * F[1];
      x += vx;
      y += vy;
    } else {
      // slope of E along d at x + a d: dE/da = -F . d
      const slope = (a: number) => {
        const f = force(x + a * d[0], y + a * d[1]);
        return -(f[0] * d[0] + f[1] * d[1]);
      };
      const ls = lineMinimum(slope, o.step);
      trials = ls.evaluated.map((a) => [x + a * d[0], y + a * d[1]]);
      if (!ls.bracketed) bracketFailed = true;
      x += ls.alpha * d[0];
      y += ls.alpha * d[1];
    }
    const Fn = force(x, y);
    if (o.method === 'cg') {
      const den = F[0] * F[0] + F[1] * F[1];
      const beta = den > 0 ? Math.max(0, (Fn[0] * (Fn[0] - F[0]) + Fn[1] * (Fn[1] - F[1])) / den) : 0;
      d = [Fn[0] + beta * d[0], Fn[1] + beta * d[1]];
      if (d[0] * Fn[0] + d[1] * Fn[1] <= 0) d = [Fn[0], Fn[1]]; // not downhill: restart along the force
    }
    F = Fn;
    const s = record(x, y, trials);
    path.push(s);
    if (!Number.isFinite(s.energy) || s.energy > 50 || Math.hypot(x - x0, y - y0) > 10) {
      diverged = true;
      break;
    }
  }
  const convergedAt = path.findIndex((s) => s.force < fmax);
  return { path, convergedAt, diverged, bracketFailed };
}

/**
 * Root of the slope g(a) = dE/da along a line, from g(0) < 0: try the trial step `trial`, expand until the slope changes
 * sign (bracketing, at most 12 tries), then the Illinois variant of regula falsi. On a quadratic the slope is linear in a,
 * so the first secant step is exact. Returns the step, the steps evaluated and whether a sign change was found.
 */
export function lineMinimum(
  g: (a: number) => number,
  trial: number,
): { alpha: number; evaluated: number[]; bracketed: boolean } {
  const evaluated: number[] = [];
  let a0 = 0;
  let g0 = g(0);
  if (!(g0 < 0)) return { alpha: 0, evaluated, bracketed: true };
  let a1 = trial;
  let g1 = g(a1);
  evaluated.push(a1);
  let k = 0;
  while (g1 < 0 && k < 12) {
    // still going downhill: extrapolate along the secant, at least doubling and at most four times the last stride
    const stride = a1 - a0;
    const sec = g1 > g0 ? (-g1 * stride) / (g1 - g0) : 4 * stride;
    const next = a1 + Math.min(4 * stride, Math.max(stride, sec));
    a0 = a1;
    g0 = g1;
    a1 = next;
    g1 = g(a1);
    evaluated.push(a1);
    k++;
    if (!Number.isFinite(g1)) break;
  }
  if (!(g1 >= 0)) return { alpha: a1, evaluated, bracketed: false };
  let side = 0;
  let a = a1;
  for (let it = 0; it < 40; it++) {
    a = a0 - (g0 * (a1 - a0)) / (g1 - g0);
    const ga = g(a);
    if (it < 3) evaluated.push(a);
    if (Math.abs(ga) < 1e-13 || Math.abs(a1 - a0) < 1e-13 * Math.max(1, Math.abs(a))) break;
    if (ga < 0) {
      a0 = a;
      g0 = ga;
      if (side === -1) g1 /= 2;
      side = -1;
    } else {
      a1 = a;
      g1 = ga;
      if (side === 1) g0 /= 2;
      side = 1;
    }
  }
  return { alpha: a, evaluated, bracketed: true };
}
