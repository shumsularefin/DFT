// Schematic radial functions for the PAW picture lab (M7.2). These are INVENTED shapes that show the idea, not data for any atom.
// The "smooth" function is r exp(-r/1.2). The "all-electron-like" function adds an oscillation inside the cutoff radius rc,
// windowed to vanish at rc, so the two agree for r >= rc and the all-electron-like one has nodes near the nucleus.
// @source S-008, S-009 (the idea of a smooth function plus a core correction inside a sphere); the formulas here are illustrative only.

/** The smooth pseudo function (no nodes). */
export function pseudo(r: number): number {
  return r * Math.exp(-r / 1.2);
}

/** Window that is 1 at the nucleus and falls smoothly to 0 at rc (and stays 0 outside). */
export function window(r: number, rc: number): number {
  if (r >= rc) return 0;
  const t = r / rc;
  return (1 - t * t) * (1 - t * t);
}

/** Oscillation strength and wavelength scale of the core-like part. */
const AMP = 2.4;
const WAVES = 2.5; // oscillations from the nucleus to rc

/** The all-electron-like function: equal to the smooth one outside rc, oscillating with nodes inside. */
export function allElectronLike(r: number, rc: number): number {
  return pseudo(r) * (1 + AMP * window(r, rc) * Math.cos((2 * Math.PI * WAVES * r) / rc));
}

/** What the augmentation adds back inside the sphere. */
export function augmentation(r: number, rc: number): number {
  return allElectronLike(r, rc) - pseudo(r);
}

/** Number of sign changes of f on (0, rmax], sampled finely. */
export function nodeCount(f: (r: number) => number, rmax: number, n = 4000): number {
  let count = 0;
  let prev = f(rmax / n);
  for (let i = 2; i <= n; i++) {
    const v = f((rmax * i) / n);
    if (prev !== 0 && v !== 0 && Math.sign(prev) !== Math.sign(v)) count++;
    if (v !== 0) prev = v;
  }
  return count;
}
