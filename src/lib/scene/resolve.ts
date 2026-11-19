// Turn a SceneSpec (and a chosen step) into plain geometry in Angstrom, centred on the middle of the displayed block.
// Both renderers (the SVG projection and the three.js scene) draw from this one result, so they cannot disagree.
// Coordinates here are physics coordinates (x, y, z); `toScene` in three/cellEdges.ts maps them to the 3D scene.
// @source S-021 (bond rule: covalent radii), S-043 (polyhedra convention), S-057 (colours)
import { cellAtoms, cellOrigins } from '../crystal/cellAtoms';
import { bondPairs, covalentRadius } from '../crystal/covalent';
import { fracToCart, reciprocalLattice } from '../crystal/lattice';
import { cross, norm, sub } from '../crystal/linalg';
import type { Structure, Vec3 } from '../crystal/types';
import { speciesColors } from '../three/palette';
import { coordinationPolyhedra } from './polyhedra';
import {
  isStructureRef,
  type Camera,
  type PlaneSpec,
  type SceneSpec,
  type ShowSpec,
  type SpinSpec,
  type VectorSpec,
} from './spec';

export type StructureLookup = (id: string) => Structure | undefined;

export interface RAtom {
  site: number;
  species: string;
  cart: Vec3;
  color: string;
  /** Drawing radius, Angstrom (a fraction of the covalent radius: a drawing choice, not physics). */
  radius: number;
  image: boolean;
  highlighted: boolean;
}
export interface RSpin {
  /** Where the arrow starts (the atom centre). */
  from: Vec3;
  /** Cartesian direction and length of the arrow, Angstrom. */
  vector: Vec3;
  /** Sign of the moment's component along the arrow's axis, used for the label and the head style. */
  sign: 1 | -1;
  moment: number;
}
export interface RPolyhedron {
  centre: Vec3;
  vertices: Vec3[];
  faces: number[][];
  edges: [number, number][];
}
export interface RPlane {
  hkl: [number, number, number];
  polygon: Vec3[];
}
export interface RVector {
  from: Vec3;
  to: Vec3;
  label: string;
}
export interface ResolvedScene {
  id: string;
  structure: Structure;
  atoms: RAtom[];
  cellEdges: [Vec3, Vec3][];
  bonds: [Vec3, Vec3][];
  polyhedra: RPolyhedron[];
  spins: RSpin[];
  planes: RPlane[];
  vectors: RVector[];
  labels: { text: string; at: Vec3 }[];
  legend: { symbol: string; color: string }[];
  camera: Camera;
  /** Largest cell edge of the block, Angstrom: sets the arrow and label scale. */
  extent: number;
  show: Required<Pick<ShowSpec, 'atoms' | 'bonds' | 'cell' | 'labels'>> & Pick<ShowSpec, 'polyhedra'>;
  bondsSkipped: boolean;
}

export const MAX_BOND_ATOMS = 1200;
const ATOM_SCALE = 0.5;

/** The spec with the step's overrides applied (step -1 or no steps: the spec itself). */
export function applyStep(spec: SceneSpec, step: number): SceneSpec {
  const st = spec.steps?.[step];
  if (!st) return spec;
  return {
    ...spec,
    show: { ...spec.show, ...st.show },
    spins: st.spins ?? spec.spins,
    highlight: st.highlight ?? spec.highlight,
    camera: st.camera ?? spec.camera,
    planes: st.planes ?? spec.planes,
    vectors: st.vectors ?? spec.vectors,
  };
}

export function structureOf(spec: SceneSpec, lookup: StructureLookup): Structure {
  if (!isStructureRef(spec.structure)) return spec.structure;
  const s = lookup(spec.structure.ref);
  if (!s) throw new Error(`scene "${spec.id}": unknown structure "${spec.structure.ref}"`);
  return s;
}

/** The polygon where the plane h f1 + k f2 + l f3 = d cuts the unit cell (fractional), d = 1 for non-negative indices, else 0. */
export function planePolygon(hkl: readonly [number, number, number], lattice: Structure['lattice']): Vec3[] {
  let [h, k, l] = hkl;
  if (h <= 0 && k <= 0 && l <= 0) [h, k, l] = [-h, -k, -l];
  const d = h >= 0 && k >= 0 && l >= 0 ? 1 : 0;
  const val = (f: Vec3) => h * f[0] + k * f[1] + l * f[2] - d;
  const pts: Vec3[] = [];
  const add = (p: Vec3) => {
    if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9)) pts.push(p);
  };
  for (let ax = 0; ax < 3; ax++) {
    const o = [(ax + 1) % 3, (ax + 2) % 3] as const;
    for (const u of [0, 1])
      for (const v of [0, 1]) {
        const a: number[] = [0, 0, 0];
        const b: number[] = [0, 0, 0];
        a[o[0]] = b[o[0]] = u;
        a[o[1]] = b[o[1]] = v;
        b[ax] = 1;
        const fa = val(a as unknown as Vec3);
        const fb = val(b as unknown as Vec3);
        if (Math.abs(fa) < 1e-12) add(a as unknown as Vec3);
        if (Math.abs(fb) < 1e-12) add(b as unknown as Vec3);
        if (fa * fb < 0) {
          const t = fa / (fa - fb);
          const p: number[] = [0, 0, 0];
          p[o[0]] = u;
          p[o[1]] = v;
          p[ax] = t;
          add(p as unknown as Vec3);
        }
      }
  }
  if (pts.length < 3) return [];
  const cart = pts.map((f) => fracToCart(f, lattice));
  const cen: Vec3 = [0, 1, 2].map(
    (i) => cart.reduce((s, p) => s + p[i]!, 0) / cart.length,
  ) as unknown as Vec3;
  const nrm = cross(sub(cart[1]!, cart[0]!), sub(cart[2]!, cart[0]!));
  const u = sub(cart[0]!, cen);
  const v = cross(nrm, u);
  const ang = (p: Vec3) => {
    const r = sub(p, cen);
    return Math.atan2(
      (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / norm(v),
      (r[0] * u[0] + r[1] * u[1] + r[2] * u[2]) / norm(u),
    );
  };
  return [...cart].sort((p, q) => ang(p) - ang(q));
}

function spinsToArrows(spins: SpinSpec, atoms: RAtom[], extent: number): RSpin[] {
  const maxMag = Math.max(1e-9, ...spins.map((s) => (typeof s === 'number' ? Math.abs(s) : norm(s))));
  const out: RSpin[] = [];
  for (const a of atoms) {
    const s = spins[a.site]!;
    const v: Vec3 = typeof s === 'number' ? [0, 0, s] : s;
    const mag = norm(v);
    if (mag < 1e-12) continue; // zero moment: a plain atom
    const len = (0.38 * extent * mag) / maxMag;
    out.push({
      from: a.cart,
      vector: [(v[0] / mag) * len, (v[1] / mag) * len, (v[2] / mag) * len],
      // sign: along the cell's up axis for collinear numbers; for 3-vectors the sign of the dominant component
      sign: (typeof s === 'number' ? s : dominant(v)) >= 0 ? 1 : -1,
      moment: typeof s === 'number' ? s : mag,
    });
  }
  return out;
}
const dominant = (v: Vec3): number => {
  const i = [0, 1, 2].reduce((m, k) => (Math.abs(v[k]!) > Math.abs(v[m]!) ? k : m), 0);
  return v[i]!;
};

/** Everything a renderer needs, in Angstrom, with the middle of the displayed block at the origin. */
export function resolveScene(specIn: SceneSpec, lookup: StructureLookup, step = -1): ResolvedScene {
  const spec = applyStep(specIn, step);
  const s = structureOf(spec, lookup);
  const repeat = spec.repeat ?? [1, 1, 1];
  const show = {
    atoms: spec.show?.atoms ?? true,
    bonds: spec.show?.bonds ?? false,
    cell: spec.show?.cell ?? true,
    labels: spec.show?.labels ?? false,
    polyhedra: spec.show?.polyhedra,
  };
  if (spec.spins && spec.spins.length !== s.frac.length)
    throw new Error(
      `scene "${spec.id}": spins count ${spec.spins.length} must equal site count ${s.frac.length}`,
    );
  const block = [0, 1, 2].map((i) =>
    s.lattice[i]!.map((x) => x * repeat[i]!),
  ) as unknown as Structure['lattice'];
  const centre: Vec3 = [0, 1, 2].map(
    (d) => (block[0]![d]! + block[1]![d]! + block[2]![d]!) / 2,
  ) as unknown as Vec3;
  const shift = (v: Vec3): Vec3 => [v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]];
  const extent = Math.max(norm(block[0]), norm(block[1]), norm(block[2]), 1e-6);

  const colors = speciesColors(s.species);
  const hi = new Set(spec.highlight ?? []);
  const drawn = cellAtoms(s, repeat, true);
  // cellAtoms drops the site index, so recover it: atoms come out site by site in order
  const siteOf: number[] = [];
  s.frac.forEach((_, i) => {
    const n = cellAtoms({ ...s, species: [s.species[i]!], frac: [s.frac[i]!] }, repeat, true).length;
    for (let k = 0; k < n; k++) siteOf.push(i);
  });
  const atoms: RAtom[] = drawn.map((a, i) => ({
    site: siteOf[i]!,
    species: a.species,
    cart: shift(a.cart),
    color: colors.get(a.species)!,
    radius: covalentRadius(a.species).radius * ATOM_SCALE,
    image: a.image,
    highlighted: hi.has(siteOf[i]!),
  }));

  const cellEdges: [Vec3, Vec3][] = [];
  if (show.cell)
    for (const o of cellOrigins(s.lattice, repeat)) {
      const corner = (a: number, b: number, c: number): Vec3 =>
        shift(
          [0, 1, 2].map(
            (d) => o[d]! + a * s.lattice[0]![d]! + b * s.lattice[1]![d]! + c * s.lattice[2]![d]!,
          ) as unknown as Vec3,
        );
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4])
          if (!(i & bit))
            cellEdges.push([
              corner((i >> 2) & 1, (i >> 1) & 1, i & 1),
              corner(((i | bit) >> 2) & 1, ((i | bit) >> 1) & 1, (i | bit) & 1),
            ]);
    }

  const bonds: [Vec3, Vec3][] = [];
  let bondsSkipped = false;
  if (show.bonds) {
    if (atoms.length > MAX_BOND_ATOMS) bondsSkipped = true;
    else
      for (const [i, j] of bondPairs(
        atoms.map((a) => a.cart),
        atoms.map((a) => a.species),
      ))
        bonds.push([atoms[i]!.cart, atoms[j]!.cart]);
  }

  const polyhedra: RPolyhedron[] = [];
  if (show.polyhedra) {
    const base = coordinationPolyhedra(s, show.polyhedra);
    for (const o of cellOrigins(s.lattice, repeat))
      for (const p of base)
        polyhedra.push({
          centre: shift([p.centre[0] + o[0], p.centre[1] + o[1], p.centre[2] + o[2]]),
          vertices: p.vertices.map((v) => shift([v.cart[0] + o[0], v.cart[1] + o[1], v.cart[2] + o[2]])),
          faces: p.faces,
          edges: p.edges,
        });
  }

  const spins = spec.spins ? spinsToArrows(spec.spins, atoms, extent) : [];

  const planes: RPlane[] = (spec.planes ?? []).map((p: PlaneSpec) => ({
    hkl: p.hkl,
    polygon: planePolygon(p.hkl, s.lattice).map(shift),
  }));

  const rec = reciprocalLattice(s.lattice);
  const maxRec = Math.max(norm(rec[0]), norm(rec[1]), norm(rec[2]), 1e-9);
  const origin = shift([0, 0, 0]);
  const vectors: RVector[] = (spec.vectors ?? []).map((v: VectorSpec) => {
    const name = ['a', 'b', 'c'][v.index]!;
    const d: Vec3 =
      v.space === 'real'
        ? s.lattice[v.index]!
        : ([0, 1, 2].map((k) => (rec[v.index]![k]! * 0.7 * extent) / maxRec) as unknown as Vec3);
    return {
      from: origin,
      to: [origin[0] + d[0], origin[1] + d[1], origin[2] + d[2]],
      label: v.label ?? (v.space === 'real' ? name : `${name}*`),
    };
  });

  const labels = show.labels
    ? atoms.filter((a) => !a.image).map((a) => ({ text: a.species, at: a.cart }))
    : [];

  return {
    id: spec.id,
    structure: s,
    atoms: show.atoms ? atoms : [],
    cellEdges,
    bonds,
    polyhedra,
    spins,
    planes,
    vectors,
    labels,
    legend: [...colors].map(([symbol, color]) => ({ symbol, color })),
    camera: spec.camera ?? 'iso',
    extent,
    show,
    bondsSkipped,
  };
}
