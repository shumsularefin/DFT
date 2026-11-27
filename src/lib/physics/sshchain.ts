// A dimerized two-site chain (the Su-Schrieffer-Heeger model) as a 1D tight-binding toy for Wannier functions: the
// Bloch states of the lower band on an N-point k-mesh, a gauge choice for their phases, and the Wannier function of
// cell 0 built from them. Lengths in units of the cell length a; site A at x = n, site B at x = n + 1/2.
//
//   H = -v sum (A_n^+ B_n + h.c.) - w sum (B_n^+ A_(n+1) + h.c.),  h(k) = -(v + w e^(-ik)),  E = -|h|, gap 2 |v - w|
//   lower band u(k) = (1, -conj(h) / |h|) / sqrt(2)
//   Wannier function of cell 0: c_s(n) = (1/N) sum_k e^(ikn) e^(i theta_k) u_s(k)  (s = A, B)
// The parallel-transport gauge (each overlap <u_k | u_k+dk> given the same phase) is the maximally localized choice in
// one dimension, and its centre is fixed by the Berry (Zak) phase: inside the cell when v > w, on the cell boundary
// (half a cell away) when w > v.
// @source S-161 (Su, Schrieffer and Heeger: the dimerized chain), S-133 (Marzari and Vanderbilt: gauge freedom,
// spread functional, maximal localization by parallel transport in 1D, Berry phase and Wannier centres)
// @source S-036 (Ashcroft and Mermin: Bloch and Wannier functions), S-049 (Martin)

export interface C {
  re: number;
  im: number;
}
const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cexp = (t: number): C => ({ re: Math.cos(t), im: Math.sin(t) });
const conj = (a: C): C => ({ re: a.re, im: -a.im });

export interface Chain {
  /** Intra-cell hopping magnitude (A_n to B_n), eV. */
  v: number;
  /** Inter-cell hopping magnitude (B_n to A_n+1), eV. */
  w: number;
  /** Number of k-points, equal to the number of cells of the periodic chain. */
  n: number;
}

export const kMesh = (n: number): number[] => Array.from({ length: n }, (_, j) => (2 * Math.PI * j) / n);

/** h(k) = -(v + w e^(-ik)). */
export const hk = (c: Chain, k: number): C => ({ re: -(c.v + c.w * Math.cos(k)), im: c.w * Math.sin(k) });

/** Lower-band energy and eigenvector (u_A, u_B) at k, in the gauge u_A real and positive. */
export function lowerBand(c: Chain, k: number): { E: number; u: [C, C] } {
  const h = hk(c, k);
  const m = Math.hypot(h.re, h.im);
  const s = Math.SQRT1_2;
  if (m < 1e-14)
    return {
      E: 0,
      u: [
        { re: s, im: 0 },
        { re: -s, im: 0 },
      ],
    };
  return {
    E: -m,
    u: [
      { re: s, im: 0 },
      { re: (-h.re / m) * s, im: (h.im / m) * s },
    ],
  };
}

export const gap = (c: Chain): number => 2 * Math.abs(c.v - c.w);

/** Phases theta_k of the parallel-transport gauge (relative to the u_A-real gauge), and the Berry phase of the band. */
export function parallelTransport(c: Chain): { theta: number[]; berry: number } {
  const ks = kMesh(c.n);
  const u = ks.map((k) => lowerBand(c, k).u);
  const ov = (p: [C, C], q: [C, C]): C => {
    const a = cmul(conj(p[0]), q[0]);
    const b = cmul(conj(p[1]), q[1]);
    return { re: a.re + b.re, im: a.im + b.im };
  };
  const theta = [0];
  let total = 0;
  for (let j = 0; j < c.n; j++) {
    const m = ov(u[j]!, u[(j + 1) % c.n]!);
    const ph = Math.atan2(m.im, m.re);
    total += ph;
    if (j + 1 < c.n) theta.push(theta[j]! - ph);
  }
  // spread the closure mismatch evenly so every overlap carries the same phase
  const berry = -total;
  return { theta: theta.map((t, j) => t + (j * total) / c.n), berry };
}

export interface Wannier {
  /** Coefficients on sites A and B of cells n = -N/2 .. N/2 - 1. */
  cells: number[];
  cA: C[];
  cB: C[];
  /** Expectation of x over the sites (cells). */
  centre: number;
  /** Spread over the sites, <x^2> - <x>^2 (cells^2). */
  spread: number;
  /** Gauge phases used. */
  theta: number[];
}

/** Fixed pseudo-random phases in [-pi, pi) for the disordered gauge (mulberry32, seed 3). */
export function randomPhases(n: number, seed = 3): number[] {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => Math.PI * (2 * r() - 1));
}

/**
 * The Wannier function of cell 0 for the gauge theta_k = theta_PT(k) + (1 - smooth) * theta_random(k): smooth = 1 is the
 * maximally localized function, smooth = 0 a gauge with random phases.
 */
export function wannier(c: Chain, smooth: number): Wannier {
  const ks = kMesh(c.n);
  const { theta: pt } = parallelTransport(c);
  const rnd = randomPhases(c.n);
  const theta = ks.map((_, j) => pt[j]! + (1 - smooth) * rnd[j]!);
  const half = Math.floor(c.n / 2);
  const cells = Array.from({ length: c.n }, (_, i) => i - half);
  const cA: C[] = [];
  const cB: C[] = [];
  for (const n of cells) {
    let a: C = { re: 0, im: 0 };
    let b: C = { re: 0, im: 0 };
    ks.forEach((k, j) => {
      const { u } = lowerBand(c, k);
      const ph = cexp(k * n + theta[j]!);
      const pa = cmul(ph, u[0]);
      const pb = cmul(ph, u[1]);
      a = { re: a.re + pa.re / c.n, im: a.im + pa.im / c.n };
      b = { re: b.re + pb.re / c.n, im: b.im + pb.im / c.n };
    });
    cA.push(a);
    cB.push(b);
  }
  let x1 = 0;
  let x2 = 0;
  cells.forEach((n, i) => {
    const pa = cA[i]!.re ** 2 + cA[i]!.im ** 2;
    const pb = cB[i]!.re ** 2 + cB[i]!.im ** 2;
    x1 += pa * n + pb * (n + 0.5);
    x2 += pa * n * n + pb * (n + 0.5) ** 2;
  });
  return { cells, cA, cB, centre: x1, spread: x2 - x1 * x1, theta };
}

/** Total weight sum |c|^2 (1 for a normalized Wannier function). */
export const weight = (wf: Wannier): number =>
  wf.cA.reduce((s, z) => s + z.re ** 2 + z.im ** 2, 0) + wf.cB.reduce((s, z) => s + z.re ** 2 + z.im ** 2, 0);

/** A site orbital: a normalized Gaussian of width s (cells) on the line, used only to draw the functions. */
export const siteOrbital = (x: number, s = 0.16): number =>
  Math.exp(-(x * x) / (2 * s * s)) / Math.sqrt(s * Math.sqrt(Math.PI));

/** The Wannier function in space, w(x) = sum_n cA(n) g(x - n) + cB(n) g(x - n - 1/2), complex. */
export function wannierAt(wf: Wannier, x: number): C {
  let re = 0;
  let im = 0;
  wf.cells.forEach((n, i) => {
    const ga = siteOrbital(x - n);
    const gb = siteOrbital(x - n - 0.5);
    re += wf.cA[i]!.re * ga + wf.cB[i]!.re * gb;
    im += wf.cA[i]!.im * ga + wf.cB[i]!.im * gb;
  });
  return { re, im };
}

/** A Bloch state of the lower band at mesh index j, in the gauge theta, at x (periodic chain of N cells centred on 0). */
export function blochAt(c: Chain, j: number, theta: number, x: number): C {
  const k = (2 * Math.PI * j) / c.n;
  const { u } = lowerBand(c, k);
  const half = Math.floor(c.n / 2);
  let re = 0;
  let im = 0;
  for (let n = -half; n < c.n - half; n++) {
    const ph = cexp(k * n + theta);
    const a = cmul(ph, u[0]);
    const b = cmul(ph, u[1]);
    const ga = siteOrbital(x - n);
    const gb = siteOrbital(x - n - 0.5);
    re += (a.re * ga + b.re * gb) / Math.sqrt(c.n);
    im += (a.im * ga + b.im * gb) / Math.sqrt(c.n);
  }
  return { re, im };
}
