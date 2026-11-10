/**
 * Seeded random numbers and the Gamma and Beta samplers used by the policy.
 * @source S-039 (Thompson sampling needs Beta draws). The Gamma method is Marsaglia and
 * Tsang (ACM TOMS 26, 363, 2000), checked here by moments, not by a golden file (D-053).
 */

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

export type Rng = () => number;

/** Standard normal by the Box-Muller transform. */
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1) by Marsaglia and Tsang; shape < 1 uses the boost G(a) = G(a+1) U^(1/a). */
export function gamma(rng: Rng, shape: number): number {
  if (!(shape > 0) || !Number.isFinite(shape))
    throw new RangeError(`Gamma shape must be positive, got ${shape}`);
  if (shape < 1) {
    let u = 0;
    while (u === 0) u = rng();
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (u > 0 && Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(alpha, beta) as X / (X + Y) with X ~ Gamma(alpha), Y ~ Gamma(beta). */
export function beta(rng: Rng, alpha: number, b: number): number {
  const x = gamma(rng, alpha);
  const y = gamma(rng, b);
  return x / (x + y);
}
