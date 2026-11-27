// A finite tight-binding chain: N atoms in a row, one orbital each, nearest-neighbour hopping -t, and an optional
// alternating on-site energy -Delta, +Delta (two kinds of atom, A B A B ...). Teaching model for "levels split into
// bands" (Module 2); energies are in units of the hopping t0 at the reference distance, never in eV.
// @source S-050 (Kittel: tight-binding bands), S-036 (Ashcroft and Mermin: tight-binding method, chapter 10)
// @source S-140 (Harrison: interatomic matrix elements scale as 1/d^2)
// Closed forms used as references in the tests: the open chain with Delta = 0 has E_k = -2 t cos(k pi / (N + 1)),
// k = 1..N; two atoms give +-sqrt(Delta^2 + t^2); the infinite alternating chain has bands from -sqrt(Delta^2 + 4 t^2)
// to -Delta and from Delta to sqrt(Delta^2 + 4 t^2), so a gap of 2 Delta.

/** Hopping at distance d with Harrison's 1/d^2 scaling: t = t0 (d0 / d)^2 (S-140). */
export const harrisonHopping = (d: number, d0: number, t0 = 1): number => t0 * (d0 / d) ** 2;

/** Level k (1..N) of the open chain with equal atoms: eps - 2 t cos(k pi / (N + 1)). */
export const openChainEnergy = (n: number, k: number, t: number, eps = 0): number =>
  eps - 2 * t * Math.cos((k * Math.PI) / (n + 1));

/** On-site energy of atom j (0-based): -Delta on even atoms (A), +Delta on odd atoms (B). */
export const onSite = (j: number, delta: number): number => (j % 2 === 0 ? -delta : delta);

/** The N x N Hamiltonian matrix of the chain (open ends). */
export function chainHamiltonian(n: number, t: number, delta: number): number[][] {
  const h = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    h[j]![j] = onSite(j, delta);
    if (j + 1 < n) h[j]![j + 1] = h[j + 1]![j] = -t;
  }
  return h;
}

/**
 * Eigenvalues (ascending) and eigenvectors (columns, as rows of `vectors`) of a real symmetric matrix by cyclic Jacobi
 * rotations. Meant for the small matrices of teaching models (N up to a few tens).
 */
export function symmetricEigen(m: readonly (readonly number[])[]): { values: number[]; vectors: number[][] } {
  const n = m.length;
  const a = m.map((r) => [...r]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(tt * tt + 1);
        const s = tt * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  const order = a.map((r, i) => [r[i]!, i] as const).sort((x, y) => x[0] - y[0]);
  return {
    values: order.map(([e]) => e),
    vectors: order.map(([, i]) => v.map((row) => row[i]!)),
  };
}

/**
 * Eigenvalues (ascending) of a symmetric tridiagonal matrix (diagonal `d`, off-diagonal `e`, e[i] between i and i + 1) by
 * Sturm-sequence bisection: the count of negative pivots of T - x I is the number of eigenvalues below x. Fast enough to
 * redraw a level-versus-distance plot on every slider move; checked against the Jacobi solution in the tests.
 */
export function tridiagonalEigenvalues(d: readonly number[], e: readonly number[]): number[] {
  const n = d.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = Math.abs(e[i - 1] ?? 0) + Math.abs(e[i] ?? 0); // Gershgorin discs
    lo = Math.min(lo, d[i]! - r);
    hi = Math.max(hi, d[i]! + r);
  }
  const below = (x: number): number => {
    let count = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      const off = i > 0 ? e[i - 1]! : 0;
      q = d[i]! - x - (i > 0 ? (off * off) / q : 0);
      if (q === 0) q = -1e-300;
      if (q < 0) count++;
    }
    return count;
  };
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    let a = lo - 1e-9;
    let b = hi + 1e-9;
    while (b - a > 1e-13 * Math.max(1, Math.abs(a) + Math.abs(b))) {
      const m = 0.5 * (a + b);
      if (below(m) > k) b = m;
      else a = m;
    }
    out.push(0.5 * (a + b));
  }
  return out;
}

/** Energies only (ascending) of the open chain, by bisection: the cheap path for plots over many distances. */
export function chainEnergies(n: number, t: number, delta: number): number[] {
  const d = Array.from({ length: n }, (_, j) => onSite(j, delta));
  const e = new Array<number>(Math.max(0, n - 1)).fill(-t);
  return tridiagonalEigenvalues(d, e);
}

export interface ChainLevels {
  /** Energies, ascending, in the unit of t. */
  energies: number[];
  /** states[k][j]: amplitude of level k on atom j (normalised). */
  states: number[][];
}

/** Levels and states of the open chain of n atoms. */
export function chainLevels(n: number, t: number, delta: number): ChainLevels {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError('The chain needs a whole number of atoms, at least 1.');
  const { values, vectors } = symmetricEigen(chainHamiltonian(n, t, delta));
  return { energies: values, states: vectors };
}

/** Band edges of the infinite chain: one band [-2t, 2t] when Delta = 0, else two bands separated by 2 Delta. */
export function infiniteChainBands(t: number, delta: number): [number, number][] {
  if (delta === 0) return [[-2 * t, 2 * t]];
  const w = Math.sqrt(delta * delta + 4 * t * t);
  return [
    [-w, -Math.abs(delta)],
    [Math.abs(delta), w],
  ];
}
