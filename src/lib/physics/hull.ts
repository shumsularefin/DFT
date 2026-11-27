// The lower convex hull of formation energies over a ternary composition triangle (M16.14): facets, the hull energy
// at any composition, the energy above the hull and the decomposition into the phases at the corners of the facet
// below. This is the construction behind phase stability in the Materials Project and pymatgen's PhaseDiagram (S-044,
// S-034, S-120). Compositions are atom fractions (xA, xB, xC) summing to 1; energies are eV per atom.
// The facet search is exhaustive (every triangle of phases whose plane lies on or below every phase), which is exact
// and fast for the few dozen phases a teaching stage shows.
// @source S-044 S-034 S-120
export interface HullPhase {
  name: string;
  /** Atom counts of A, B and C in the formula. */
  counts: [number, number, number];
  /** Formation energy, eV per atom. */
  energy: number;
}

export interface Decomposition {
  /** Hull energy at the phase's composition, eV per atom. */
  hullEnergy: number;
  /** Energy above the hull, eV per atom (0 on the hull, never negative). */
  aboveHull: number;
  /** Phases (indices) of the facet below, with their atom fractions in the mixture (summing to 1). */
  products: { phase: number; fraction: number }[];
}

/** Atom fractions of a phase. */
export function fractions(c: readonly [number, number, number]): [number, number, number] {
  const n = c[0] + c[1] + c[2];
  if (!(n > 0)) throw new RangeError('A phase needs at least one atom.');
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** Barycentric weights of composition x in the triangle (p, q, r), or null when the triangle is degenerate. */
function barycentric(
  x: readonly number[],
  p: readonly number[],
  q: readonly number[],
  r: readonly number[],
): [number, number, number] | null {
  // work in the (xB, xC) plane
  const d = (q[1]! - p[1]!) * (r[2]! - p[2]!) - (r[1]! - p[1]!) * (q[2]! - p[2]!);
  if (Math.abs(d) < 1e-12) return null;
  const wq = ((x[1]! - p[1]!) * (r[2]! - p[2]!) - (r[1]! - p[1]!) * (x[2]! - p[2]!)) / d;
  const wr = ((q[1]! - p[1]!) * (x[2]! - p[2]!) - (x[1]! - p[1]!) * (q[2]! - p[2]!)) / d;
  return [1 - wq - wr, wq, wr];
}

/**
 * Lower-hull facets as index triples: triangles of phases that are not degenerate, whose plane no phase lies below
 * (tolerance `tol` eV/atom) and that hold no other hull vertex inside or on an edge. Coplanar regions are triangulated
 * without overlaps. The three elements must be present (with energy 0 or any value) so the triangle is covered.
 */
export function hullFacets(phases: readonly HullPhase[], tol = 1e-9): [number, number, number][] {
  const X = phases.map((p) => fractions(p.counts));
  const E = phases.map((p) => p.energy);
  const n = phases.length;
  const below = (i: number, j: number, k: number): boolean => {
    for (let m = 0; m < n; m++) {
      const w = barycentric(X[m]!, X[i]!, X[j]!, X[k]!);
      if (!w) return true;
      // plane value at X[m] (the plane extends beyond the triangle)
      const plane = w[0] * E[i]! + w[1] * E[j]! + w[2] * E[k]!;
      if (E[m]! < plane - tol) return true;
    }
    return false;
  };
  const inside = (m: number, i: number, j: number, k: number): boolean => {
    const w = barycentric(X[m]!, X[i]!, X[j]!, X[k]!);
    return !!w && w.every((v) => v > -1e-9);
  };
  const candidates: { t: [number, number, number]; area: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        if (!barycentric(X[i]!, X[i]!, X[j]!, X[k]!)) continue;
        if (below(i, j, k)) continue;
        candidates.push({ t: [i, j, k], area: triArea(X[i]!, X[j]!, X[k]!) });
      }
  // vertices of the hull: phases that lie on some candidate plane at their own composition
  const onHull = new Set<number>();
  for (const { t } of candidates) t.forEach((v) => onHull.add(v));
  const empty = candidates.filter(
    ({ t }) => ![...onHull].some((m) => !t.includes(m) && inside(m, t[0], t[1], t[2])),
  );
  // greedy non-overlapping cover, small triangles first
  empty.sort((p, q) => p.area - q.area);
  const chosen: [number, number, number][] = [];
  for (const { t } of empty) {
    if (chosen.some((u) => overlap(t, u, X))) continue;
    chosen.push(t);
  }
  return chosen;
}

const triArea = (p: readonly number[], q: readonly number[], r: readonly number[]): number =>
  Math.abs((q[1]! - p[1]!) * (r[2]! - p[2]!) - (r[1]! - p[1]!) * (q[2]! - p[2]!)) / 2;

/** Do two triangles (in the composition plane) share interior points? */
function overlap(t: readonly number[], u: readonly number[], X: readonly number[][]): boolean {
  const P = (i: number): [number, number] => [X[i]![1]!, X[i]![2]!];
  const tri = (s: readonly number[]) => s.map(P);
  const A = tri(t);
  const B = tri(u);
  // separating axis test on the edge normals of both triangles (strict, so shared edges do not count)
  for (const poly of [A, B]) {
    for (let e = 0; e < 3; e++) {
      const p = poly[e]!;
      const q = poly[(e + 1) % 3]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const proj = (s: [number, number][]) => s.map((v) => v[0] * nx + v[1] * ny);
      const pa = proj(A);
      const pb = proj(B);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-12 || Math.max(...pb) <= Math.min(...pa) + 1e-12)
        return false;
    }
  }
  return true;
}

/** Hull energy and decomposition at the composition of `counts`, from facets of `hullFacets`. */
export function decompose(
  phases: readonly HullPhase[],
  facets: readonly [number, number, number][],
  counts: readonly [number, number, number],
  energy?: number,
): Decomposition {
  const x = fractions(counts);
  const X = phases.map((p) => fractions(p.counts));
  let best: Decomposition | null = null;
  for (const f of facets) {
    const w = barycentric(x, X[f[0]]!, X[f[1]]!, X[f[2]]!);
    if (!w || w.some((v) => v < -1e-9)) continue;
    const h = w[0] * phases[f[0]]!.energy + w[1] * phases[f[1]]!.energy + w[2] * phases[f[2]]!.energy;
    if (!best || h < best.hullEnergy) {
      const products = f
        .map((phase, k) => ({ phase, fraction: Math.max(0, w[k]!) }))
        .filter((p) => p.fraction > 1e-9);
      best = { hullEnergy: h, aboveHull: 0, products };
    }
  }
  if (!best) throw new RangeError('The composition lies outside the hull; include the three elements.');
  if (energy !== undefined) best.aboveHull = Math.max(0, energy - best.hullEnergy);
  return best;
}

/** Energy above the hull (eV/atom) of every phase, with its decomposition products. */
export function stability(phases: readonly HullPhase[]): {
  facets: [number, number, number][];
  phases: Decomposition[];
} {
  const facets = hullFacets(phases);
  return { facets, phases: phases.map((p) => decompose(phases, facets, p.counts, p.energy)) };
}
