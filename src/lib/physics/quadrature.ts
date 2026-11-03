// Numerical integration helpers for tests and orbital normalisation.

/** Composite Simpson rule on [a, b] with n intervals (n is rounded up to an even number). */
export function simpson(f: (x: number) => number, a: number, b: number, n: number): number {
  const m = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 === 0 ? 2 : 4);
  return (s * h) / 3;
}

/**
 * Integral of g(r) over [0, rmax] on a non-uniform grid r = rmax u^2, u in [0, 1] (Simpson in u).
 * The grid is dense near the nucleus where radial functions change fastest.
 */
export function integrateRadial(g: (r: number) => number, rmax: number, n = 4000): number {
  return simpson((u) => g(rmax * u * u) * 2 * rmax * u, 0, 1, n);
}
