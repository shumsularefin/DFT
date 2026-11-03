// Hydrogen-like (one-electron) orbitals: radial functions, real spherical harmonics, sampling.
// @source S-047 (Griffiths and Schroeter: hydrogen atom; R_nl with associated Laguerre polynomials; <r>)
// @source S-031 (Bohr radius, Rydberg energy)
// Lengths are in Bohr radii (a0) unless a name says Angstrom. Radial functions R_nl have units a0^(-3/2).
import { BOHR_RADIUS_ANGSTROM, RYDBERG_ENERGY_EV } from './constants';
import { integrateRadial } from './quadrature';

/** Generalised Laguerre polynomial L_k^(alpha)(x) by the three-term recurrence. */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let p0 = 1;
  let p1 = 1 + alpha - x;
  for (let j = 2; j <= k; j++) {
    const p2 = ((2 * j - 1 + alpha - x) * p1 - (j - 1 + alpha) * p0) / j;
    p0 = p1;
    p1 = p2;
  }
  return p1;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Radial function R_nl(r), r in a0. */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  const norm = Math.sqrt(((2 / n) ** 3 * factorial(n - l - 1)) / (2 * n * factorial(n + l)));
  return norm * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Radial probability density r^2 R_nl(r)^2 per a0. Its integral over r is 1. */
export const radialProbability = (n: number, l: number, r: number): number => r * r * radial(n, l, r) ** 2;

/** Number of radial nodes (zeros of R_nl for r > 0): n - l - 1. */
export const radialNodeCount = (n: number, l: number): number => n - l - 1;

/** Energy in eV of level n: minus the Rydberg energy over n^2. */
export const energyEV = (n: number): number => -RYDBERG_ENERGY_EV / (n * n);

/** A radius that holds essentially all of the probability, in a0. */
export const extentA0 = (n: number): number => 6 * n * n + 30;

/** Radius in a0 inside which the fraction q of the probability lies (q < 1), from the cumulative radial distribution. */
export function radialQuantile(n: number, l: number, q: number): number {
  const top = extentA0(n);
  const N = 6000;
  const dr = top / N;
  let total = 0;
  const cum = new Float64Array(N + 1);
  let prev = 0;
  for (let i = 1; i <= N; i++) {
    const p = radialProbability(n, l, i * dr);
    total += 0.5 * (prev + p) * dr;
    cum[i] = total;
    prev = p;
  }
  let i = 0;
  while (i < N && cum[i]! < q * total) i++;
  return i * dr;
}

/** Expectation value <r^k> in a0^k by quadrature on a non-uniform grid. */
export function expectationR(n: number, l: number, k = 1): number {
  return integrateRadial((r) => radialProbability(n, l, r) * r ** k, extentA0(n), 6000);
}

/** Radii (a0) where R_nl changes sign, found by scanning and bisection. Length n - l - 1. */
export function radialNodeRadii(n: number, l: number): number[] {
  const out: number[] = [];
  const top = extentA0(n);
  const steps = 4000;
  let prev = radial(n, l, 1e-6);
  let rPrev = 1e-6;
  for (let i = 1; i <= steps; i++) {
    const r = (top * i) / steps;
    const v = radial(n, l, r);
    if (prev * v < 0) {
      let lo = rPrev;
      let hi = r;
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        if (radial(n, l, lo) * radial(n, l, mid) <= 0) hi = mid;
        else lo = mid;
      }
      out.push((lo + hi) / 2);
    }
    prev = v;
    rPrev = r;
  }
  return out;
}

/** Radius of the global maximum of r^2 R_nl^2, in a0. */
export function mostProbableRadius(n: number, l: number): number {
  const top = extentA0(n);
  const steps = 6000;
  let best = 0;
  let bestV = -1;
  for (let i = 1; i <= steps; i++) {
    const r = (top * i) / steps;
    const v = radialProbability(n, l, r);
    if (v > bestV) {
      bestV = v;
      best = r;
    }
  }
  // golden-section refinement inside the winning cell
  let a = best - top / steps;
  let b = best + top / steps;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 80; k++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (radialProbability(n, l, c) > radialProbability(n, l, d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

/* Real spherical harmonics, l = 0..3, m = -l..l, written in the Cartesian components of a unit vector. */

export const MAX_L = 3;

/** Real spherical harmonic Y_lm(x, y, z) for a unit vector. Orthonormal over the sphere; positive Cartesian coefficients. */
export function realYlm(l: number, m: number, x: number, y: number, z: number): number {
  const pi = Math.PI;
  switch (l) {
    case 0:
      return 1 / (2 * Math.sqrt(pi));
    case 1: {
      const c = Math.sqrt(3 / (4 * pi));
      return c * (m === -1 ? y : m === 0 ? z : x);
    }
    case 2:
      switch (m) {
        case -2:
          return 0.5 * Math.sqrt(15 / pi) * x * y;
        case -1:
          return 0.5 * Math.sqrt(15 / pi) * y * z;
        case 0:
          return 0.25 * Math.sqrt(5 / pi) * (3 * z * z - 1);
        case 1:
          return 0.5 * Math.sqrt(15 / pi) * x * z;
        default:
          return 0.25 * Math.sqrt(15 / pi) * (x * x - y * y);
      }
    case 3:
      switch (m) {
        case -3:
          return 0.25 * Math.sqrt(35 / (2 * pi)) * y * (3 * x * x - y * y);
        case -2:
          return 0.5 * Math.sqrt(105 / pi) * x * y * z;
        case -1:
          return 0.25 * Math.sqrt(21 / (2 * pi)) * y * (5 * z * z - 1);
        case 0:
          return 0.25 * Math.sqrt(7 / pi) * z * (5 * z * z - 3);
        case 1:
          return 0.25 * Math.sqrt(21 / (2 * pi)) * x * (5 * z * z - 1);
        case 2:
          return 0.25 * Math.sqrt(105 / pi) * z * (x * x - y * y);
        default:
          return 0.25 * Math.sqrt(35 / (2 * pi)) * x * (x * x - 3 * y * y);
      }
    default:
      throw new Error(`l = ${l} is not supported (l <= ${MAX_L})`);
  }
}

/** Same harmonic from polar angle theta and azimuth phi. */
export function realYlmAngles(l: number, m: number, theta: number, phi: number): number {
  const s = Math.sin(theta);
  return realYlm(l, m, s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta));
}

const LETTERS = ['s', 'p', 'd', 'f'] as const;
const SUBSCRIPTS: Record<number, Record<number, string>> = {
  0: { 0: '' },
  1: { [-1]: 'y', 0: 'z', 1: 'x' },
  2: { [-2]: 'xy', [-1]: 'yz', 0: 'z2', 1: 'xz', 2: 'x2-y2' },
  3: { [-3]: 'y(3x2-y2)', [-2]: 'xyz', [-1]: 'yz2', 0: 'z3', 1: 'xz2', 2: 'z(x2-y2)', 3: 'x(x2-3y2)' },
};

export interface Orbital {
  n: number;
  l: number;
  /** Real-orbital index, -l..l. */
  m: number;
  /** Text label such as "2p_z" or "3d_xy". */
  label: string;
}

export function orbitalLabel(n: number, l: number, m: number): string {
  const sub = SUBSCRIPTS[l]?.[m] ?? '';
  return `${n}${LETTERS[l]}${sub ? `_${sub}` : ''}`;
}

/** All real orbitals with n <= nMax, ordered by n, l, m. */
export function listOrbitals(nMax = 4): Orbital[] {
  const out: Orbital[] = [];
  for (let n = 1; n <= nMax; n++)
    for (let l = 0; l < n && l <= MAX_L; l++)
      for (let m = -l; m <= l; m++) out.push({ n, l, m, label: orbitalLabel(n, l, m) });
  return out;
}

/* Sampling */

/** Small seeded generator (mulberry32). Same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Upper bound of Y_lm^2 on the sphere, from a fine scan with a 5 percent margin. */
function angularBound(l: number, m: number): number {
  let max = 0;
  const nt = 180;
  const np = 360;
  for (let i = 0; i <= nt; i++) {
    const t = (Math.PI * i) / nt;
    for (let j = 0; j < np; j++) {
      const y = realYlmAngles(l, m, t, (2 * Math.PI * j) / np);
      if (y * y > max) max = y * y;
    }
  }
  return max * 1.05;
}

export interface OrbitalCloud {
  /** x, y, z of each point in a0, packed. */
  positions: Float32Array;
  /** Sign of the wavefunction at each point: +1 or -1. */
  signs: Int8Array;
  /** Radius in a0 holding 99 percent of the probability, for framing the view. */
  extent: number;
}

/**
 * Draws `count` points from |psi_nlm|^2: the radius by inverse CDF of r^2 R^2 (tabulated, trapezoid rule),
 * the direction by rejection sampling on Y_lm^2. Deterministic for a given seed.
 */
export function sampleOrbital(n: number, l: number, m: number, count: number, seed: number): OrbitalCloud {
  const top = extentA0(n);
  const N = 6000;
  const dr = top / N;
  const cdf = new Float64Array(N + 1);
  const rsign = new Int8Array(N + 1);
  let prevP = 0;
  for (let i = 1; i <= N; i++) {
    const r = i * dr;
    const R = radial(n, l, r);
    const p = r * r * R * R;
    cdf[i] = cdf[i - 1]! + 0.5 * (prevP + p) * dr;
    prevP = p;
    rsign[i] = R < 0 ? -1 : 1;
  }
  rsign[0] = radial(n, l, 1e-9) < 0 ? -1 : 1;
  const total = cdf[N]!;
  for (let i = 0; i <= N; i++) cdf[i] = cdf[i]! / total;
  let i99 = 0;
  while (i99 < N && cdf[i99]! < 0.99) i99++;

  const rand = mulberry32(seed);
  const bound = angularBound(l, m);
  const positions = new Float32Array(count * 3);
  const signs = new Int8Array(count);
  for (let k = 0; k < count; k++) {
    const u = rand();
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid]! < u) lo = mid;
      else hi = mid;
    }
    const span = cdf[hi]! - cdf[lo]!;
    const frac = span > 0 ? (u - cdf[lo]!) / span : 0;
    const r = (lo + frac) * dr;
    let x: number;
    let y: number;
    let z: number;
    let yv: number;
    for (;;) {
      z = 2 * rand() - 1;
      const phi = 2 * Math.PI * rand();
      const s = Math.sqrt(1 - z * z);
      x = s * Math.cos(phi);
      y = s * Math.sin(phi);
      yv = realYlm(l, m, x, y, z);
      if (rand() * bound < yv * yv) break;
    }
    positions[3 * k] = r * x;
    positions[3 * k + 1] = r * y;
    positions[3 * k + 2] = r * z;
    signs[k] = (yv < 0 ? -1 : 1) * rsign[hi]!;
  }
  return { positions, signs, extent: i99 * dr };
}

/** Convenience: a0 to Angstrom. */
export const a0ToAngstrom = (r: number): number => r * BOHR_RADIUS_ANGSTROM;
