// Two-dimensional Schrodinger solver for the lowest state: -c (d2/dx2 + d2/dy2) psi + V psi = E psi on the interior
// points of a rectangle with Dirichlet walls (psi = 0 just outside), the 5-point Laplacian, the same discretisation as
// solver1d in each direction. The lowest eigenpair comes from LOBPCG with one vector (Knyazev's locally optimal
// conjugate gradient: Rayleigh-Ritz in the span of the iterate, its residual and the previous step), so the cost is a
// few sparse products per step and no matrix is ever stored. Pure, no dependencies.
// The same operator, read as two coordinates of two particles on a line, is the two-electron problem of
// `twoelectron1d.ts`; there the exchange of the two coordinates is a symmetry and the solver can be held in the
// symmetric (singlet) or antisymmetric (triplet) sector.
// @source S-047 (finite-difference Schrodinger equation)
// @source S-144 (LOBPCG, Knyazev 2001)
// @source S-011 (for one electron in its ground state the density fixes the potential up to a constant)

export interface Grid2D {
  nx: number;
  ny: number;
  /** Spacings in x and y. */
  hx: number;
  hy: number;
}

export type ExchangeSymmetry = 'none' | 'symmetric' | 'antisymmetric';

export interface Lowest2DOptions extends Grid2D {
  /** hbar^2 / 2m in the units of V times length squared (0.5 in atomic units, 3.80998 eV Angstrom^2). */
  c: number;
  /** Potential on the interior points, index i + nx * j for the point (x_i, y_j). */
  V: ArrayLike<number>;
  /** Starting vector (any normalisation); a smooth positive bump when absent. */
  start?: ArrayLike<number>;
  /** Hold the state symmetric or antisymmetric under the exchange x <-> y (needs nx = ny and hx = hy). */
  symmetry?: ExchangeSymmetry;
  /** Stop when |H x - E x| for the state as a unit vector (sum x^2 = 1) is below this. Default 1e-8. */
  tol?: number;
  maxIterations?: number;
}

export interface Lowest2D {
  energy: number;
  /** Normalised so that sum(psi^2) hx hy = 1; sign chosen so that the largest component is positive. */
  state: Float64Array;
  iterations: number;
  residual: number;
  converged: boolean;
}

/** y = H x for H = -c Laplacian + V on the grid (Dirichlet walls). */
export function applyHamiltonian2d(
  g: Grid2D,
  c: number,
  V: ArrayLike<number>,
  x: ArrayLike<number>,
  y: Float64Array,
): Float64Array {
  const { nx, ny } = g;
  const ax = c / (g.hx * g.hx);
  const ay = c / (g.hy * g.hy);
  const d = 2 * ax + 2 * ay;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = i + nx * j;
      let s = (d + V[k]!) * x[k]!;
      if (i > 0) s -= ax * x[k - 1]!;
      if (i < nx - 1) s -= ax * x[k + 1]!;
      if (j > 0) s -= ay * x[k - nx]!;
      if (j < ny - 1) s -= ay * x[k + nx]!;
      y[k] = s;
    }
  return y;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

function project(v: Float64Array, nx: number, sym: ExchangeSymmetry): void {
  if (sym === 'none') return;
  const sgn = sym === 'symmetric' ? 1 : -1;
  for (let j = 0; j < nx; j++)
    for (let i = 0; i <= j; i++) {
      const a = i + nx * j;
      const b = j + nx * i;
      const m = 0.5 * (v[a]! + sgn * v[b]!);
      v[a] = m;
      v[b] = sgn * m;
    }
}

/** Lowest eigenvalues and eigenvectors of a small symmetric matrix (row-major, size m <= 3) by Jacobi rotations. */
function smallEigen(A: number[], m: number): { values: number[]; vectors: number[][] } {
  const a = A.slice();
  const v = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += a[p * m + q]! ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < m; p++)
      for (let q = p + 1; q < m; q++) {
        const apq = a[p * m + q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * m + q]! - a[p * m + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cs = 1 / Math.sqrt(t * t + 1);
        const sn = t * cs;
        for (let k = 0; k < m; k++) {
          const akp = a[k * m + p]!;
          const akq = a[k * m + q]!;
          a[k * m + p] = cs * akp - sn * akq;
          a[k * m + q] = sn * akp + cs * akq;
        }
        for (let k = 0; k < m; k++) {
          const apk = a[p * m + k]!;
          const aqk = a[q * m + k]!;
          a[p * m + k] = cs * apk - sn * aqk;
          a[q * m + k] = sn * apk + cs * aqk;
        }
        for (let k = 0; k < m; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = cs * vkp - sn * vkq;
          v[k]![q] = sn * vkp + cs * vkq;
        }
      }
  }
  const order = Array.from({ length: m }, (_, i) => i).sort((i, j) => a[i * m + i]! - a[j * m + j]!);
  return {
    values: order.map((i) => a[i * m + i]!),
    vectors: order.map((i) => v.map((row) => row[i]!)),
  };
}

/** Lowest eigenpair of -c Laplacian + V on a 2D grid (see the file header). */
export function lowestState2d(o: Lowest2DOptions): Lowest2D {
  const { nx, ny, c, V } = o;
  const N = nx * ny;
  const sym = o.symmetry ?? 'none';
  if (sym !== 'none' && (nx !== ny || Math.abs(o.hx - o.hy) > 1e-14 * o.hx))
    throw new RangeError('exchange symmetry needs a square grid');
  if (V.length !== N) throw new RangeError('V must have nx * ny values');
  const tol = o.tol ?? 1e-8;
  const maxit = o.maxIterations ?? 5000;
  const dA = o.hx * o.hy;
  const H = (x: Float64Array, y = new Float64Array(N)) => applyHamiltonian2d(o, c, V, x, y);

  const x = new Float64Array(N);
  if (o.start) for (let k = 0; k < N; k++) x[k] = o.start[k]!;
  else {
    // the lowest modes of the empty box: sin sin, or its antisymmetric partner for the antisymmetric sector
    const m = (k: number, i: number, n: number) => Math.sin((k * Math.PI * (i + 1)) / (n + 1));
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        x[i + nx * j] =
          sym === 'antisymmetric'
            ? m(1, i, nx) * m(2, j, ny) - m(2, i, nx) * m(1, j, ny)
            : m(1, i, nx) * m(1, j, ny);
  }
  project(x, nx, sym);
  let nrm = Math.sqrt(dot(x, x));
  if (!(nrm > 0)) throw new RangeError('the starting vector has no component in the requested symmetry');
  for (let k = 0; k < N; k++) x[k] = x[k]! / nrm;
  let Ax = H(x);
  let lambda = dot(x, Ax);
  let p: Float64Array | null = null;
  let Ap: Float64Array | null = null;
  const r = new Float64Array(N);
  let it = 0;
  for (; it < maxit; it++) {
    for (let k = 0; k < N; k++) r[k] = Ax[k]! - lambda * x[k]!;
    // |H x - lambda x| for the unit vector x: the same ratio as |H psi - E psi| / |psi| for the grid-normalised psi
    const res = Math.sqrt(dot(r, r));
    if (res < tol) break;
    // basis [x, w, p], orthonormalised together with its images under H (one product per step)
    const w = Float64Array.from(r);
    project(w, nx, sym);
    const basis: Float64Array[] = [x];
    const images: Float64Array[] = [Ax];
    const cands: [Float64Array, Float64Array | null][] = [[w, null]];
    if (p && Ap) cands.push([p, Ap]);
    for (const [v0, Av0] of cands) {
      const v = Float64Array.from(v0);
      const Av = Av0 ? Float64Array.from(Av0) : null;
      for (let pass = 0; pass < 2; pass++)
        for (let q = 0; q < basis.length; q++) {
          const cq = dot(basis[q]!, v);
          const b = basis[q]!;
          const Ab = images[q]!;
          for (let k = 0; k < N; k++) v[k] = v[k]! - cq * b[k]!;
          if (Av) for (let k = 0; k < N; k++) Av[k] = Av[k]! - cq * Ab[k]!;
        }
      const vn = Math.sqrt(dot(v, v));
      if (vn < 1e-12) continue;
      for (let k = 0; k < N; k++) v[k] = v[k]! / vn;
      let img: Float64Array;
      if (Av) {
        for (let k = 0; k < N; k++) Av[k] = Av[k]! / vn;
        img = Av;
      } else img = H(v);
      basis.push(v);
      images.push(img);
    }
    const m = basis.length;
    const G: number[] = [];
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) G.push(a <= b ? dot(basis[a]!, images[b]!) : 0);
    for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) G[a * m + b] = G[b * m + a]!;
    const { values, vectors } = smallEigen(G, m);
    const cvec = vectors[0]!;
    lambda = values[0]!;
    const nx2 = new Float64Array(N);
    const nAx = new Float64Array(N);
    const np = new Float64Array(N);
    const nAp = new Float64Array(N);
    for (let a = 0; a < m; a++) {
      const ca = cvec[a]!;
      const b = basis[a]!;
      const Ab = images[a]!;
      for (let k = 0; k < N; k++) {
        nx2[k] = nx2[k]! + ca * b[k]!;
        nAx[k] = nAx[k]! + ca * Ab[k]!;
        if (a > 0) {
          np[k] = np[k]! + ca * b[k]!;
          nAp[k] = nAp[k]! + ca * Ab[k]!;
        }
      }
    }
    nrm = Math.sqrt(dot(nx2, nx2));
    for (let k = 0; k < N; k++) {
      x[k] = nx2[k]! / nrm;
      nAx[k] = nAx[k]! / nrm;
    }
    project(x, nx, sym);
    // refresh the image now and then so that rounding in the updates does not build up
    Ax = (it + 1) % 40 === 0 ? H(x) : nAx;
    if ((it + 1) % 40 === 0) lambda = dot(x, Ax);
    p = np;
    Ap = nAp;
  }
  Ax = H(x);
  lambda = dot(x, Ax);
  for (let k = 0; k < N; k++) r[k] = Ax[k]! - lambda * x[k]!;
  const res = Math.sqrt(dot(r, r));
  let big = 0;
  for (let k = 1; k < N; k++) if (Math.abs(x[k]!) > Math.abs(x[big]!)) big = k;
  const sgn = x[big]! < 0 ? -1 : 1;
  const f = sgn / Math.sqrt(dA);
  const state = Float64Array.from(x, (v) => v * f);
  return { energy: lambda, state, iterations: it, residual: res, converged: res < tol };
}

/**
 * Potential whose one-particle ground state has density n (on the same grid), up to the additive constant E:
 * V = E + c Laplacian(sqrt n) / sqrt n with the same 5-point Laplacian and walls, so the forward solve gives n back.
 * Density values below `floor` are raised to it so that the ratio stays finite in the tails.
 */
export function potentialFromDensity2d(
  g: Grid2D,
  c: number,
  n: ArrayLike<number>,
  E = 0,
  floor = 1e-14,
): Float64Array {
  const { nx, ny } = g;
  const s = Float64Array.from(n as ArrayLike<number>, (v) => Math.sqrt(Math.max(v, floor)));
  const lap = applyHamiltonian2d(g, c, new Float64Array(nx * ny), s, new Float64Array(nx * ny));
  // applyHamiltonian2d with V = 0 gives -c Laplacian(s); so V = E - (-c Lap s) / s
  return Float64Array.from(lap, (t, k) => E - t / s[k]!);
}
