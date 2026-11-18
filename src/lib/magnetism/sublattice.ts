// Magnetic sublattice: site selection, periodic neighbour shells, and the integer grids (pseudocubic for perovskite-like
// B sublattices, cubic a/2 grid for fcc cation sublattices) on which the named orderings are defined (M13.1, D-059).
// Pure geometry; tolerances below are conventions stated in D-059, not physics.
// @source S-058 (the named orderings live on the pseudocubic B sublattice of the perovskite)
import { atomicNumber } from '../crystal/elements';
import { guessCellType, reciprocalLattice } from '../crystal/lattice';
import { inv3, norm, sub, vecMat } from '../crystal/linalg';
import type { Mat3, Structure, Vec3 } from '../crystal/types';

export type Int3 = readonly [number, number, number];

/** Typed error for every refusal of the magnetism library. `code` lets the UI pick its message. */
export class MagneticError extends Error {
  constructor(
    readonly code:
      | 'no-magnetic-sites'
      | 'not-pseudocubic'
      | 'not-fcc'
      | 'k-not-collinear'
      | 'does-not-fit'
      | 'too-many-sites'
      | 'bad-input',
    message: string,
  ) {
    super(message);
    this.name = 'MagneticError';
  }
}

/** d-block (groups 3 to 12) and f-block (La to Lu, Ac to Lr) by atomic number: the default magnetic candidates. */
export function isDOrFBlock(symbol: string): boolean {
  const z = atomicNumber(symbol);
  if (z === undefined) return false;
  return (z >= 21 && z <= 30) || (z >= 39 && z <= 48) || (z >= 57 && z <= 80) || (z >= 89 && z <= 112);
}

/**
 * Indices of the magnetic sites. With `elements` given, every site of those elements; otherwise every d- or f-block
 * site (a starting suggestion for the UI, never a claim that the site carries a moment). Throws when none is found.
 */
export function selectMagneticSites(s: Structure, elements?: readonly string[]): number[] {
  const want = elements && elements.length > 0 ? new Set(elements) : undefined;
  const out = s.species.flatMap((sym, i) => ((want ? want.has(sym) : isDOrFBlock(sym)) ? [i] : []));
  if (out.length === 0)
    throw new MagneticError(
      'no-magnetic-sites',
      want
        ? `No site of ${[...want].join(', ')} in this structure.`
        : 'No transition-metal or f-block site found; choose the magnetic element by hand.',
    );
  return out;
}

export interface Neighbour {
  /** Index (into the structure) of the neighbour site. */
  site: number;
  /** Lattice image of the neighbour, in the cell basis. */
  image: Int3;
  /** Cartesian vector from the site to the neighbour image (Angstrom). */
  vector: Vec3;
  distance: number;
  /** 1 for the nearest-neighbour shell, 2 for the next one, ... */
  shell: number;
}

export interface NeighbourOptions {
  /** Relative shell tolerance: distances up to (1 + tol) times the first distance of a shell join it. Default 0.1. */
  shellTolerance?: number;
  /** Number of shells to return (default 2). */
  shells?: number;
}

const SAME = 1e-6;

/** All magnetic-magnetic neighbours of each magnetic site, with periodic images, grouped into distance shells. */
export function magneticNeighbours(
  s: Structure,
  sites: readonly number[],
  opts: NeighbourOptions = {},
): { shells: number[]; neighbours: Neighbour[][] } {
  const tol = opts.shellTolerance ?? 0.1;
  const nShells = opts.shells ?? 2;
  if (sites.length === 0) throw new MagneticError('no-magnetic-sites', 'No magnetic sites given.');
  const L = s.lattice;
  const rec = reciprocalLattice(L).map((r) => r.map((x) => x / (2 * Math.PI))) as unknown as Mat3;
  // every site sees an image of itself at the shortest lattice vector, so the first shell is within that length
  const lmin = Math.min(...L.map(norm));
  const search = (cut: number) => {
    const reach = rec.map((b) => Math.ceil(cut * norm(b)) + 1);
    const all: Omit<Neighbour, 'shell'>[][] = [];
    for (const i of sites) {
      const list: Omit<Neighbour, 'shell'>[] = [];
      for (const j of sites) {
        const df = sub(s.frac[j]!, s.frac[i]!);
        for (let a = -reach[0]!; a <= reach[0]!; a++)
          for (let b = -reach[1]!; b <= reach[1]!; b++)
            for (let c = -reach[2]!; c <= reach[2]!; c++) {
              const v = vecMat([df[0] + a, df[1] + b, df[2] + c], L);
              const d = norm(v);
              if (d > SAME && d <= cut) list.push({ site: j, image: [a, b, c], vector: v, distance: d });
            }
      }
      list.sort((x, y) => x.distance - y.distance || x.site - y.site);
      all.push(list);
    }
    return all;
  };
  const first = search(lmin * (1 + 1e-9));
  const dmin = Math.min(...first.flatMap((l) => l.map((n) => n.distance)));
  // shell boundaries from the distances of all sites together
  let cut = dmin * 2.5;
  let lists = search(cut);
  const shells: number[] = [];
  const bounds = () => {
    shells.length = 0;
    const ds = [...new Set(lists.flatMap((l) => l.map((n) => n.distance)))].sort((x, y) => x - y);
    let k = 0;
    while (k < ds.length && shells.length < nShells) {
      const start = ds[k]!;
      shells.push(start);
      while (k < ds.length && ds[k]! <= start * (1 + tol)) k++;
    }
  };
  bounds();
  while (shells.length < nShells && cut < dmin * 8) {
    cut *= 1.5;
    lists = search(cut);
    bounds();
  }
  const shellOf = (d: number): number => {
    for (let k = shells.length - 1; k >= 0; k--)
      if (d >= shells[k]! - SAME) return d <= shells[k]! * (1 + tol) ? k + 1 : 0;
    return 0;
  };
  const neighbours = lists.map((l) =>
    l.flatMap((n) => {
      const sh = shellOf(n.distance);
      return sh > 0 ? [{ ...n, shell: sh }] : [];
    }),
  );
  return { shells, neighbours };
}

/** An integer grid hosting every magnetic site: r_j - r_ref = c_j . axes, and each lattice row = c(row) . axes. */
export interface SiteGrid {
  kind: 'pseudocubic' | 'fcc-half-cube';
  /** Grid basis as rows (Angstrom). Pseudocubic: the three B-B axes. fcc: half the cubic axes. */
  axes: Mat3;
  /** Integer grid coordinates of each magnetic site, relative to the first magnetic site. */
  coords: Int3[];
  /** Integer grid coordinates of each lattice row of the cell. */
  latticeCoords: [Int3, Int3, Int3];
  /** Default stacking axis (index into axes) and why. */
  defaultAxis: 0 | 1 | 2;
  defaultAxisReason: string;
  /** The magnetic sites (indices into the structure) in the order of `coords`. */
  sites: number[];
  /** Largest distance of a site or lattice row from its rounded grid point, in grid units (a distortion measure). */
  maxResidual: number;
}

const PAIR_TOL = 0.2; // |v + w| / |v| for an antipodal pair, and |v - e| / |e| for a match to an axis
const ORTHO_TOL = 0.25; // |cos| between two axes
const GRID_TOL = 0.25; // largest residual from a grid point, in grid units

function axesFromVectors(vs: readonly Vec3[], label: string): Vec3[] {
  const used = new Set<number>();
  const axes: Vec3[] = [];
  vs.forEach((v, i) => {
    if (used.has(i)) return;
    const j = vs.findIndex(
      (w, jj) =>
        jj !== i && !used.has(jj) && norm([v[0] + w[0], v[1] + w[1], v[2] + w[2]]) < PAIR_TOL * norm(v),
    );
    if (j < 0)
      throw new MagneticError('not-pseudocubic', `The ${label} vectors do not come in opposite pairs.`);
    used.add(i).add(j);
    const w = vs[j]!;
    axes.push([(v[0] - w[0]) / 2, (v[1] - w[1]) / 2, (v[2] - w[2]) / 2]);
  });
  return axes;
}

function orthogonal(axes: readonly Vec3[], code: 'not-pseudocubic' | 'not-fcc', label: string): void {
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      const c =
        Math.abs(axes[i]![0] * axes[j]![0] + axes[i]![1] * axes[j]![1] + axes[i]![2] * axes[j]![2]) /
        (norm(axes[i]!) * norm(axes[j]!));
      if (c > ORTHO_TOL)
        throw new MagneticError(
          code,
          `The ${label} axes are far from perpendicular (angle ${((Math.acos(c) * 180) / Math.PI).toFixed(1)} degrees).`,
        );
    }
}

/** Orient and order the three axes deterministically: by the lattice row each is most parallel to, then by fraction. */
function orderAxes(axes: Vec3[], L: Mat3): Mat3 {
  const Linv = inv3(L);
  const keyed = axes.map((e) => {
    let f = vecMat(e, Linv);
    const lead = f.findIndex((x) => Math.abs(x) > 1e-6);
    if (lead >= 0 && f[lead]! < 0) {
      e = [-e[0], -e[1], -e[2]];
      f = [-f[0], -f[1], -f[2]];
    }
    const cosRow = L.map((r) => Math.abs(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]) / (norm(r) * norm(e)));
    const best = cosRow.indexOf(Math.max(...cosRow));
    return { e, f, best, cosRow };
  });
  keyed.sort((x, y) => x.best - y.best || y.f[0] - x.f[0] || y.f[1] - x.f[1] || y.f[2] - x.f[2]);
  return keyed.map((k) => k.e) as unknown as Mat3;
}

function defaultAxisFor(axes: Mat3, L: Mat3): { axis: 0 | 1 | 2; reason: string } {
  const lens = L.map(norm);
  const ortho = guessCellType(L, 1e-3, 1e-2) === 'orthorhombic';
  const row = ortho ? lens.indexOf(Math.max(...lens)) : 2;
  const r = L[row]!;
  const cos = axes.map((e) => Math.abs(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]) / (norm(r) * norm(e)));
  const axis = cos.indexOf(Math.max(...cos)) as 0 | 1 | 2;
  const name = 'abc'[row];
  return {
    axis,
    reason: ortho
      ? `orthorhombic cell: the axis along the longest lattice vector (${name})`
      : `the axis closest to the lattice vector c`,
  };
}

function gridCoords(s: Structure, sites: readonly number[], axes: Mat3, code: 'not-pseudocubic' | 'not-fcc') {
  const Einv = inv3(axes);
  let maxResidual = 0;
  const round = (x: Vec3, what: string): Int3 => {
    const c = vecMat(x, Einv);
    const r = c.map(Math.round) as unknown as Int3;
    const res = Math.max(...c.map((v, i) => Math.abs(v - r[i]!)));
    maxResidual = Math.max(maxResidual, res);
    if (res > GRID_TOL)
      throw new MagneticError(
        code,
        `${what} is ${res.toFixed(2)} grid units away from the nearest grid point; the sublattice is too distorted for the named orderings. Use a propagation vector or custom signs.`,
      );
    return [r[0] + 0, r[1] + 0, r[2] + 0];
  };
  const r0 = vecMat(s.frac[sites[0]!]!, s.lattice);
  const coords = sites.map((j) => round(sub(vecMat(s.frac[j]!, s.lattice), r0), `Site ${j + 1}`));
  const latticeCoords = s.lattice.map((row, i) => round(row, `Lattice vector ${'abc'[i]}`)) as unknown as [
    Int3,
    Int3,
    Int3,
  ];
  return { coords, latticeCoords, maxResidual };
}

function matchAll(
  lists: readonly Neighbour[][],
  shell: number,
  targets: readonly Vec3[],
  code: 'not-pseudocubic' | 'not-fcc',
  label: string,
) {
  lists.forEach((l, i) => {
    const vs = l.filter((n) => n.shell === shell).map((n) => n.vector);
    if (vs.length !== targets.length)
      throw new MagneticError(
        code,
        `Magnetic site ${i + 1} has ${vs.length} ${label} neighbours, expected ${targets.length}.`,
      );
    for (const v of vs)
      if (!targets.some((t) => norm(sub(v, t)) < PAIR_TOL * norm(t)))
        throw new MagneticError(
          code,
          `A ${label} neighbour of magnetic site ${i + 1} does not lie along the common axes.`,
        );
  });
}

/**
 * Pseudocubic grid of a perovskite-like magnetic sublattice: every magnetic site has six nearest magnetic neighbours
 * along three roughly perpendicular axis pairs, the same at every site. Refuses with MagneticError('not-pseudocubic').
 */
export function pseudocubicGrid(
  s: Structure,
  sites: readonly number[],
  opts: NeighbourOptions = {},
): SiteGrid {
  const { neighbours } = magneticNeighbours(s, sites, { ...opts, shells: 1 });
  const first = neighbours[0]!.filter((n) => n.shell === 1).map((n) => n.vector);
  if (first.length !== 6)
    throw new MagneticError(
      'not-pseudocubic',
      `The first magnetic site has ${first.length} nearest magnetic neighbours; a pseudocubic sublattice has 6.`,
    );
  const raw = axesFromVectors(first, 'nearest-neighbour');
  orthogonal(raw, 'not-pseudocubic', 'pseudocubic');
  const axes = orderAxes(raw, s.lattice);
  matchAll(
    neighbours,
    1,
    axes.flatMap((e) => [e, [-e[0], -e[1], -e[2]] as Vec3]),
    'not-pseudocubic',
    'nearest',
  );
  const g = gridCoords(s, sites, axes, 'not-pseudocubic');
  const d = defaultAxisFor(axes, s.lattice);
  return {
    kind: 'pseudocubic',
    axes,
    ...g,
    defaultAxis: d.axis,
    defaultAxisReason: d.reason,
    sites: [...sites],
  };
}

/**
 * Cubic half-axis grid of an fcc magnetic sublattice (the rock-salt cation sublattice): 12 nearest neighbours at
 * (+-u_i +- u_j)/2 and 6 second neighbours at +-u_i. Grid coordinates are in units of u/2, so their sum is even.
 */
export function fccGrid(s: Structure, sites: readonly number[], opts: NeighbourOptions = {}): SiteGrid {
  const { neighbours } = magneticNeighbours(s, sites, { ...opts, shells: 2 });
  const second = neighbours[0]!.filter((n) => n.shell === 2).map((n) => n.vector);
  if (second.length !== 6 || neighbours[0]!.filter((n) => n.shell === 1).length !== 12)
    throw new MagneticError(
      'not-fcc',
      'The magnetic sublattice is not face-centred cubic (12 nearest and 6 second neighbours expected).',
    );
  const cube = axesFromVectors(second, 'second-neighbour');
  orthogonal(cube, 'not-fcc', 'cubic');
  const u = orderAxes(cube, s.lattice);
  const half = u.map((e) => [e[0] / 2, e[1] / 2, e[2] / 2]) as unknown as Mat3;
  const nn: Vec3[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++)
      for (const a of [1, -1])
        for (const b of [1, -1])
          nn.push([0, 1, 2].map((c) => a * half[i]![c]! + b * half[j]![c]!) as unknown as Vec3);
  matchAll(neighbours, 1, nn, 'not-fcc', 'nearest');
  matchAll(
    neighbours,
    2,
    u.flatMap((e) => [e, [-e[0], -e[1], -e[2]] as Vec3]),
    'not-fcc',
    'second',
  );
  const g = gridCoords(s, sites, half, 'not-fcc');
  return {
    kind: 'fcc-half-cube',
    axes: half,
    ...g,
    defaultAxis: 2,
    defaultAxisReason: 'the [111] body diagonal of the grid',
    sites: [...sites],
  };
}
