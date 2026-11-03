// One-dimensional Schrodinger solver: finite differences, Dirichlet walls, no dependencies.
// -(hbar^2/2m) psi'' + V psi = E psi on N interior points of spacing h.
// The matrix is symmetric tridiagonal. The lowest k eigenvalues come from Sturm-sequence bisection and the
// eigenvectors from inverse iteration with a pivoted tridiagonal solve, so the cost is O(k N), not O(N^3).
// @source S-047 (Schrodinger equation, infinite well and harmonic oscillator energies)
// @source S-031 (hbar^2/2m)

export interface Solution1D {
  /** Lowest eigenvalues in eV, ascending. */
  energies: Float64Array;
  /** Eigenvectors on the interior points, normalised so that sum(psi^2) * h = 1. */
  states: Float64Array[];
}

/** Interior grid points of [xmin, xmax] with Dirichlet walls at the ends: spacing h = (xmax - xmin) / (n + 1). */
export function makeGrid(xmin: number, xmax: number, n: number): { x: Float64Array; h: number } {
  const h = (xmax - xmin) / (n + 1);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = xmin + (i + 1) * h;
  return { x, h };
}

/** Number of eigenvalues of the tridiagonal matrix (diagonal d, off-diagonal e) that are below lambda. */
function sturmCount(d: Float64Array, e: number, lambda: number): number {
  let count = 0;
  let q = d[0]! - lambda;
  if (q < 0) count++;
  for (let i = 1; i < d.length; i++) {
    if (q === 0) q = 1e-300;
    q = d[i]! - lambda - (e * e) / q;
    if (q < 0) count++;
  }
  return count;
}

/** LAPACK dgtsv-style solve of a tridiagonal system with partial pivoting. dl, d, du, b are overwritten. */
function solveTridiagonal(dl: Float64Array, d: Float64Array, du: Float64Array, b: Float64Array): void {
  const n = d.length;
  const du2 = new Float64Array(Math.max(n - 2, 0));
  const tiny = 1e-300;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]!) >= Math.abs(dl[i]!)) {
      if (d[i] === 0) d[i] = tiny;
      const f = dl[i]! / d[i]!;
      d[i + 1] = d[i + 1]! - f * du[i]!;
      b[i + 1] = b[i + 1]! - f * b[i]!;
    } else {
      const f = d[i]! / dl[i]!;
      d[i] = dl[i]!;
      const t = d[i + 1]!;
      d[i + 1] = du[i]! - f * t;
      if (i < n - 2) {
        du2[i] = du[i + 1]!;
        du[i + 1] = -f * du2[i]!;
      }
      du[i] = t;
      const tb = b[i]!;
      b[i] = b[i + 1]!;
      b[i + 1] = tb - f * b[i + 1]!;
    }
  }
  if (d[n - 1] === 0) d[n - 1] = tiny;
  b[n - 1] = b[n - 1]! / d[n - 1]!;
  if (n > 1) b[n - 2] = (b[n - 2]! - du[n - 2]! * b[n - 1]!) / d[n - 2]!;
  for (let i = n - 3; i >= 0; i--) b[i] = (b[i]! - du[i]! * b[i + 1]! - du2[i]! * b[i + 2]!) / d[i]!;
}

/**
 * Lowest k states of -c psi'' + V psi = E psi with c = hbar^2/2m in eV Angstrom^2, V in eV on interior points
 * of spacing h (Angstrom).
 */
export function solveLowest(c: number, h: number, V: ArrayLike<number>, k: number): Solution1D {
  const n = V.length;
  if (k > n) throw new RangeError('cannot ask for more states than grid points');
  const e = -c / (h * h);
  const d = new Float64Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    d[i] = (2 * c) / (h * h) + V[i]!;
    const r = Math.abs(e) * (i > 0 ? 1 : 0) + Math.abs(e) * (i < n - 1 ? 1 : 0);
    lo = Math.min(lo, d[i]! - r);
    hi = Math.max(hi, d[i]! + r);
  }
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
  const energies = new Float64Array(k);
  for (let j = 0; j < k; j++) {
    let a = j === 0 ? lo : energies[j - 1]!;
    let b = hi;
    for (let it = 0; it < 200 && b - a > 4e-16 * scale; it++) {
      const m = 0.5 * (a + b);
      if (sturmCount(d, e, m) > j) b = m;
      else a = m;
    }
    energies[j] = 0.5 * (a + b);
  }
  const states: Float64Array[] = [];
  for (let j = 0; j < k; j++) {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.sin(12.9898 * (i + 1) * (j + 1) + 4.1414) + 1.1;
    const shift = energies[j]! - 1e-12 * scale;
    for (let it = 0; it < 4; it++) {
      const dl = new Float64Array(n - 1).fill(e);
      const du = new Float64Array(n - 1).fill(e);
      const dd = new Float64Array(n);
      for (let i = 0; i < n; i++) dd[i] = d[i]! - shift;
      solveTridiagonal(dl, dd, du, v);
      for (let q = 0; q < j; q++) {
        const s = states[q]!;
        let dot = 0;
        for (let i = 0; i < n; i++) dot += v[i]! * s[i]!;
        for (let i = 0; i < n; i++) v[i] = v[i]! - dot * s[i]!;
      }
      let nrm = 0;
      for (let i = 0; i < n; i++) nrm += v[i]! * v[i]!;
      nrm = Math.sqrt(nrm);
      for (let i = 0; i < n; i++) v[i] = v[i]! / nrm;
    }
    // sign: first clearly non-zero component positive
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(v[i]!));
    for (let i = 0; i < n; i++) {
      if (Math.abs(v[i]!) > 1e-3 * mx) {
        if (v[i]! < 0) for (let q = 0; q < n; q++) v[q] = -v[q]!;
        break;
      }
    }
    const f = 1 / Math.sqrt(h);
    for (let i = 0; i < n; i++) v[i] = v[i]! * f;
    states.push(v);
  }
  return { energies, states };
}

/** Exact eigenvalues of the finite-difference infinite well of width L with n interior points. */
export function fdInfiniteWellEnergy(c: number, L: number, n: number, k: number): number {
  const h = L / (n + 1);
  const s = Math.sin((k * Math.PI * h) / (2 * L));
  return ((4 * c) / (h * h)) * s * s;
}
