// Densities and the exact one-electron inverse problem in 1D (module 3).
// @source S-011 (Hohenberg and Kohn: for one electron the density fixes the potential up to a constant)
// @source S-047 (Schrodinger equation)
// For one electron in its ground state psi = sqrt(n), so V(x) = E + (hbar^2/2m) psi''/psi. The discrete version
// below uses the same finite-difference second derivative as solver1d, so the forward solve reproduces n exactly
// (up to rounding), with psi = 0 at the two walls.

/** Density n(x) = sum_i f_i |psi_i|^2 from states normalised with sum(psi^2) h = 1 and occupations f_i. */
export function densityFromStates(states: Float64Array[], occupations: ArrayLike<number>): Float64Array {
  const n = states[0]?.length ?? 0;
  const out = new Float64Array(n);
  states.forEach((s, i) => {
    const f = occupations[i] ?? 0;
    if (f === 0) return;
    for (let j = 0; j < n; j++) out[j] = out[j]! + f * s[j]! * s[j]!;
  });
  return out;
}

/** Integral of a density sampled on interior points of spacing h. */
export function integrateDensity(n: ArrayLike<number>, h: number): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) s += n[i]!;
  return s * h;
}

/** Scale a density so that it integrates to `total` electrons. */
export function normalizeDensity(n: ArrayLike<number>, h: number, total = 1): Float64Array {
  const s = integrateDensity(n, h);
  return Float64Array.from(n as ArrayLike<number>, (v) => (v * total) / s);
}

/**
 * Potential (eV) whose one-electron ground state has density n, up to the additive constant E.
 * Density values below `floor` are raised to it so that psi''/psi stays finite in the tails.
 */
export function potentialFromDensity(
  c: number,
  h: number,
  n: ArrayLike<number>,
  E = 0,
  floor = 1e-14,
): Float64Array {
  const N = n.length;
  const psi = new Float64Array(N);
  for (let i = 0; i < N; i++) psi[i] = Math.sqrt(Math.max(n[i]!, floor));
  const V = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const left = i > 0 ? psi[i - 1]! : 0;
    const right = i < N - 1 ? psi[i + 1]! : 0;
    V[i] = E + (c * (right - 2 * psi[i]! + left)) / (h * h * psi[i]!);
  }
  return V;
}
