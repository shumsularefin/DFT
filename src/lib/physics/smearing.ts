// Smearing schemes for Brillouin-zone sums in metals: occupation f(x), broadened delta(x) = -df/dx and the
// generalised entropy S(x) = integral from x to infinity of t delta(t) dt, with x = (epsilon - mu) / sigma.
// x > 0 is above the Fermi level, so f -> 1 for x -> -infinity and f -> 0 for x -> +infinity. Pure.
// @source S-015 (Methfessel-Paxton: delta_N = sum A_n H_2n(x) exp(-x^2), A_n = (-1)^n / (n! 4^n sqrt(pi)))
// @source S-016 (cold smearing; the sign convention of x is Q-045), S-019 (VASP wiki ISMEAR, SIGMA), S-049 (Martin)
// The occupation of MP and cold smearing follows by integrating delta; closed forms are checked against quadrature
// in smearing.test.ts. S(x) is the per-level entropy such that the free energy is E_band - sigma * sum S.

export const SMEARINGS = [
  { id: 'fermi', label: 'Fermi-Dirac', ismear: -1 as number | null },
  { id: 'gaussian', label: 'Gaussian', ismear: 0 },
  { id: 'mp1', label: 'Methfessel-Paxton, order 1', ismear: 1 },
  { id: 'mp2', label: 'Methfessel-Paxton, order 2', ismear: 2 },
  // the author's handbooks do not give an ISMEAR value for cold smearing, so none is claimed (Q-045)
  { id: 'cold', label: 'Marzari-Vanderbilt (cold)', ismear: null },
] as const;
export type SmearingId = (typeof SMEARINGS)[number]['id'];

const SQRT_PI = Math.sqrt(Math.PI);
const A = 1 / Math.SQRT2; // cold-smearing shift

/** Complementary error function (Numerical Recipes erfcc-style Chebyshev, relative error below 1.2e-7 is not enough, so use a series/continued fraction). */
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) {
    // Maclaurin series of erf, converges fast for small x
    let term = x;
    let sum = x;
    for (let n = 1; n < 80; n++) {
      term *= (-x * x) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-18 * Math.abs(sum)) break;
    }
    return 1 - (2 / SQRT_PI) * sum;
  }
  // continued fraction (Lentz) for large x
  let f = 0;
  for (let k = 60; k >= 1; k--) f = k / 2 / (x + f);
  return Math.exp(-x * x) / (SQRT_PI * (x + f));
}

/** Physicists' Hermite polynomial H_n(x) by recurrence. H_{-1} is not used. */
export function hermite(n: number, x: number): number {
  let a = 1;
  if (n === 0) return a;
  let b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - 2 * k * a;
    a = b;
    b = c;
  }
  return b;
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
/** Methfessel-Paxton coefficient A_n. */
export const mpCoeff = (n: number) => (n % 2 ? -1 : 1) / (factorial(n) * 4 ** n) / SQRT_PI;

function mpOrder(id: SmearingId): number {
  return id === 'gaussian' ? 0 : id === 'mp1' ? 1 : 2;
}

/** Broadened delta function, the negative derivative of the occupation. Integrates to 1. */
export function delta(id: SmearingId, x: number): number {
  if (id === 'fermi') return 1 / (4 * Math.cosh(x / 2) ** 2);
  if (id === 'cold') {
    const u = x - A;
    return (Math.exp(-u * u) * (2 - Math.SQRT2 * x)) / SQRT_PI;
  }
  const N = mpOrder(id);
  let s = 0;
  for (let n = 0; n <= N; n++) s += mpCoeff(n) * hermite(2 * n, x);
  return s * Math.exp(-x * x);
}

/** Occupation f(x). MP and cold smearing can leave [0, 1]; that is a known property of those schemes, not a bug. */
export function occupation(id: SmearingId, x: number): number {
  if (id === 'fermi') return 1 / (1 + Math.exp(Math.min(x, 700)));
  if (id === 'cold') {
    const u = x - A;
    return 0.5 * erfc(u) - Math.exp(-u * u) / Math.sqrt(2 * Math.PI);
  }
  const N = mpOrder(id);
  let f = 0.5 * erfc(x);
  for (let n = 1; n <= N; n++) f += mpCoeff(n) * hermite(2 * n - 1, x) * Math.exp(-x * x);
  return f;
}

/** Generalised per-level entropy S(x) = integral_x^inf t delta(t) dt (zero far from the Fermi level). */
export function entropy(id: SmearingId, x: number): number {
  if (id === 'fermi') {
    const f = occupation('fermi', x);
    const term = (p: number) => (p > 0 ? p * Math.log(p) : 0);
    return -(term(f) + term(1 - f));
  }
  if (id === 'cold') {
    const u = x - A;
    return (-u * Math.exp(-u * u)) / Math.sqrt(2 * Math.PI);
  }
  const N = mpOrder(id);
  return 0.5 * mpCoeff(N) * hermite(2 * N, x) * Math.exp(-x * x);
}

export interface ToyDos {
  /** Band edges in eV: states exist on [lo, hi]. */
  lo: number;
  hi: number;
  /** States per eV per atom at energy e. */
  g: (e: number) => number;
}

/** A made-up metallic DOS: a flat band with a narrow peak just below the Fermi level (0 eV). Illustrates the effect, not a real metal. */
export const TOY_DOS: ToyDos = {
  lo: -6,
  hi: 6,
  g: (e) => 0.25 + 1.2 * Math.exp(-((e + 0.15) ** 2) / (2 * 0.2 ** 2)),
};

export interface ToyResult {
  sigma: number;
  /** Chemical potential (eV) that keeps the electron count fixed. */
  mu: number;
  /** Band energy sum g eps f (eV per atom, measured from the zero-sigma value). */
  bandShift: number;
  /** Entropy term -sigma * S_total (eV per atom, negative or zero). */
  entropyTerm: number;
  /** Free energy: band energy plus entropy term, measured from the zero-sigma band energy. */
  freeShift: number;
}

function integrate(h: (e: number) => number, lo: number, hi: number, n = 6000): number {
  const dx = (hi - lo) / n;
  let s = 0.5 * (h(lo) + h(hi));
  for (let i = 1; i < n; i++) s += h(lo + i * dx);
  return s * dx;
}

/** Fixed electron count (filled up to 0 eV at zero smearing), found by bisection on mu. */
export function toyMetal(id: SmearingId, sigma: number, dos: ToyDos = TOY_DOS): ToyResult {
  if (!(sigma > 0)) throw new Error('sigma must be positive');
  const count = (mu: number) => integrate((e) => dos.g(e) * occupation(id, (e - mu) / sigma), dos.lo, dos.hi);
  const target = integrate(dos.g, dos.lo, 0, 4000);
  let a = -1.5;
  let b = 1.5;
  for (let i = 0; i < 80; i++) {
    const m = 0.5 * (a + b);
    if (count(m) < target) a = m;
    else b = m;
  }
  const mu = 0.5 * (a + b);
  const e0 = integrate((e) => dos.g(e) * e, dos.lo, 0, 4000);
  const eb = integrate((e) => dos.g(e) * e * occupation(id, (e - mu) / sigma), dos.lo, dos.hi);
  const sTot = integrate((e) => dos.g(e) * entropy(id, (e - mu) / sigma), dos.lo, dos.hi);
  const bandShift = eb - e0;
  const entropyTerm = -sigma * sTot;
  return { sigma, mu, bandShift, entropyTerm, freeShift: bandShift + entropyTerm };
}
