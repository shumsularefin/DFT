// Building blocks for scene generators (M16.3): turn crystals, functions and grids into plain layers. Pure, no three.js.
// Every helper returns data in the types of `types.ts`, so a scene is tested in Node exactly as it will be drawn.
import { brillouinZone } from '../crystal/brillouin';
import { bondPairs, covalentRadius } from '../crystal/covalent';
import { fracToCart, reciprocalLattice } from '../crystal/lattice';
import type { Mat3, Structure } from '../crystal/types';
import { extractIsosurface } from '../physics/marchingCubes';
import { convexHull } from '../scene/polyhedra';
import { elementColor, VESTA_SIZES } from '../three/vestaStyle';
import { add, cross, normalize, norm, scale, sub, type Vec3 } from './math';
import type {
  ArrowsLayer,
  AtomsLayer,
  Color,
  CurveLayer,
  LabelsLayer,
  Layer,
  LinesLayer,
  MeshLayer,
  PointsLayer,
  SceneFrame,
} from './types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];

/** Format a number for a readout or a description: fixed digits, a real minus sign avoided (plain hyphen-minus). */
export function fmt(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return String(x);
  const s = x.toFixed(digits);
  return s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s;
}

/**
 * Atom colour per species: the element colour of the Studio viewer (D-122), the same on every page. The element symbol is
 * always shown as well (legend, labels, description), so colour never carries the meaning alone.
 */
export function speciesTones(species: readonly string[]): Map<string, Color> {
  const out = new Map<string, Color>();
  for (const s of species) if (!out.has(s)) out.set(s, elementColor(s) as Color);
  return out;
}

/** The 12 edges of the cell spanned by the lattice rows, from `origin`. */
export function cellEdges(lattice: Mat3 | readonly Vec3[], origin: Vec3 = [0, 0, 0]): [Vec3, Vec3][] {
  const [a, b, c] = [v3(lattice[0]!), v3(lattice[1]!), v3(lattice[2]!)];
  const corner = (i: number, j: number, k: number): Vec3 =>
    add(origin, add(add(scale(a, i), scale(b, j)), scale(c, k)));
  const out: [Vec3, Vec3][] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1]) {
        if (!i) out.push([corner(i, j, k), corner(1, j, k)]);
        if (!j) out.push([corner(i, j, k), corner(i, 1, k)]);
        if (!k) out.push([corner(i, j, k), corner(i, j, 1)]);
      }
  return out;
}

export function cellLayer(
  lattice: Mat3 | readonly Vec3[],
  group = 'cell',
  color: Color = 'muted',
): LinesLayer {
  return { kind: 'lines', group, name: 'Unit cell', segments: cellEdges(lattice), color };
}

export interface CrystalOptions {
  /** Repeat the cell n1 x n2 x n3 times (default 1 x 1 x 1). */
  repeat?: [number, number, number];
  /** Also draw atoms on the far faces, edges and corners (fractional 0 copied to 1), like a textbook picture. */
  boundary?: boolean;
  /** Atom radius as a fraction of the covalent radius (default 0.45). */
  radiusScale?: number;
  /** Draw bonds (drawing heuristic, see `bondPairs`). Default true. */
  bonds?: boolean;
  /** Group ids (defaults: atoms, bonds, cell). */
  groups?: { atoms?: string; bonds?: string; cell?: string };
}

/** Atoms, bonds and cell of a crystal, in Cartesian Angstrom. Returns the layers and the Cartesian positions drawn. */
export function crystalLayers(
  s: Structure,
  o: CrystalOptions = {},
): { layers: Layer[]; positions: Vec3[]; species: string[] } {
  const [n1, n2, n3] = o.repeat ?? [1, 1, 1];
  const fracs: Vec3[] = [];
  const species: string[] = [];
  const eps = 1e-6;
  for (let i = 0; i < s.frac.length; i++) {
    const f = s.frac[i]!;
    const shifts: number[][] = [[0], [0], [0]];
    if (o.boundary) for (let k = 0; k < 3; k++) if (Math.abs(f[k]!) < eps) shifts[k]!.push([n1, n2, n3][k]!);
    for (let a = 0; a < n1; a++)
      for (let b = 0; b < n2; b++)
        for (let c = 0; c < n3; c++)
          for (const sa of shifts[0]!)
            for (const sb of shifts[1]!)
              for (const sc of shifts[2]!) {
                const g: Vec3 = [f[0]! + a + sa, f[1]! + b + sb, f[2]! + c + sc];
                if (g[0] > n1 + eps || g[1] > n2 + eps || g[2] > n3 + eps) continue;
                fracs.push(g);
                species.push(s.species[i]!);
              }
  }
  const positions = fracs.map((f) => v3(fracToCart(f, s.lattice)));
  const tones = speciesTones(s.species);
  const rs = o.radiusScale ?? VESTA_SIZES.atomScale;
  const g = { atoms: 'atoms', bonds: 'bonds', cell: 'cell', ...o.groups };
  const layers: Layer[] = [
    {
      kind: 'atoms',
      group: g.atoms,
      name: 'Atoms',
      positions,
      radius: species.map((e) => covalentRadius(e).radius * rs),
      color: species.map((e) => tones.get(e)!),
      labels: species.map((e, i) => `${e} ${i + 1}`),
    },
  ];
  if (o.bonds !== false && positions.length <= 1200) {
    // two-tone bonds as in the Studio viewer: each half in the colour of the atom it starts from
    const halves = new Map<string, [Vec3, Vec3][]>();
    for (const [i, j] of bondPairs(positions, species)) {
      const a = positions[i]!;
      const b = positions[j]!;
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      for (const [el, p, q] of [
        [species[i]!, a, mid],
        [species[j]!, mid, b],
      ] as const) {
        if (!halves.has(el)) halves.set(el, []);
        halves.get(el)!.push([p, q]);
      }
    }
    for (const [el, segments] of halves)
      layers.push({
        kind: 'lines',
        group: g.bonds,
        name: 'Bonds',
        segments,
        color: tones.get(el)!,
        tube: VESTA_SIZES.bondRadius,
      });
  }
  const sup: Vec3[] = [scale(v3(s.lattice[0]), n1), scale(v3(s.lattice[1]), n2), scale(v3(s.lattice[2]), n3)];
  layers.push(cellLayer(sup, g.cell));
  return { layers, positions, species };
}

/** A sampled surface z = f(x, y) as a mesh, coloured by z (or by `color` when `colormap` is off). */
export function surfaceLayer(
  f: (x: number, y: number) => number,
  xr: [number, number],
  yr: [number, number],
  nx: number,
  ny: number,
  o: {
    group?: string;
    name?: string;
    color?: Color;
    colormap?: MeshLayer['colormap'] | false;
    zScale?: number;
    opacity?: number;
  } = {},
): MeshLayer {
  const positions: number[] = [];
  const values: number[] = [];
  const zs = o.zScale ?? 1;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = xr[0] + ((xr[1] - xr[0]) * i) / nx;
      const y = yr[0] + ((yr[1] - yr[0]) * j) / ny;
      const z = f(x, y);
      positions.push(x, y, z * zs);
      values.push(z);
    }
  const indices: number[] = [];
  const id = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      indices.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group ?? 'surface',
    name: o.name ?? 'Surface',
    positions,
    indices,
    color: o.color ?? 'accent',
  };
  if (o.colormap !== false) {
    layer.values = values;
    layer.colormap = o.colormap ?? 'sequential';
  }
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  return layer;
}

/**
 * Isosurface of a scalar field sampled on a box: `f(x, y, z)` on an n x n x n grid over [lo, hi] in each axis.
 * Returns the mesh of f = level (interior f > level when `above`, the usual choice for densities).
 */
export function isosurfaceLayer(
  f: (x: number, y: number, z: number) => number,
  lo: Vec3,
  hi: Vec3,
  n: number | [number, number, number],
  level: number,
  o: { group?: string; name?: string; color?: Color; opacity?: number; above?: boolean } = {},
): MeshLayer {
  const [nx, ny, nz] = typeof n === 'number' ? [n, n, n] : n;
  const values = new Float64Array(nx * ny * nz);
  const step = (k: number, m: number) => (hi[k]! - lo[k]!) / (m - 1);
  const [hx, hy, hz] = [step(0, nx), step(1, ny), step(2, nz)];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        values[i + nx * (j + ny * k)] = f(lo[0] + i * hx, lo[1] + j * hy, lo[2] + k * hz);
  return gridIsosurfaceLayer(
    values,
    [nx, ny, nz],
    (g) => [lo[0] + g[0] * hx, lo[1] + g[1] * hy, lo[2] + g[2] * hz],
    level,
    o,
  );
}

/** Isosurface of a grid already sampled (x fastest), mapped from grid coordinates to the scene by `toScene`. */
export function gridIsosurfaceLayer(
  values: ArrayLike<number>,
  grid: [number, number, number],
  toScene: (g: Vec3) => Vec3,
  level: number,
  o: {
    group?: string;
    name?: string;
    color?: Color;
    opacity?: number;
    above?: boolean;
    periodic?: boolean;
  } = {},
): MeshLayer {
  const mesh = extractIsosurface(values, grid, level, {
    invert: o.above !== false,
    periodic: o.periodic ?? false,
  });
  const positions: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = toScene([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]);
    positions.push(p[0], p[1], p[2]);
  }
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group ?? 'isosurface',
    name: o.name ?? 'Isosurface',
    positions,
    indices: Array.from(mesh.indices),
    color: o.color ?? 'accent',
  };
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  return layer;
}

/** Convex polyhedron through the given points (coordination polyhedra, zones), as a triangle mesh with edges. */
export function hullLayer(
  points: readonly Vec3[],
  o: { group?: string; name?: string; color?: Color; opacity?: number } = {},
): MeshLayer {
  const { faces } = convexHull(points);
  const positions = points.flatMap((p) => [p[0], p[1], p[2]]);
  const indices: number[] = [];
  for (const f of faces) for (let k = 1; k + 1 < f.length; k++) indices.push(f[0]!, f[k]!, f[k + 1]!);
  return {
    kind: 'mesh',
    group: o.group ?? 'polyhedra',
    name: o.name ?? 'Polyhedra',
    positions,
    indices,
    color: o.color ?? 'accent',
    opacity: o.opacity ?? 0.45,
    edges: true,
  };
}

/** A sphere mesh (UV sphere), for spheres that are a quantity (a cutoff sphere, a Fermi sphere), not atoms. */
export function sphereLayer(
  center: Vec3,
  r: number,
  o: {
    group?: string;
    name?: string;
    color?: Color;
    opacity?: number;
    wireframe?: boolean;
    segments?: number;
  } = {},
): MeshLayer {
  const seg = o.segments ?? 32;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= seg; j++) {
    const th = (Math.PI * j) / seg;
    for (let i = 0; i <= 2 * seg; i++) {
      const ph = (Math.PI * i) / seg;
      positions.push(
        center[0] + r * Math.sin(th) * Math.cos(ph),
        center[1] + r * Math.sin(th) * Math.sin(ph),
        center[2] + r * Math.cos(th),
      );
    }
  }
  const w = 2 * seg + 1;
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < 2 * seg; i++) {
      const a = j * w + i;
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group ?? 'sphere',
    name: o.name ?? 'Sphere',
    positions,
    indices,
    color: o.color ?? 'accent',
  };
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  if (o.wireframe) layer.wireframe = true;
  return layer;
}

/** A flat parallelogram (a plane slice, a surface, a wall) spanned by u and v from `origin`, two triangles. */
export function quadLayer(
  origin: Vec3,
  u: Vec3,
  v: Vec3,
  o: {
    group?: string;
    name?: string;
    color?: Color;
    opacity?: number;
    values?: [number, number, number, number];
  } = {},
): MeshLayer {
  const p = [origin, add(origin, u), add(add(origin, u), v), add(origin, v)];
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group ?? 'plane',
    name: o.name ?? 'Plane',
    positions: p.flatMap((q) => [q[0], q[1], q[2]]),
    indices: [0, 1, 2, 0, 2, 3],
    color: o.color ?? 'accent',
    opacity: o.opacity ?? 0.35,
  };
  return layer;
}

/** A coloured slice: a grid of values on the plane origin + s u + t v (s, t in [0, 1]), drawn as a colour-mapped mesh. */
export function sliceLayer(
  f: (p: Vec3) => number,
  origin: Vec3,
  u: Vec3,
  v: Vec3,
  n: number,
  o: {
    group?: string;
    name?: string;
    colormap?: MeshLayer['colormap'];
    range?: [number, number];
    opacity?: number;
  } = {},
): MeshLayer {
  const positions: number[] = [];
  const values: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const p = add(origin, add(scale(u, i / n), scale(v, j / n)));
      positions.push(p[0], p[1], p[2]);
      values.push(f(p));
    }
  const indices: number[] = [];
  const id = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      indices.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group ?? 'slice',
    name: o.name ?? 'Slice',
    positions,
    indices,
    color: 'accent',
    values,
    colormap: o.colormap ?? 'sequential',
  };
  if (o.range) layer.range = o.range;
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  return layer;
}

/** The first Brillouin zone of a real-space lattice (rows in Angstrom), in 1/Angstrom with the 2 pi factor, as edges. */
export function brillouinLayers(
  lattice: Mat3,
  o: { group?: string; faces?: boolean } = {},
): { layers: Layer[]; reciprocal: Vec3[] } {
  const rec = reciprocalLattice(lattice).map((r) => v3(r)) as Vec3[];
  const bz = brillouinZone(rec as unknown as Mat3);
  const verts = bz.vertices.map(v3);
  const layers: Layer[] = [
    {
      kind: 'lines',
      group: o.group ?? 'zone',
      name: 'Brillouin zone',
      segments: bz.edges.map(([i, j]) => [verts[i]!, verts[j]!]),
      color: 'ink',
    },
  ];
  if (o.faces !== false) {
    const positions = verts.flatMap((p) => [p[0], p[1], p[2]]);
    const indices: number[] = [];
    for (const f of bz.faces)
      for (let k = 1; k + 1 < f.vertexIds.length; k++)
        indices.push(f.vertexIds[0]!, f.vertexIds[k]!, f.vertexIds[k + 1]!);
    layers.push({
      kind: 'mesh',
      group: o.group ?? 'zone',
      positions,
      indices,
      color: 'accent',
      opacity: 0.12,
    });
  }
  return { layers, reciprocal: rec };
}

/** x, y, z axis arrows with labels from the origin (for function plots and abstract spaces). */
export function axesLayers(
  len: number | [number, number, number],
  labels: [string, string, string] = ['x', 'y', 'z'],
  origin: Vec3 = [0, 0, 0],
  group = 'axes',
): Layer[] {
  const [lx, ly, lz] = typeof len === 'number' ? [len, len, len] : len;
  const vectors: Vec3[] = [
    [lx, 0, 0],
    [0, ly, 0],
    [0, 0, lz],
  ];
  return [
    {
      kind: 'arrows',
      group,
      name: 'Axes',
      from: [origin, origin, origin],
      vectors,
      color: 'muted',
      thickness: 0.015,
    },
    {
      kind: 'labels',
      group,
      items: vectors.map((v, i) => ({ text: labels[i]!, at: add(origin, scale(v, 1.08)) })),
    },
  ];
}

/** A polyline through points as a curve layer. */
export const curve = (
  points: Vec3[],
  color: Color = 'accent',
  group = 'curve',
  o: Partial<CurveLayer> = {},
): CurveLayer => ({
  kind: 'curve',
  group,
  points,
  color,
  ...o,
});

export const points = (
  positions: Vec3[],
  color: PointsLayer['color'],
  size: number,
  group = 'points',
  o: Partial<PointsLayer> = {},
): PointsLayer => ({
  kind: 'points',
  group,
  positions,
  color,
  size,
  ...o,
});

export const labels = (items: LabelsLayer['items'], group = 'labels'): LabelsLayer => ({
  kind: 'labels',
  group,
  items,
});

export const arrows = (
  from: Vec3[],
  vectors: Vec3[],
  color: ArrowsLayer['color'],
  group = 'arrows',
  o: Partial<ArrowsLayer> = {},
): ArrowsLayer => ({
  kind: 'arrows',
  group,
  from,
  vectors,
  color,
  ...o,
});

export const atoms = (
  positions: Vec3[],
  radius: AtomsLayer['radius'],
  color: AtomsLayer['color'],
  group = 'atoms',
  o: Partial<AtomsLayer> = {},
): AtomsLayer => ({
  kind: 'atoms',
  group,
  positions,
  radius,
  color,
  ...o,
});

export const lines = (
  segments: [Vec3, Vec3][],
  color: Color = 'muted',
  group = 'lines',
  o: Partial<LinesLayer> = {},
): LinesLayer => ({
  kind: 'lines',
  group,
  segments,
  color,
  ...o,
});

/** A tube-like ribbon for a 1D function drawn in 3D: the points (x, 0, f(x)) for x in [a, b]. */
export function graph1d(
  f: (x: number) => number,
  a: number,
  b: number,
  n = 200,
  at: (x: number, y: number) => Vec3 = (x, y) => [x, 0, y],
): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    out.push(at(x, f(x)));
  }
  return out;
}

/** Centre and radius of everything a frame draws (used for framing the camera and for posters). */
export function frameBounds(layers: readonly Layer[]): { center: Vec3; radius: number } {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const take = (p: readonly number[], pad = 0) => {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, p[k]! - pad);
      hi[k] = Math.max(hi[k]!, p[k]! + pad);
    }
  };
  for (const l of layers) {
    switch (l.kind) {
      case 'atoms':
        l.positions.forEach((p, i) => take(p, typeof l.radius === 'number' ? l.radius : (l.radius[i] ?? 0)));
        break;
      case 'points':
        l.positions.forEach((p) => take(p, l.size));
        break;
      case 'lines':
        l.segments.forEach(([a, b]) => (take(a), take(b)));
        break;
      case 'curve':
        l.points.forEach((p) => take(p));
        break;
      case 'arrows':
        l.from.forEach((p, i) => (take(p), take(add(p, l.vectors[i]!))));
        break;
      case 'mesh':
        for (let i = 0; i < l.positions.length; i += 3)
          take([l.positions[i]!, l.positions[i + 1]!, l.positions[i + 2]!]);
        break;
      case 'labels':
        l.items.forEach((it) => take(it.at));
        break;
    }
  }
  if (!Number.isFinite(lo[0])) return { center: [0, 0, 0], radius: 1 };
  const center = scale(add(lo, hi), 0.5);
  return { center, radius: Math.max(1e-6, norm(sub(hi, lo)) / 2) };
}

/** Checks every generator output: finite numbers, consistent lengths, valid indices, a non-empty description. */
export function validateFrame(f: SceneFrame): string[] {
  const errs: string[] = [];
  const finite = (p: readonly number[], what: string) => {
    if (!p.every(Number.isFinite)) errs.push(`${what}: non-finite number`);
  };
  if (!f.describe || f.describe.trim().length < 20) errs.push('describe: missing or too short');
  if (/\u2014/.test(f.describe)) errs.push('describe: em dash');
  f.layers.forEach((l, k) => {
    const w = `layer ${k} (${l.kind}, ${l.group})`;
    switch (l.kind) {
      case 'atoms':
        l.positions.forEach((p) => finite(p, w));
        if (Array.isArray(l.radius) && l.radius.length !== l.positions.length)
          errs.push(`${w}: radius length`);
        if (Array.isArray(l.color) && l.color.length !== l.positions.length) errs.push(`${w}: color length`);
        break;
      case 'points':
        l.positions.forEach((p) => finite(p, w));
        if (Array.isArray(l.color) && l.color.length !== l.positions.length) errs.push(`${w}: color length`);
        break;
      case 'lines':
        l.segments.forEach(([a, b]) => (finite(a, w), finite(b, w)));
        break;
      case 'curve':
        l.points.forEach((p) => finite(p, w));
        if (l.points.length < 2) errs.push(`${w}: fewer than two points`);
        break;
      case 'arrows':
        if (l.from.length !== l.vectors.length) errs.push(`${w}: from and vectors differ in length`);
        l.from.forEach((p) => finite(p, w));
        l.vectors.forEach((p) => finite(p, w));
        break;
      case 'mesh': {
        finite(l.positions, w);
        if (l.positions.length % 3) errs.push(`${w}: positions not a multiple of 3`);
        const nv = l.positions.length / 3;
        if (l.indices && l.indices.some((i) => !Number.isInteger(i) || i < 0 || i >= nv))
          errs.push(`${w}: index out of range`);
        if (l.values && l.values.length !== nv) errs.push(`${w}: values length`);
        if (l.values) finite(l.values, w);
        break;
      }
      case 'labels':
        l.items.forEach((it) => finite(it.at, w));
        break;
    }
  });
  return errs;
}

/** Number of triangles a frame asks for (sphere atoms counted at the engine's default detail). */
export function triangleEstimate(f: SceneFrame): number {
  let n = 0;
  for (const l of f.layers) {
    if (l.kind === 'mesh') n += (l.indices ? l.indices.length : l.positions.length / 3) / 3;
    else if (l.kind === 'atoms') n += l.positions.length * 320;
    else if (l.kind === 'points') n += l.positions.length * 20;
    else if (l.kind === 'arrows') n += l.from.length * 48;
    else if (l.kind === 'lines' && l.tube) n += l.segments.length * 16;
    else if (l.kind === 'curve' && l.tube) n += l.points.length * 16;
  }
  return n;
}

/** Unit normal of the triangle (a, b, c), for tests of meshes. */
export const triangleNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => normalize(cross(sub(b, a), sub(c, a)));
