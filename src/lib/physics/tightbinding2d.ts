// Toy model for the k-mesh lab: a 2D square-lattice tight-binding band, E(k) = -2t (cos kx + cos ky), with an optional
// staggered potential +-Delta (two-sublattice band structure) and optional Gaussian smearing.
// Energy per site and per spin, averaged over an N x N Gamma-centred mesh of the full zone:
//   e = -(1/2) < E(k) erf(E(k) / (sqrt(2) sigma)) >,  E(k) = sqrt(Delta^2 + eps(k)^2),  eps(k) = -2t (cos kx + cos ky)
// which is -(1/2) <E(k)> when sigma = 0 (lower band full, upper band empty). At Delta = 0 and sigma = 0 this is the
// half-filled metal and its exact value is -8 t / pi^2. Heuristic teaching model, not a material. @source S-049, S-053, D-044.

const SQRT_PI = Math.sqrt(Math.PI);

/**
 * Error function by the series erf(x) = (2/sqrt(pi)) exp(-x^2) sum_n 2^n x^(2n+1) / (1 3 5 ... (2n+1)),
 * whose terms are all positive for x > 0, so there is no cancellation. Beyond |x| = 6, erf is 1 to double precision.
 * @source S-053
 */
export function erf(x: number): number {
  if (x === 0) return 0;
  const ax = Math.abs(x);
  if (ax > 6) return x > 0 ? 1 : -1;
  const x2 = ax * ax;
  let term = ax;
  let sum = ax;
  for (let n = 1; n < 400; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < 1e-17 * sum) break;
  }
  const v = (2 / SQRT_PI) * Math.exp(-x2) * sum;
  return x > 0 ? v : -v;
}

export const dispersion = (kx: number, ky: number, t = 1): number => -2 * t * (Math.cos(kx) + Math.cos(ky));

/** Energy per site and per spin on an N x N Gamma-centred mesh of the full square zone. t = 1 sets the unit. */
export function energyPerSite(n: number, delta: number, sigma: number, t = 1): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('N must be a positive integer.');
  if (delta < 0 || sigma < 0) throw new RangeError('Delta and sigma must not be negative.');
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.cos((2 * Math.PI * i) / n);
  const d2 = delta * delta;
  const s = sigma > 0 ? Math.SQRT2 * sigma : 0;
  let sum = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const e = -2 * t * (c[i]! + c[j]!);
      const E = Math.sqrt(d2 + e * e);
      sum += s > 0 ? E * erf(E / s) : E;
    }
  return -0.5 * (sum / (n * n));
}

/** Exact value for the half-filled metal without smearing: -8 t / pi^2. */
export const METAL_EXACT = -8 / (Math.PI * Math.PI);

export const REFERENCE_MESH = 600;

/** Converged value used as the "truth" for the error plot: exact for the unsmeared metal, else a dense mesh. */
export function referenceEnergy(delta: number, sigma: number, n = REFERENCE_MESH): number {
  return delta === 0 && sigma === 0 ? METAL_EXACT : energyPerSite(n, delta, sigma);
}

export interface ErrorPoint {
  n: number;
  energy: number;
  error: number;
}

/** Absolute error of each mesh size against the reference. */
export function errorSeries(
  sizes: readonly number[],
  delta: number,
  sigma: number,
  ref?: number,
): ErrorPoint[] {
  const r = ref ?? referenceEnergy(delta, sigma);
  return sizes.map((n) => {
    const energy = energyPerSite(n, delta, sigma);
    return { n, energy, error: Math.abs(energy - r) };
  });
}

export const MESH_SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
