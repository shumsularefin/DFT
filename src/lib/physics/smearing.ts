// Smearing functions for partial occupations (M7.2, lab "smearing").
// Convention used everywhere here: x = (epsilon - mu) / sigma, so occupied states have x < 0.
//   occupation f(x) = integral from x to infinity of delta(t) dt  (f -> 1 for x -> -inf, f -> 0 for x -> +inf)
//   broadened delta(x) = -df/dx
//   entropy-like term s(x) = -integral from -inf to x of t delta(t) dt; the smearing contribution to the free
//   energy is -T S = -sigma * sum_i w_i s(x_i) (VASP prints T*S as EENTRO). For Fermi-Dirac s is the usual
//   -f ln f - (1 - f) ln(1 - f).
// @source S-015 (Methfessel-Paxton: delta_N = sum_n A_n H_2n(x) exp(-x^2), A_n = (-1)^n / (n! 4^n sqrt(pi)))
// @source S-016 (Marzari-Vanderbilt cold smearing). Marzari and Vanderbilt write
//   delta(u) = exp(-(u - 1/sqrt2)^2) (2 - sqrt2 u) / sqrt(pi) with u = (mu - epsilon)/sigma = -x;
//   here it is used as delta(x) = exp(-(x + 1/sqrt2)^2) (2 + sqrt2 x) / sqrt(pi). See Q-041.
// @source S-053 (error function)
import { erf } from './tightbinding2d';

export type SmearingMethod = 'fermi-dirac' | 'gaussian' | 'mp1' | 'mp2' | 'cold';

const SQRT_PI = Math.sqrt(Math.PI);
const SQRT2 = Math.SQRT2;

/** erfc without cancellation for large positive x (continued fraction beyond x = 3). */
export function erfc(x: number): number {
  if (x < 3) return 1 - erf(x);
  // Lentz continued fraction for erfc, accurate to double precision for x >= 3
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < 200; n++) {
    const a = n / 2;
    D = x + a * D;
    D = 1 / D;
    C = x + a / C;
    const d = C * D;
    f *= d;
    if (Math.abs(d - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** Physicists' Hermite polynomial H_n(x). */
export function hermite(n: number, x: number): number {
  if (n === 0) return 1;
  let a = 1;
  let b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - 2 * k * a;
    a = b;
    b = c;
  }
  return b;
}

/** Methfessel-Paxton coefficient A_n = (-1)^n / (n! 4^n sqrt(pi)). */
export function mpA(n: number): number {
  let fact = 1;
  for (let k = 2; k <= n; k++) fact *= k;
  return (n % 2 ? -1 : 1) / (fact * 4 ** n * SQRT_PI);
}

const mpOrder = (m: SmearingMethod) => (m === 'mp1' ? 1 : m === 'mp2' ? 2 : 0);

export function occupation(method: SmearingMethod, x: number): number {
  switch (method) {
    case 'fermi-dirac':
      return x > 0 ? Math.exp(-x) / (1 + Math.exp(-x)) : 1 / (1 + Math.exp(x));
    case 'cold': {
      const u = x + 1 / SQRT2;
      return 0.5 * erfc(u) + Math.exp(-u * u) / Math.sqrt(2 * Math.PI);
    }
    default: {
      const N = mpOrder(method);
      let f = 0.5 * erfc(x);
      for (let n = 1; n <= N; n++) f += mpA(n) * hermite(2 * n - 1, x) * Math.exp(-x * x);
      return f;
    }
  }
}

export function delta(method: SmearingMethod, x: number): number {
  switch (method) {
    case 'fermi-dirac': {
      const c = Math.cosh(x / 2);
      return 1 / (4 * c * c);
    }
    case 'cold': {
      const u = x + 1 / SQRT2;
      return (Math.exp(-u * u) * (2 + SQRT2 * x)) / SQRT_PI;
    }
    default: {
      const N = mpOrder(method);
      let d = 0;
      for (let n = 0; n <= N; n++) d += mpA(n) * hermite(2 * n, x);
      return d * Math.exp(-x * x);
    }
  }
}

/** Entropy-like term s(x) = -integral_{-inf}^{x} t delta(t) dt (closed forms). */
export function entropy(method: SmearingMethod, x: number): number {
  switch (method) {
    case 'fermi-dirac': {
      const f = occupation('fermi-dirac', x);
      const g = 1 - f;
      return (f > 0 ? -f * Math.log(f) : 0) + (g > 0 ? -g * Math.log(g) : 0);
    }
    case 'cold': {
      const u = x + 1 / SQRT2;
      return (u * Math.exp(-u * u)) / Math.sqrt(2 * Math.PI);
    }
    default: {
      const N = mpOrder(method);
      return 0.5 * mpA(N) * hermite(2 * N, x) * Math.exp(-x * x);
    }
  }
}

export const METHODS: { id: SmearingMethod; label: string; ismear: string }[] = [
  { id: 'fermi-dirac', label: 'Fermi-Dirac', ismear: '-1' },
  { id: 'gaussian', label: 'Gaussian', ismear: '0' },
  { id: 'mp1', label: 'Methfessel-Paxton order 1', ismear: '1' },
  { id: 'mp2', label: 'Methfessel-Paxton order 2', ismear: '2' },
  { id: 'cold', label: 'Marzari-Vanderbilt (cold)', ismear: '' },
];

/**
 * Toy metal: free-electron density of states g(e) = (3/2) sqrt(e) / eF^(3/2) for one electron (e >= 0, eV),
 * so that it holds exactly one electron up to eF at sigma = 0. For a smearing width sigma the Fermi level mu is
 * found so that the electron count stays 1; returns the band energy E, the entropy term T*S and F = E - T*S,
 * all in eV per electron, with E(sigma = 0) = (3/5) eF exactly.
 * @source S-050 (free-electron density of states)
 */
export function toyMetal(
  method: SmearingMethod,
  sigma: number,
  eF = 5,
): { mu: number; E: number; TS: number } {
  const g = (e: number) => (1.5 * Math.sqrt(e)) / eF ** 1.5;
  if (sigma <= 0) return { mu: eF, E: 0.6 * eF, TS: 0 };
  const top = eF + 14 * sigma + 1;
  const n = 6000;
  const h = top / n;
  const integrate = (fn: (e: number) => number) => {
    // Simpson on [0, top]
    let s = fn(0) + fn(top);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(i * h);
    return (s * h) / 3;
  };
  const count = (mu: number) => integrate((e) => g(e) * occupation(method, (e - mu) / sigma));
  let lo = eF - 10 * sigma;
  let hi = eF + 10 * sigma;
  for (let it = 0; it < 80; it++) {
    const mid = 0.5 * (lo + hi);
    if (count(mid) > 1) hi = mid;
    else lo = mid;
  }
  const mu = 0.5 * (lo + hi);
  const E = integrate((e) => g(e) * e * occupation(method, (e - mu) / sigma));
  const TS = sigma * integrate((e) => g(e) * entropy(method, (e - mu) / sigma));
  return { mu, E, TS };
}
