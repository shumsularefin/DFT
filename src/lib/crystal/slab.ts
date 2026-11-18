// Surface slabs from a bulk crystal (M13.5). The construction follows the method of pymatgen's SlabGenerator
// (W. Sun, G. Ceder, Surf. Sci. 617, 53 (2013), S-064), reimplemented here:
//   1. Miller indices refer to the input cell. The in-plane lattice is every translation of the crystal
//      (centring vectors included, found as symmetry operations with an identity rotation) lying in the plane,
//      reduced to its shortest pair; the stacking vector completes a primitive cell with the smallest in-plane offset.
//   2. Atoms are grouped into layers by height along the normal (layers closer than 0.1 angstrom merge, as
//      pymatgen's ftol); every gap between neighbouring layers is a possible cut, and cuts related by a bulk
//      symmetry operation that keeps the plane give the same slab, so the distinct terminations are their orbits.
//   3. A minimum thickness is rounded up to whole repeats of the input cell's (hkl) spacing, as pymatgen does.
// Polarity is a heuristic (P. W. Tasker, J. Phys. C 12, 4977 (1979), S-063): nominal charges from the bond-valence
// search of the validity engine, a dipole per area above 1e-3 e/angstrom (pymatgen's tolerance) means polar.
// @source S-064 S-063 S-066 S-065
import { searchCharges } from '../chem/charge';
import { cartToFrac, reciprocalLattice, wrapFrac } from './lattice';
import { add, cross, dot, inv3, norm, scale, sub, vecMat } from './linalg';
import { speciesCounts } from './structure';
import { analyzeWith, type MoyoApi, type SymmetryOperation } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

/** Layers closer than this along the normal are one layer (pymatgen's ftol), angstrom. */
export const LAYER_TOLERANCE = 0.1;
/** Dipole per surface area above which a slab counts as polar (pymatgen's is_polar tolerance), e per angstrom. */
export const POLAR_TOLERANCE = 1e-3;
/** Defaults (conventions, D-069). */
export const DEFAULT_VACUUM = 15;
export const DEFAULT_MIN_THICKNESS = 10;

export type Hkl = readonly [number, number, number];

export interface Termination {
  index: number;
  /** Height of the bottom cut along the normal, angstrom, within one bulk period. */
  cut: number;
  /** Indices (into `SlabPlan.cuts`) of every cut that gives this same slab. */
  equivalentCuts: number[];
  /** Species of the bottom and the top atomic layer of the slab. */
  bottom: string[];
  top: string[];
}

export interface SlabPlan {
  /** Miller indices divided by their greatest common divisor. */
  hkl: [number, number, number];
  /** In-plane lattice vectors (Cartesian, input frame), shortest reduced pair, right-handed with the normal. */
  inPlane: [Vec3, Vec3];
  /** Bulk lattice vector completing the in-plane pair to a primitive cell (Cartesian, input frame). */
  stacking: Vec3;
  /** Unit normal (Cartesian, input frame), pointing towards increasing h.x. */
  normal: Vec3;
  /** Bulk repeat distance along the normal, angstrom. */
  period: number;
  /** Spacing of the input cell's (hkl) planes, angstrom (a whole multiple of `period`). */
  inputSpacing: number;
  /** Surface area of the in-plane cell, square angstrom. */
  area: number;
  /** Atoms in one bulk period (one primitive cell). */
  atomsPerPeriod: number;
  /** Heights of the atomic layers within one period, angstrom. */
  layers: number[];
  /** Possible cut heights (midpoints between neighbouring layers), angstrom. */
  cuts: number[];
  terminations: Termination[];
}

export interface SlabOptions {
  /** Number of bulk periods along the normal. Takes precedence over `minThicknessA`. */
  layers?: number;
  /** Minimum thickness, rounded up to whole repeats of the input cell's (hkl) spacing. Default 10 angstrom. */
  minThicknessA?: number;
  /** Vacuum gap between the top atom and the bottom atom of the next image, angstrom. Default 15. */
  vacuumA?: number;
  /** Put the middle of the slab at the middle of the cell (default true); otherwise the bottom atom is at 0. */
  center?: boolean;
  /** Which termination (index into `SlabPlan.terminations`). Default 0. */
  termination?: number;
  /** Fix the bottom n atomic layers with selective dynamics (F F F); the rest are free (T T T). */
  fixBottomLayers?: number;
  symprec?: number;
}

export interface Polarity {
  /** null when no nominal charges could be assigned. */
  polar: boolean | null;
  /** Tasker type from the nominal layer charges: 1 neutral layers, 2 charged layers but no dipole, 3 dipole. */
  tasker: 1 | 2 | 3 | null;
  /** Dipole along the normal per surface area, e per angstrom. */
  dipolePerArea: number | null;
  charges: Record<string, number> | null;
  heuristic: true;
  message: string;
  sources: string[];
}

export interface SlabResult {
  structure: Structure;
  plan: SlabPlan;
  termination: Termination;
  /** Bulk periods in the slab. */
  periods: number;
  /** Height from the bottom to the top atom, angstrom. */
  thickness: number;
  vacuum: number;
  symmetric: boolean;
  polarity: Polarity;
  notes: string[];
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** Smallest D (up to 24) with D x integral for every component, so centring vectors become integer generators. */
function commonDenominator(vs: readonly Vec3[]): number {
  for (let D = 1; D <= 24; D++) {
    if (vs.every((v) => v.every((x) => Math.abs(D * x - Math.round(D * x)) < 1e-4))) return D;
  }
  throw new RangeError('A centring translation is not a simple fraction; check the symmetry tolerance.');
}

/** Row basis (3 rows) of the integer lattice generated by the given integer row vectors (Euclid on columns). */
function integerBasis(gens: number[][]): number[][] {
  const rows = gens.map((r) => [...r]);
  const basis: number[][] = [];
  for (let col = 0; col < 3; col++) {
    for (;;) {
      const nz = rows.filter((r) => r[col] !== 0);
      if (nz.length <= 1) break;
      nz.sort((a, b) => Math.abs(a[col]!) - Math.abs(b[col]!));
      const p = nz[0]!;
      for (const r of nz.slice(1)) {
        const q = Math.trunc(r[col]! / p[col]!);
        for (let k = 0; k < 3; k++) r[k] = r[k]! - q * p[k]!;
      }
    }
    const pivot = rows.findIndex((r) => r[col] !== 0);
    if (pivot < 0) throw new RangeError('The translations do not span three dimensions.');
    basis.push(rows.splice(pivot, 1)[0]!);
  }
  return basis;
}

/** Unimodular integer matrix (as columns u1, u2, u3) with k.u1 = k.u2 = 0 and k.u3 = 1, for primitive k. */
function completeBasis(k: [number, number, number]): [Vec3, Vec3, Vec3] {
  const w = [...k];
  const cols: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (;;) {
    const nz = [0, 1, 2].filter((i) => w[i] !== 0);
    if (nz.length <= 1) break;
    nz.sort((a, b) => Math.abs(w[a]!) - Math.abs(w[b]!));
    const a = nz[0]!;
    for (const b of nz.slice(1)) {
      const q = Math.trunc(w[b]! / w[a]!);
      w[b] = w[b]! - q * w[a]!;
      for (let r = 0; r < 3; r++) cols[b]![r] = cols[b]![r]! - q * cols[a]![r]!;
    }
  }
  const p = [0, 1, 2].find((i) => w[i] !== 0)!;
  const others = [0, 1, 2].filter((i) => i !== p);
  const u3 = cols[p]!.map((x) => x * Math.sign(w[p]!)) as unknown as Vec3;
  return [cols[others[0]!] as unknown as Vec3, cols[others[1]!] as unknown as Vec3, u3];
}

/** Lagrange (Gauss) reduction of a 2D basis, tracking the same combinations of a second representation. */
function reduce2D(a: Vec3, b: Vec3, fa: Vec3, fb: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  for (let it = 0; it < 1000; it++) {
    if (dot(b, b) < dot(a, a) - 1e-12) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
    const mu = Math.round(dot(a, b) / dot(a, a));
    if (mu === 0) break;
    b = sub(b, scale(a, mu));
    fb = sub(fb, scale(fa, mu));
  }
  return [a, b, fa, fb];
}

const mod = (x: number, p: number): number => {
  const r = x - p * Math.floor(x / p);
  return r >= p - 1e-9 ? 0 : r;
};
const sameMod = (x: number, y: number, p: number, tol = 1e-3): boolean => {
  const d = mod(x - y, p);
  return d < tol || p - d < tol;
};

/** Cluster heights (angstrom, periodic with `p`) into layers; returns mean heights, sorted, in [0, p). */
function clusterHeights(
  z: readonly number[],
  p: number | null,
  tol: number,
): { layers: number[]; of: number[] } {
  const wrapZ = (x: number): number => (p === null ? x : mod(x, p));
  const order = z.map((x, i) => ({ x: wrapZ(x), i })).sort((a, b) => a.x - b.x);
  const groups: { x: number; i: number }[][] = [];
  for (const e of order) {
    const last = groups[groups.length - 1];
    if (last && e.x - last[last.length - 1]!.x <= tol) last.push(e);
    else groups.push([e]);
  }
  if (p !== null && groups.length > 1) {
    const first = groups[0]!;
    const last = groups[groups.length - 1]!;
    if (first[0]!.x + p - last[last.length - 1]!.x <= tol) {
      groups.pop();
      groups[0] = [...last.map((e) => ({ x: e.x - p, i: e.i })), ...first];
    }
  }
  const layers = groups.map((g) => wrapZ(g.reduce((acc, e) => acc + e.x, 0) / g.length));
  const of = new Array<number>(z.length);
  groups.forEach((g, k) => g.forEach((e) => (of[e.i] = k)));
  // sort layers, remapping `of`
  const idx = layers.map((_, k) => k).sort((a, b) => layers[a]! - layers[b]!);
  const rank = new Array<number>(idx.length);
  idx.forEach((k, r) => (rank[k] = r));
  return { layers: idx.map((k) => layers[k]!), of: of.map((k) => rank[k]!) };
}

interface Oriented {
  plan: SlabPlan;
  /** Fractional coordinates of the primitive oriented cell (a1, a2, stacking), with the input atom each came from. */
  atoms: { f: Vec3; source: number }[];
  ops: SymmetryOperation[];
}

function reduceHkl(hkl: Hkl): [number, number, number] {
  if (!hkl.every((x) => Number.isInteger(x))) throw new RangeError('Miller indices must be integers.');
  const g = gcd(gcd(hkl[0], hkl[1]), hkl[2]);
  if (g === 0) throw new RangeError('Miller indices (0 0 0) do not define a plane.');
  return [hkl[0] / g, hkl[1] / g, hkl[2] / g];
}

function orient(api: MoyoApi, s: Structure, hklIn: Hkl, symprec: number): Oriented {
  const hkl = reduceHkl(hklIn);
  const sym = analyzeWith(api, s, { symprec });
  const L = s.lattice;
  const isIdentity = (R: SymmetryOperation['rotation']): boolean =>
    R.every((row, i) => row.every((x, j) => x === (i === j ? 1 : 0)));
  const centring = sym.operations
    .filter((o) => isIdentity(o.rotation))
    .map((o) => wrapFrac(o.translation))
    .filter((t) => t.some((x) => Math.abs(x) > 1e-6 && Math.abs(x - 1) > 1e-6));
  const unit: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const D = commonDenominator(centring);
  const gens = [...unit, ...centring].map((v) => v.map((x) => Math.round(D * x)));
  const B = integerBasis(gens).map((r) => r.map((x) => x / D) as unknown as Vec3); // primitive basis, input fractional
  // Normal covector in the primitive basis: k_i = B_i . hkl, made a primitive integer vector.
  const kRaw = B.map((b) => Math.round(D * dot(b, hkl as unknown as Vec3)));
  const gk = gcd(gcd(kRaw[0]!, kRaw[1]!), kRaw[2]!);
  const k: [number, number, number] = [kRaw[0]! / gk, kRaw[1]! / gk, kRaw[2]! / gk];
  const [u1, u2, u3] = completeBasis(k);
  const comb = (u: Vec3): Vec3 => add(add(scale(B[0]!, u[0]), scale(B[1]!, u[1])), scale(B[2]!, u[2]));
  let [fa1, fa2, fa3] = [comb(u1), comb(u2), comb(u3)];
  let a1 = vecMat(fa1, L);
  let a2 = vecMat(fa2, L);
  [a1, a2, fa1, fa2] = reduce2D(a1, a2, fa1, fa2);
  const rec = reciprocalLattice(L).map((b) => scale(b, 1 / (2 * Math.PI))) as unknown as Mat3;
  const N = vecMat(hkl as unknown as Vec3, rec);
  const normal = scale(N, 1 / norm(N));
  if (dot(cross(a1, a2), normal) < 0) {
    a2 = scale(a2, -1);
    fa2 = scale(fa2, -1);
  }
  // Stacking vector: subtract the in-plane lattice vector that leaves the smallest in-plane component.
  let a3 = vecMat(fa3, L);
  const inPlane = sub(a3, scale(normal, dot(a3, normal)));
  const G = [
    [dot(a1, a1), dot(a1, a2)],
    [dot(a1, a2), dot(a2, a2)],
  ];
  const r1 = dot(inPlane, a1);
  const r2 = dot(inPlane, a2);
  const det = G[0]![0]! * G[1]![1]! - G[0]![1]! * G[1]![0]!;
  const al = (r1 * G[1]![1]! - r2 * G[0]![1]!) / det;
  const be = (r2 * G[0]![0]! - r1 * G[1]![0]!) / det;
  let best = { len: Infinity, i: 0, j: 0 };
  for (const i of [Math.floor(al), Math.ceil(al)]) {
    for (const j of [Math.floor(be), Math.ceil(be)]) {
      const len = norm(sub(inPlane, add(scale(a1, i), scale(a2, j))));
      if (len < best.len - 1e-12) best = { len, i, j };
    }
  }
  a3 = sub(a3, add(scale(a1, best.i), scale(a2, best.j)));
  fa3 = sub(fa3, add(scale(fa1, best.i), scale(fa2, best.j)));
  const period = dot(a3, normal);
  const inputSpacing = 1 / norm(N);
  const area = norm(cross(a1, a2));

  // Atoms of the oriented primitive cell: input atoms modulo the full translation lattice.
  const Minv = inv3([fa1, fa2, fa3]);
  const atoms: { f: Vec3; source: number }[] = [];
  s.frac.forEach((x, i) => {
    const f = wrapFrac(vecMat(x, Minv));
    const dup = atoms.some(
      (a) =>
        s.species[a.source] === s.species[i] &&
        norm(
          vecMat(
            sub(a.f, f).map((d) => d - Math.round(d)) as unknown as Vec3,
            [a1, a2, a3] as unknown as Mat3,
          ),
        ) < 1e-3,
    );
    if (!dup) atoms.push({ f, source: i });
  });

  const heights = atoms.map((a) => a.f[2] * period);
  const { layers, of } = clusterHeights(heights, period, LAYER_TOLERANCE);
  const cuts =
    layers.length === 1
      ? [mod(layers[0]! + period / 2, period)]
      : layers.map((z, i) =>
          i + 1 < layers.length ? (z + layers[i + 1]!) / 2 : mod((z + layers[0]! + period) / 2, period),
        );
  cuts.sort((x, y) => x - y);

  // Orbits of the cuts under bulk operations that keep the plane (h W = +-h).
  const parent = cuts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const op of sym.operations) {
    const hW = [0, 1, 2].map(
      (j) => hkl[0] * op.rotation[0][j]! + hkl[1] * op.rotation[1][j]! + hkl[2] * op.rotation[2][j]!,
    );
    const sgn = hW.every((x, j) => x === hkl[j]) ? 1 : hW.every((x, j) => x === -hkl[j]!) ? -1 : 0;
    if (sgn === 0) continue;
    const c0 = dot(hkl as unknown as Vec3, op.translation) * inputSpacing;
    cuts.forEach((c, i) => {
      const img = sgn * c + c0;
      const j = cuts.findIndex((x) => sameMod(x, img, period));
      if (j >= 0) parent[find(i)] = find(j);
    });
  }
  const roots = [...new Set(cuts.map((_, i) => find(i)))].sort((a, b) => a - b);
  const layerSpecies = (k: number): string[] =>
    [...new Set(atoms.filter((_, i) => of[i] === k).map((a) => s.species[a.source]!))].sort();
  const terminations: Termination[] = roots.map((r, index) => {
    const cut = cuts[r]!;
    // first layer above the cut, last layer below it (periodic)
    const above = layers.findIndex((z) => z > cut);
    const bottomLayer = above < 0 ? 0 : above;
    const topLayer = (bottomLayer - 1 + layers.length) % layers.length;
    return {
      index,
      cut,
      equivalentCuts: cuts.map((_, i) => i).filter((i) => find(i) === r),
      bottom: layerSpecies(bottomLayer),
      top: layerSpecies(topLayer),
    };
  });

  return {
    plan: {
      hkl,
      inPlane: [a1, a2],
      stacking: a3,
      normal,
      period,
      inputSpacing,
      area,
      atomsPerPeriod: atoms.length,
      layers,
      cuts,
      terminations,
    },
    atoms,
    ops: sym.operations,
  };
}

/** The in-plane cell, period, layers and distinct terminations of (hkl), without building a slab. */
export const slabPlan = (api: MoyoApi, s: Structure, hkl: Hkl, symprec = 1e-4): SlabPlan =>
  orient(api, s, hkl, symprec).plan;

/** Average nominal charge per element (mixed valence averaged), or null when none can be assigned. */
function nominalCharges(s: Structure): Record<string, number> | null {
  const counts = speciesCounts(s);
  const g = counts.reduce((acc, c) => gcd(acc, c.count), 0);
  const res = searchCharges(counts.map((c) => ({ el: c.symbol, count: c.count / g })));
  if (counts.length === 1) return { [counts[0]!.symbol]: 0 };
  if (res.kind !== 'assigned') return null;
  const out: Record<string, number> = {};
  for (const e of res.best.elements) {
    const n = e.parts.reduce((a, p) => a + p.count, 0);
    out[e.el] = e.parts.reduce((a, p) => a + p.ox * p.count, 0) / n;
  }
  return out;
}

/** Build a slab of (hkl). The input structure is not modified. */
export function buildSlab(api: MoyoApi, s: Structure, hkl: Hkl, opts: SlabOptions = {}): SlabResult {
  const { plan, atoms, ops } = orient(api, s, hkl, opts.symprec ?? 1e-4);
  const notes: string[] = [];
  const t = opts.termination ?? 0;
  const term = plan.terminations[t];
  if (!term) throw new RangeError(`Termination ${t} does not exist; there are ${plan.terminations.length}.`);
  const perSpacing = Math.round(plan.inputSpacing / plan.period);
  let periods: number;
  if (opts.layers !== undefined) {
    if (!Number.isInteger(opts.layers) || opts.layers < 1)
      throw new RangeError('layers must be a positive integer.');
    periods = opts.layers;
  } else {
    const tmin = opts.minThicknessA ?? DEFAULT_MIN_THICKNESS;
    if (!(tmin > 0)) throw new RangeError('The minimum thickness must be positive.');
    const repeats = Math.ceil(tmin / plan.inputSpacing - 1e-9);
    periods = repeats * perSpacing;
    notes.push(
      `Thickness ${tmin} angstrom rounded up to ${repeats} repeats of the input cell's (${plan.hkl.join(' ')}) spacing ` +
        `(${plan.inputSpacing.toFixed(4)} angstrom), as in pymatgen's SlabGenerator (S-064).`,
    );
  }
  const vacuum = opts.vacuumA ?? DEFAULT_VACUUM;
  if (!(vacuum >= 0)) throw new RangeError('The vacuum must be zero or positive.');
  const [a1, a2] = plan.inPlane;
  const a3 = plan.stacking;
  const n = plan.normal;
  const cut = term.cut;

  const sites: { r: Vec3; z: number; source: number }[] = [];
  for (const a of atoms) {
    const z0 = a.f[2] * plan.period;
    const base = cut + mod(z0 - cut, plan.period);
    for (let j = 0; j < periods; j++) {
      const f3 = (base + j * plan.period) / plan.period;
      const r = add(add(scale(a1, a.f[0]), scale(a2, a.f[1])), scale(a3, f3));
      sites.push({ r, z: dot(r, n), source: a.source });
    }
  }
  sites.sort((p, q) => p.z - q.z || p.source - q.source);
  const zmin = sites[0]!.z;
  const zmax = sites[sites.length - 1]!.z;
  const thickness = zmax - zmin;
  const c = thickness + vacuum;
  if (!(c > 0)) throw new RangeError('A slab of one atomic layer needs a positive vacuum.');
  const center = opts.center ?? true;
  const cartLattice: Mat3 = [a1, a2, scale(n, c)];
  const frac = sites.map((p) => {
    const g = cartToFrac(p.r, cartLattice);
    const f3 = center ? (p.z - (zmin + zmax) / 2) / c + 0.5 : (p.z - zmin) / c;
    return [g[0] - Math.floor(g[0] + 1e-9), g[1] - Math.floor(g[1] + 1e-9), f3] as Vec3;
  });
  // Standard frame: a1 along x, a2 in the xy plane, c along z (fractional coordinates are unchanged).
  const la = norm(a1);
  const e1 = scale(a1, 1 / la);
  const e2 = cross(n, e1);
  const lattice: Mat3 = [
    [la, 0, 0],
    [dot(a2, e1), dot(a2, e2), 0],
    [0, 0, c],
  ];
  let structure: Structure = {
    lattice,
    species: sites.map((p) => s.species[p.source]!),
    ...(s.labels ? { labels: sites.map((p) => s.labels![p.source]!) } : {}),
    frac,
    comment: `${s.comment ?? 'slab'} (${plan.hkl.join(' ')}) slab, termination ${t}`,
  };

  const fix = opts.fixBottomLayers ?? 0;
  if (fix > 0) {
    const { of } = clusterHeights(
      sites.map((p) => p.z - zmin),
      null,
      LAYER_TOLERANCE,
    );
    structure = {
      ...structure,
      selective: of.map(
        (k) => (k < fix ? [false, false, false] : [true, true, true]) as [boolean, boolean, boolean],
      ),
    };
    notes.push(`Bottom ${fix} atomic layer(s) fixed with selective dynamics; the rest relax.`);
  }

  // Symmetric: a bulk operation flipping the normal maps the slab window onto itself (modulo a lattice translation).
  const symmetric = ops.some((op) => {
    const h = plan.hkl;
    const hW = [0, 1, 2].map(
      (j) => h[0] * op.rotation[0][j]! + h[1] * op.rotation[1][j]! + h[2] * op.rotation[2][j]!,
    );
    if (!hW.every((x, j) => x === -h[j]!)) return false;
    const c0 = dot(h as unknown as Vec3, op.translation) * plan.inputSpacing;
    return sameMod(c0, 2 * cut, plan.period);
  });

  const polarity = slabPolarity(
    structure,
    s,
    sites.map((p) => p.z - zmin),
    plan.area,
  );
  if (polarity.polar) notes.push(polarity.message);
  return { structure, plan, termination: term, periods, thickness, vacuum, symmetric, polarity, notes };
}

/** Heuristic polarity of a slab from nominal charges (Tasker, S-063). `heights` are per site, angstrom. */
function slabPolarity(slab: Structure, bulk: Structure, heights: number[], area: number): Polarity {
  const sources = ['S-063', 'S-066', 'S-065'];
  const charges = nominalCharges(bulk);
  if (!charges) {
    return {
      polar: null,
      tasker: null,
      dipolePerArea: null,
      charges: null,
      heuristic: true,
      message:
        'Heuristic: no charge-neutral set of nominal oxidation states was found, so polarity was not assessed.',
      sources,
    };
  }
  const q = slab.species.map((el) => charges[el] ?? 0);
  const zc = heights.reduce((a, b) => a + b, 0) / heights.length;
  const dipole = q.reduce((acc, qi, i) => acc + qi * (heights[i]! - zc), 0);
  const dipolePerArea = dipole / area;
  const polar = Math.abs(dipolePerArea) > POLAR_TOLERANCE;
  const { of, layers } = clusterHeights(heights, null, LAYER_TOLERANCE);
  const layerQ = layers.map((_, k) => q.reduce((a, qi, i) => a + (of[i] === k ? qi : 0), 0));
  const tasker: 1 | 2 | 3 = polar ? 3 : layerQ.every((x) => Math.abs(x) < 1e-6) ? 1 : 2;
  const message = polar
    ? 'Heuristic (Tasker type III, S-063): with nominal charges this slab has a dipole across it, so the ' +
      'electrostatic potential differs between the two vacuum regions and the energy converges badly with ' +
      'thickness. Consider a termination that makes a symmetric slab, or a dipole correction (VASP wiki: LDIPOL, ' +
      'IDIPOL; S-066, S-065).'
    : `Heuristic (Tasker type ${tasker}, S-063): no dipole across the slab with nominal charges.`;
  return { polar, tasker, dipolePerArea, charges, heuristic: true, message, sources };
}
