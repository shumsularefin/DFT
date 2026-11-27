// Module 5, new topics (M16): crystal symmetry, geometry relaxation and beyond DFT. Pure generators on tested
// libraries, in the style of m02.ts. No three.js here: plain data only.
// @source S-105, S-036, S-032 (symmetry), S-164, S-068, S-041, S-019 (relaxation), S-131 (GW gaps)
import { BRAVAIS, buildBravais, type BravaisId } from '../../crystal/bravais';
import { cartToFrac, cellVolume, fracToCart, minimumImageDistance } from '../../crystal/lattice';
import {
  cellOperations,
  centringVectors,
  classify,
  distanceToElement,
  geometricRotation,
  partialOp,
  type CellOp,
  type SymElement,
} from '../../crystal/symmetryElements';
import type { Mat3, Structure } from '../../crystal/types';
import {
  MULLER_BROWN,
  newtonStationary,
  relax,
  type Optimizer,
  type RelaxResult,
} from '../../physics/relax2d';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  axesLayers,
  cellEdges,
  curve,
  fmt,
  labels,
  lines,
  points,
  quadLayer,
  speciesTones,
  surfaceLayer,
} from '../kit';
import { add, cross, dot, norm, normalize, scale, sub } from '../math';
import { elementRadius } from './bondsTwoTone';
import type { Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const rows = (m: Mat3): [Vec3, Vec3, Vec3] => [v3(m[0]), v3(m[1]), v3(m[2])];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------------------------
// 1. Crystal structure and symmetry
// ---------------------------------------------------------------------------------------------------------------

interface SymCase {
  id: string;
  label: string;
  /** What the reader is looking at, in a few words. */
  name: string;
  structure: Structure;
  /** Hermann-Mauguin symbol and number (checked against moyo in m05b.test.ts). */
  sg: string;
  sgNumber: number;
  lattice: boolean;
}

/** Space groups of the 14 Bravais lattices (their holohedries, S-105); the tests compare the numbers with moyo. */
export const BRAVAIS_GROUPS: Record<BravaisId, [string, number]> = {
  cP: ['Pm-3m', 221],
  cI: ['Im-3m', 229],
  cF: ['Fm-3m', 225],
  tP: ['P4/mmm', 123],
  tI: ['I4/mmm', 139],
  oP: ['Pmmm', 47],
  oC: ['Cmmm', 65],
  oI: ['Immm', 71],
  oF: ['Fmmm', 69],
  hP: ['P6/mmm', 191],
  hR: ['R-3m', 166],
  mP: ['P2/m', 10],
  mC: ['C2/m', 12],
  aP: ['P-1', 2],
};

const CRYSTALS: [string, string, string, string, number][] = [
  ['perovskite', 'Cubic perovskite SrTiO3', 'cubic perovskite SrTiO3', 'Pm-3m', 221],
  ['rocksalt', 'Rock salt NaCl', 'rock salt NaCl', 'Fm-3m', 225],
  ['diamond', 'Diamond-structure Si', 'diamond-structure silicon', 'Fd-3m', 227],
  ['hcp', 'Hexagonal close-packed Mg', 'hexagonal close-packed magnesium', 'P6_3/mmc', 194],
];

export const SYM_CASES: SymCase[] = [
  ...CRYSTALS.map(([id, label, name, sg, sgNumber]) => ({
    id,
    label,
    name,
    structure: lookupStructure(id)!,
    sg,
    sgNumber,
    lattice: false,
  })),
  ...BRAVAIS.map((b) => ({
    id: b.id,
    label: `Bravais lattice: ${b.label}`,
    name: `the ${b.label.replace(/\s*\(.*$/, '').toLowerCase()} Bravais lattice`,
    structure: buildBravais(b.id, b.defaults).structure!,
    sg: BRAVAIS_GROUPS[b.id][0],
    sgNumber: BRAVAIS_GROUPS[b.id][1],
    lattice: true,
  })),
];

interface Placed {
  op: CellOp;
  el: SymElement;
  /** Distance of the element from the cell centre (Angstrom). */
  d: number;
}

interface SymData {
  c: SymCase;
  ops: CellOp[];
  centring: Vec3[];
  letter: 'P' | 'I' | 'F' | 'C';
  primitive: [Vec3, Vec3, Vec3];
  centre: Vec3;
  /** Half the body diagonal of the conventional cell. */
  radius: number;
  /** The operations, each with the element it is at t in [0, 1): enough to sort them by kind and order. */
  base: { op: CellOp; el: SymElement }[];
  /** Placed elements by query (filled on first use; see `placedWhere`). */
  cache: Map<string, Placed[]>;
}

/**
 * The operations whose element passes `pred` (judged at t in [0, 1)), each combined with every whole lattice
 * translation from -1 to 1 and classified again, with its distance from the cell centre. Memoised per query, so a
 * first build only classifies the operations it needs.
 */
function placedWhere(d: SymData, key: string, pred: (el: SymElement) => boolean): Placed[] {
  const hit = d.cache.get(key);
  if (hit) return hit;
  const s = d.c.structure;
  const out: Placed[] = [];
  for (const { op, el: e0 } of d.base) {
    if (!pred(e0)) continue;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const cand: CellOp = {
            rotation: op.rotation,
            translation: [op.translation[0] + i, op.translation[1] + j, op.translation[2] + k],
          };
          const el = classify(cand, s.lattice, d.centring);
          out.push({ op: cand, el, d: distanceToElement(el, d.centre) });
        }
  }
  d.cache.set(key, out);
  return out;
}

const symMemo = new Map<string, SymData>();

/** Centring letter from the centring vectors of a conventional cell. */
function centringLetter(cv: readonly Vec3[]): SymData['letter'] {
  if (cv.length === 4) return 'F';
  if (cv.length === 2) {
    const t = cv.find((v) => norm(v) > 1e-9)!;
    return t.every((x) => Math.abs(x - 0.5) < 1e-6) ? 'I' : 'C';
  }
  return 'P';
}

/** Primitive vectors of a centred cell (S-036): body, face and base centring. */
export function primitiveVectors(L: Mat3, letter: SymData['letter']): [Vec3, Vec3, Vec3] {
  const [a, b, c] = rows(L);
  const h = (v: Vec3) => scale(v, 0.5);
  switch (letter) {
    case 'I':
      return [h(add(scale(a, -1), add(b, c))), h(add(sub(a, b), c)), h(sub(add(a, b), c))];
    case 'F':
      return [h(add(b, c)), h(add(a, c)), h(add(a, b))];
    case 'C':
      return [h(sub(a, b)), h(add(a, b)), c];
    default:
      return [a, b, c];
  }
}

export function symData(id: string): SymData {
  const hit = symMemo.get(id);
  if (hit) return hit;
  const c = SYM_CASES.find((x) => x.id === id) ?? SYM_CASES[0]!;
  const s = c.structure;
  const ops = cellOperations(s);
  const centring = centringVectors(ops).map(v3);
  const letter = centringLetter(centring);
  const L = rows(s.lattice);
  const centre = scale(add(add(L[0], L[1]), L[2]), 0.5);
  const radius = norm(centre);
  const out: SymData = {
    c,
    ops,
    centring,
    letter,
    primitive: primitiveVectors(s.lattice, letter),
    centre,
    radius,
    base: ops.map((op) => ({ op, el: classify(op, s.lattice, centring) })),
    cache: new Map(),
  };
  symMemo.set(c.id, out);
  return out;
}

/** Fractional points of a cell with the copies on the far faces, edges and corners (fractional 0 copied to 1). */
function withBoundary(fracs: readonly Vec3[], tags: readonly string[]): { f: Vec3[]; tag: string[] } {
  const f: Vec3[] = [];
  const tag: string[] = [];
  const eps = 1e-6;
  fracs.forEach((p, i) => {
    const opts = p.map((x) => (Math.abs(x) < eps ? [0, 1] : [x]));
    for (const x of opts[0]!)
      for (const y of opts[1]!)
        for (const z of opts[2]!) {
          f.push([x, y, z]);
          tag.push(tags[i]!);
        }
  });
  return { f, tag };
}

/** Atoms (Cartesian) of a cell spanned by `cell`, taken from the crystal `s`, with boundary copies. */
function atomsInCell(s: Structure, cell: [Vec3, Vec3, Vec3]): { x: Vec3[]; sp: string[]; unique: number } {
  const x: Vec3[] = [];
  const sp: string[] = [];
  let unique = 0;
  const eps = 1e-5;
  const M = cell as unknown as Mat3;
  for (let i = 0; i < s.frac.length; i++)
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          const p = v3(fracToCart([s.frac[i]![0] + a, s.frac[i]![1] + b, s.frac[i]![2] + c], s.lattice));
          const f = cartToFrac(p, M);
          if (f.some((q) => q < -eps || q > 1 + eps)) continue;
          if (x.some((q) => norm(sub(q, p)) < 1e-4)) continue;
          if (f.every((q) => q < 1 - eps)) unique++;
          x.push(p);
          sp.push(s.species[i]!);
        }
  return { x, sp, unique };
}

/** Lattice direction [uvw] of a Cartesian direction, as small integers when there are any. */
export function uvw(u: Vec3, L: Mat3): string {
  const f = v3(cartToFrac(u, L));
  const big = Math.max(...f.map(Math.abs));
  for (let m = 1; m <= 6; m++) {
    const g = f.map((x) => (x / big) * m);
    if (g.every((x) => Math.abs(x - Math.round(x)) < 1e-4))
      return `[${g.map((x) => String(Math.round(x) + 0)).join(' ')}]`;
  }
  return `(${u.map((x) => fmt(x, 2)).join(', ')})`;
}

type OpChoice = 'none' | 'main' | 'three' | 'mirror' | 'inversion' | 'screw' | 'five';

/** Pick the element the reader asked for: from the group when it has one, otherwise a test move that is not a symmetry. */
function chooseElement(
  d: SymData,
  choice: OpChoice,
): { el: SymElement | null; inGroup: boolean; note: string } {
  const z: Vec3 = [0, 0, 1];
  const L = rows(d.c.structure.lattice);
  const best = (cands: Placed[], score: (p: Placed) => number) =>
    cands.length ? cands.reduce((a, b) => (score(b) < score(a) - 1e-9 ? b : a)) : undefined;
  const turn = (p: Placed) => Math.abs(p.el.angle - (2 * Math.PI) / p.el.order) > 1e-6;
  // prefer an axis close to c, then one whose components are not negative ([1 1 1] before [1 -1 1])
  const alongZ = (p: Placed) =>
    1 - Math.abs(dot(p.el.axis, z)) + 0.01 * p.el.axis.filter((x) => x < -1e-9).length;
  const ofOrder = (n: number) =>
    placedWhere(d, `order${n}`, (e) => e.det === 1 && e.order === n && e.kind !== 'translation');
  const improper = () => placedWhere(d, 'improper', (e) => e.det === -1);
  switch (choice) {
    case 'none':
      return { el: null, inGroup: true, note: 'No operation is applied: this is the crystal as it is.' };
    case 'main': {
      // the highest order that has a pure rotation (diamond's four-fold axes are all screws, so it shows a three-fold)
      for (const n of [6, 4, 3, 2]) {
        const pick = best(
          ofOrder(n).filter((p) => p.el.kind === 'rotation' && !turn(p)),
          (p) => p.d + 10 * alongZ(p),
        );
        if (pick) return { el: pick.el, inGroup: true, note: '' };
      }
      return {
        el: geometricRotation(L[2], d.centre, Math.PI),
        inGroup: false,
        note: 'This lattice has no rotation axis, so a two-fold turn about c is tried instead.',
      };
    }
    case 'three': {
      const pick = best(
        ofOrder(3).filter((p) => p.el.kind === 'rotation' && !turn(p)),
        (p) => p.d + alongZ(p) * 0.01,
      );
      if (pick) return { el: pick.el, inGroup: true, note: '' };
      return {
        el: geometricRotation(add(add(L[0], L[1]), L[2]), d.centre, (2 * Math.PI) / 3),
        inGroup: false,
        note: 'There is no three-fold axis here, so a 120 degree turn about the cell diagonal a + b + c is tried.',
      };
    }
    case 'mirror': {
      const pick = best(
        improper().filter((p) => p.el.kind === 'mirror'),
        (p) => p.d + 10 * alongZ(p),
      );
      if (pick) return { el: pick.el, inGroup: true, note: '' };
      return {
        el: geometricRotation(L[2], d.centre, Math.PI, true),
        inGroup: false,
        note: 'There is no mirror plane here, so a mirror normal to c through the cell centre is tried.',
      };
    }
    case 'inversion': {
      const pick = best(
        improper().filter((p) => p.el.kind === 'inversion'),
        (p) => p.d,
      );
      if (pick) return { el: pick.el, inGroup: true, note: '' };
      return {
        el: geometricRotation(z, d.centre, 0, true),
        inGroup: false,
        note: 'There is no inversion centre here, so inversion through the cell centre is tried.',
      };
    }
    case 'screw': {
      let pick: Placed | undefined;
      for (const n of [6, 4, 3, 2]) {
        pick ??= best(
          ofOrder(n).filter((p) => p.el.kind === 'screw' && !turn(p)),
          (p) => p.d + 10 * alongZ(p),
        );
      }
      pick ??= best(
        improper().filter((p) => p.el.kind === 'glide'),
        (p) => p.d + 10 * alongZ(p),
      );
      if (pick) return { el: pick.el, inGroup: true, note: '' };
      return {
        el: null,
        inGroup: true,
        note: `${d.c.sg} has no screw axis and no glide plane near this cell: every operation is a rotation, a mirror or an inversion.`,
      };
    }
    case 'five':
      return {
        el: geometricRotation(L[2], d.centre, (2 * Math.PI) / 5),
        inGroup: false,
        note: 'A five-fold turn is never a symmetry of a lattice: 2 cos 72 degrees is not a whole number.',
      };
  }
}

/** Plain name of an element for the description and the label. */
export function elementName(el: SymElement): string {
  switch (el.kind) {
    case 'rotation':
      return `${el.order}-fold rotation axis`;
    case 'screw':
      return `${el.symbol} screw axis`;
    case 'mirror':
      return 'mirror plane';
    case 'glide':
      return 'glide plane';
    case 'inversion':
      return 'inversion centre';
    case 'rotoinversion':
      return `${el.symbol} rotoinversion axis`;
    default:
      return 'identity';
  }
}

/** The layers that draw one symmetry element across the cell. */
function elementLayers(
  el: SymElement,
  centre: Vec3,
  R: number,
  group: string,
  color: Color,
  label: boolean,
): Layer[] {
  const out: Layer[] = [];
  const name = elementName(el);
  const p = v3(el.point);
  const u = v3(el.axis);
  if (el.kind === 'rotation' || el.kind === 'screw' || el.kind === 'rotoinversion') {
    const q = add(p, scale(u, dot(sub(centre, p), u)));
    const a = add(q, scale(u, -1.15 * R));
    const b = add(q, scale(u, 1.15 * R));
    out.push(
      lines([[a, b]], color, group, {
        name: 'Symmetry element',
        tube: el.order === 2 ? undefined : 0.045,
        dashed: el.order === 2,
      }),
    );
    if (el.kind === 'screw') out.push(arrows([a], [v3(el.intrinsic)], color, group, { thickness: 0.06 }));
    if (el.kind === 'rotoinversion') out.push(atoms([p], 0.12, 'ink', group));
    if (label) out.push(labels([{ text: name, at: add(b, scale(u, 0.15 * R)) }], group));
  } else if (el.kind === 'mirror' || el.kind === 'glide') {
    const q = sub(centre, scale(u, dot(sub(centre, p), u)));
    const e1 = normalize(Math.abs(u[2]) < 0.9 ? cross(u, [0, 0, 1]) : cross(u, [1, 0, 0]));
    const e2 = cross(u, e1);
    out.push(
      quadLayer(sub(sub(q, scale(e1, R)), scale(e2, R)), scale(e1, 2 * R), scale(e2, 2 * R), {
        group,
        name: 'Symmetry element',
        color,
        opacity: 0.22,
      }),
    );
    out.push(lines(cellEdgesOfQuad(q, e1, e2, R), color, group, { dashed: el.kind === 'glide' }));
    if (el.kind === 'glide') out.push(arrows([q], [v3(el.intrinsic)], color, group, { thickness: 0.06 }));
    if (label) out.push(labels([{ text: name, at: add(add(q, scale(e1, R)), scale(e2, R)) }], group));
  } else if (el.kind === 'inversion') {
    out.push(atoms([p], 0.16, 'ink', group, { name: 'Symmetry element', labels: [name] }));
    if (label) out.push(labels([{ text: name, at: add(p, [0, 0, 0.35]) }], group));
  }
  return out;
}

const cellEdgesOfQuad = (q: Vec3, e1: Vec3, e2: Vec3, R: number): [Vec3, Vec3][] => {
  const c = [
    add(add(q, scale(e1, -R)), scale(e2, -R)),
    add(add(q, scale(e1, R)), scale(e2, -R)),
    add(add(q, scale(e1, R)), scale(e2, R)),
    add(add(q, scale(e1, -R)), scale(e2, R)),
  ];
  return [0, 1, 2, 3].map((i) => [c[i]!, c[(i + 1) % 4]!] as [Vec3, Vec3]);
};

/** Distinct rotation axes, mirror planes and the inversion centre that pass close to the cell centre. */
function nearbyElements(d: SymData): SymElement[] {
  const all = [
    ...[2, 3, 4, 6].flatMap((n) =>
      placedWhere(d, `order${n}`, (e) => e.det === 1 && e.order === n && e.kind !== 'translation'),
    ),
    ...placedWhere(d, 'improper', (e) => e.det === -1),
  ];
  const near = all.filter(
    (p) =>
      p.d < 0.35 * d.radius &&
      ((p.el.kind === 'rotation' && p.el.order >= 2) || p.el.kind === 'mirror' || p.el.kind === 'inversion'),
  );
  const seen = new Set<string>();
  const out: SymElement[] = [];
  const key = (el: SymElement) => {
    const u = el.axis;
    const s = u.find((x) => Math.abs(x) > 1e-6)! < 0 ? -1 : 1;
    const foot =
      el.kind === 'mirror'
        ? scale(u, dot(el.point, u))
        : el.kind === 'inversion'
          ? el.point
          : sub(el.point, scale(u, dot(el.point, u)));
    return [el.kind, el.order, ...u.map((x) => (s * x).toFixed(3)), ...foot.map((x) => x.toFixed(2))].join(
      '|',
    );
  };
  for (const p of near.sort((a, b) => b.el.order - a.el.order || a.d - b.d)) {
    const k = key(p.el);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.el);
  }
  const axes = out.filter((e) => e.kind === 'rotation').slice(0, 13);
  const mirrors = out.filter((e) => e.kind === 'mirror').slice(0, 9);
  const inv = out.filter((e) => e.kind === 'inversion').slice(0, 1);
  return [...axes, ...mirrors, ...inv];
}

/** Merge the line, mesh and atom layers of one tone into one layer of each kind (fewer draw calls). */
function mergeLayers(ls: Layer[], tone: Color): Layer[] {
  const out: Layer[] = [];
  const segs = (dashed: boolean, tube: boolean) =>
    ls.flatMap((l) => (l.kind === 'lines' && !!l.dashed === dashed && !!l.tube === tube ? l.segments : []));
  for (const dashed of [false, true])
    for (const tube of [false, true]) {
      const sg = segs(dashed, tube);
      if (sg.length)
        out.push(
          lines(sg, tone, 'elements', {
            name: 'All symmetry elements',
            dashed,
            ...(tube ? { tube: 0.03 } : {}),
          }),
        );
    }
  const meshes = ls.filter((l): l is MeshLayer => l.kind === 'mesh');
  if (meshes.length) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const m of meshes) {
      const off = positions.length / 3;
      positions.push(...m.positions);
      indices.push(...(m.indices ?? []).map((i) => i + off));
    }
    out.push({ kind: 'mesh', group: 'elements', positions, indices, color: tone, opacity: 0.08 });
  }
  const dots = ls.flatMap((l) => (l.kind === 'atoms' ? l.positions : []));
  if (dots.length) out.push(atoms(dots, 0.12, tone, 'elements'));
  const arrowLs = ls.filter((l) => l.kind === 'arrows');
  out.push(...arrowLs);
  return out;
}

const ORDER_TONE: Record<number, Color> = { 2: 'c1', 3: 'c2', 4: 'c3', 6: 'c4' };

const symmetry: SceneDef = {
  id: 'm05b-symmetry',
  title: 'Crystal symmetry in 3D',
  badge: 'computed',
  sources: ['S-105', 'S-036', 'S-032'],
  params: [
    {
      kind: 'select',
      id: 'structure',
      label: 'Crystal or lattice',
      physics: true,
      value: 'perovskite',
      options: SYM_CASES.map((c) => ({ value: c.id, label: c.label })),
    },
    {
      kind: 'select',
      id: 'op',
      label: 'Operation',
      physics: true,
      value: 'main',
      options: [
        { value: 'none', label: 'None (the crystal as it is)' },
        { value: 'main', label: 'Highest rotation axis' },
        { value: 'three', label: 'Three-fold axis' },
        { value: 'mirror', label: 'Mirror plane' },
        { value: 'inversion', label: 'Inversion centre' },
        { value: 'screw', label: 'Screw axis or glide plane' },
        { value: 'five', label: 'Five-fold turn (test)' },
      ],
    },
    {
      kind: 'step',
      id: 'apply',
      label: 'Apply the operation',
      min: 0,
      max: 12,
      value: 0,
      interval: 0.25,
      physics: true,
    },
    {
      kind: 'select',
      id: 'cell',
      label: 'Cell',
      physics: true,
      value: 'conventional',
      options: [
        { value: 'conventional', label: 'Conventional cell' },
        { value: 'primitive', label: 'Primitive cell' },
      ],
    },
    { kind: 'toggle', id: 'elements', label: 'All symmetry elements near the centre', value: false },
  ],
  build(p) {
    const d = symData(String(p.structure));
    const s = d.c.structure;
    const conv = rows(s.lattice);
    const prim = p.cell === 'primitive';
    const cell = prim ? d.primitive : conv;
    const frac = Number(p.apply) / 12;
    const { el, inGroup, note } = chooseElement(d, String(p.op) as OpChoice);
    const drawn = atomsInCell(s, cell);
    const conventionalCount = s.frac.length;
    const primitiveCount = Math.round(conventionalCount / d.centring.length);
    const tones = speciesTones(s.species);
    const rad = (e: string) => (d.c.lattice ? 0.22 : elementRadius(e));
    const col = (e: string): Color => (d.c.lattice ? 'muted' : tones.get(e)!);
    const layers: Layer[] = [];
    layers.push(lines(cellEdges(conv), 'muted', 'cell', { name: 'Conventional cell', dashed: prim }));
    if (prim)
      layers.push(lines(cellEdges(cell), 'ink', 'primitive', { name: 'Primitive cell', tube: 0.025 }));
    // lattice points of the conventional cell (centring included), as small dots
    if (!d.c.lattice) {
      const lp = withBoundary(
        d.centring,
        d.centring.map(() => 'L'),
      ).f.map((f) => v3(fracToCart(f, s.lattice)));
      layers.push(points(lp, 'ink', 0.09, 'lattice', { name: 'Lattice points' }));
    }
    const moved = drawn.x.map((x) => (el ? v3(partialOp(el, x, frac)) : x));
    layers.push(
      atoms(moved, drawn.sp.map(rad), drawn.sp.map(col), 'atoms', {
        name: d.c.lattice ? 'Lattice points' : 'Atoms',
        labels: drawn.sp.map((e, i) => (d.c.lattice ? `lattice point ${i + 1}` : `${e} ${i + 1}`)),
      }),
    );
    if (el && frac > 0)
      layers.push(
        atoms(drawn.x, drawn.sp.map(rad), drawn.sp.map(col), 'ghost', {
          name: 'Starting positions',
          opacity: 0.22,
        }),
      );
    if (el) {
      const segs: [Vec3, Vec3][] = [];
      for (const x of drawn.x) {
        let prev = x;
        for (let k = 1; k <= 16; k++) {
          const q = v3(partialOp(el, x, k / 16));
          if (norm(sub(q, prev)) > 1e-6) segs.push([prev, q]);
          prev = q;
        }
      }
      if (segs.length) layers.push(lines(segs, 'muted', 'paths', { name: 'Paths of the atoms' }));
    }
    if (el)
      layers.push(...elementLayers(el, d.centre, d.radius, 'element', inGroup ? 'accent' : 'neg', true));
    let shown: SymElement[] = [];
    if (p.elements) {
      shown = nearbyElements(d);
      // one layer per tone: axes by order (two-fold dashed), mirror planes as one faint mesh, the centre as a dot
      const byTone = new Map<Color, Layer[]>();
      const marks: { text: string; at: Vec3 }[] = [];
      for (const e of shown) {
        const tone: Color =
          e.kind === 'rotation' ? (ORDER_TONE[e.order] ?? 'c5') : e.kind === 'mirror' ? 'c6' : 'ink';
        const ls = elementLayers(e, d.centre, d.radius * 0.8, 'elements', tone, false);
        byTone.set(tone, [...(byTone.get(tone) ?? []), ...ls]);
        if (e.kind === 'rotation' && !marks.some((m) => m.text === `${e.order}-fold`))
          marks.push({ text: `${e.order}-fold`, at: add(v3(e.point), scale(v3(e.axis), 0.95 * d.radius)) });
      }
      for (const [tone, ls] of byTone) layers.push(...mergeLayers(ls, tone));
      if (marks.length) layers.push(labels(marks, 'elements'));
    }
    // how far the images land from the nearest atom of the same element, at the end of the operation
    let miss = 0;
    if (el)
      for (let i = 0; i < s.frac.length; i++) {
        const img = cartToFrac(v3(partialOp(el, v3(fracToCart(s.frac[i]!, s.lattice)), 1)), s.lattice);
        let bestD = Infinity;
        for (let j = 0; j < s.frac.length; j++)
          if (s.species[j] === s.species[i])
            bestD = Math.min(bestD, minimumImageDistance(img, s.frac[j]!, s.lattice));
        miss = Math.max(miss, bestD);
      }
    const maps = miss < 1e-3;
    const what = d.c.lattice ? 'lattice points' : 'atoms';
    const elText = el
      ? `${inGroup ? 'The' : 'A test'} ${elementName(el)}${el.kind === 'inversion' ? ` at (${el.point.map((x) => fmt(x, 2)).join(', ')}) Angstrom` : el.kind === 'mirror' || el.kind === 'glide' ? ` normal to ${uvw(v3(el.axis), s.lattice)}` : ` along ${uvw(v3(el.axis), s.lattice)}`} is drawn, and the ${what} have been taken ${fmt(frac * 100, 0)} percent of the way through it. `
      : '';
    const endText = el
      ? maps
        ? `At the end every ${d.c.lattice ? 'lattice point' : 'atom'} lands on an equivalent one, so this is a symmetry operation.`
        : `At the end the ${what} miss by up to ${fmt(miss, 2)} Angstrom, so this is not a symmetry of ${d.c.name}.`
      : '';
    const describe =
      `${d.c.name[0]!.toUpperCase()}${d.c.name.slice(1)}, space group ${d.c.sg} (number ${d.c.sgNumber}), shown in its ${prim ? 'primitive' : 'conventional'} cell ` +
      `with ${plural(drawn.unique, d.c.lattice ? 'lattice point' : 'atom')} (${conventionalCount} per conventional cell, ${primitiveCount} per primitive cell). ` +
      elText +
      endText +
      (note && (!el || !inGroup) ? ` ${note}` : '') +
      (shown.length
        ? ` ${plural(shown.length, 'symmetry element')} near the cell centre are also drawn.`
        : '');
    const volume = cellVolume(cell as unknown as Mat3);
    return {
      layers,
      describe,
      lattice: cell,
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Space group', value: `${d.c.sg} (${d.c.sgNumber})` },
        { label: 'Operations in this cell', value: String(d.ops.length) },
        {
          label: 'Per conventional / primitive cell',
          value: `${conventionalCount} / ${primitiveCount} ${what}`,
        },
        {
          label: el ? elementName(el) : 'Operation',
          value: el
            ? maps
              ? 'maps the crystal onto itself'
              : `misses by ${fmt(miss, 2)} A`
            : `cell volume ${fmt(volume, 1)} A^3`,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// 2. Geometry relaxation: a ball on an energy landscape, and the ISIF degrees of freedom on a real cell
// ---------------------------------------------------------------------------------------------------------------

/** Scene coordinates of the Muller-Brown model: about 10 units across, energy clipped at the top for the drawing. */
const MB_SCALE = 3.5;
const toX = (x: number) => MB_SCALE * (x + 0.2);
const toY = (y: number) => MB_SCALE * (y - 0.8);
const E_TOP = 60;
const toZ = (e: number) => Math.min(e, E_TOP) / 25;
const MB_X: [number, number] = [-1.6, 1.2];
const MB_Y: [number, number] = [-0.4, 2.0];

export const RELAX_STARTS: Record<string, { label: string; at: [number, number] }> = {
  upper: { label: 'Upper slope, above the deepest valley', at: [-0.2, 1.8] },
  middle: { label: 'Middle slope, above a shallow valley', at: [0.5, 1.3] },
  right: { label: 'Right shoulder, far from any valley', at: [0.9, 0.9] },
  saddle: { label: 'Next to a saddle point', at: [-0.75, 0.55] },
};

/** Base step of the model (POTIM = 1); the slider scales it. Chosen so that steepest descent is stable but slow at 1. */
export const RELAX_BASE_STEP = 5e-4;
/** Stop when the force drops below this (model units), the role of a negative EDIFFG. */
export const RELAX_FORCE_TOL = 1;
export const RELAX_NSW = 60;

const OPTIMIZERS: { value: Optimizer; label: string; vasp: string }[] = [
  {
    value: 'cg',
    label: 'IBRION = 2: conjugate gradients',
    vasp: 'conjugate gradients (the IBRION = 2 idea)',
  },
  {
    value: 'bfgs',
    label: 'IBRION = 1: quasi-Newton',
    vasp: 'quasi-Newton steps (the idea behind IBRION = 1)',
  },
  { value: 'damped', label: 'IBRION = 3: damped dynamics', vasp: 'damped dynamics (the IBRION = 3 idea)' },
  { value: 'sd', label: 'Steepest descent (not a VASP choice)', vasp: 'plain steepest descent' },
];

const relaxMemo = new Map<string, RelaxResult>();
export function relaxRun(method: Optimizer, potim: number, start: string): RelaxResult {
  const key = `${method}|${potim}|${start}`;
  let r = relaxMemo.get(key);
  if (!r) {
    r = relax(MULLER_BROWN, (RELAX_STARTS[start] ?? RELAX_STARTS.upper!).at, method, {
      step: RELAX_BASE_STEP * potim,
      maxSteps: RELAX_NSW,
      forceTol: RELAX_FORCE_TOL,
      maxMove: 0.25,
    });
    relaxMemo.set(key, r);
  }
  return r;
}

/** The three valleys and two saddles of the model, located by Newton's method from the published positions (S-164). */
export const MB_POINTS = (
  [
    ['deepest valley', [-0.558, 1.442]],
    ['shallowest valley', [-0.05, 0.467]],
    ['second valley', [0.623, 0.028]],
    ['saddle', [-0.822, 0.624]],
    ['saddle', [0.212, 0.293]],
  ] as [string, [number, number]][]
).map(([name, guess]) => {
  const [x, y] = newtonStationary(MULLER_BROWN, guess);
  return { name, x, y, e: MULLER_BROWN.energy(x, y) };
});

let mbSurface: Layer | undefined;
function mbSurfaceLayer(): Layer {
  mbSurface ??= surfaceLayer(
    (X, Y) => MULLER_BROWN.energy(X / MB_SCALE - 0.2, Y / MB_SCALE + 0.8),
    [toX(MB_X[0]), toX(MB_X[1])],
    [toY(MB_Y[0]), toY(MB_Y[1])],
    84,
    72,
    { group: 'surface', name: 'Energy surface', colormap: 'sequential', zScale: 1 / 25, opacity: 0.92 },
  );
  // clip the drawn height (the values keep the true energy for the colours up to the clip)
  const m = mbSurface as MeshLayer;
  for (let i = 2; i < m.positions.length; i += 3) m.positions[i] = Math.min(m.positions[i]!, E_TOP / 25);
  if (m.values) m.values = m.values.map((v) => Math.min(v, E_TOP));
  return mbSurface;
}

/** ISIF: what may change (S-019 page ISIF; 2, 3 and 4 also in src/data/tag-visuals.json, checked in the tests). */
export const ISIF_DOF: Record<string, { ions: boolean; shape: boolean; volume: boolean }> = {
  '2': { ions: true, shape: false, volume: false },
  '3': { ions: true, shape: true, volume: true },
  '4': { ions: true, shape: true, volume: false },
  '5': { ions: false, shape: true, volume: false },
  '6': { ions: false, shape: true, volume: true },
  '7': { ions: false, shape: false, volume: true },
};

/** The starting distortion of the toy cell and how fast an allowed coordinate eases toward its relaxed value per step. */
export const CELL_START = { vol: 1.03 ** 3, ca: 1.06, tilt: 5, off: 0.25 };
export const CELL_EASE = 0.8;

interface CellState {
  vol: number;
  ca: number;
  tilt: number;
  off: number;
}

/** The toy cell after n steps: each allowed coordinate eases geometrically toward the cube; held ones stay put. */
export function cellAfter(isif: string, n: number): CellState {
  const dof = ISIF_DOF[isif] ?? ISIF_DOF['3']!;
  const f = CELL_EASE ** n;
  const ease = (x0: number, x1: number, on: boolean) => (on ? x1 + (x0 - x1) * f : x0);
  return {
    vol: ease(CELL_START.vol, dof.volume ? 1 : CELL_START.vol, dof.volume),
    ca: ease(CELL_START.ca, 1, dof.shape),
    tilt: ease(CELL_START.tilt, 0, dof.shape),
    off: ease(CELL_START.off, 0, dof.ions),
  };
}

/** Lattice rows of a toy cell state built on the cubic cell of edge a0: volume, c/a and a tilt of c toward a. */
export function cellLattice(a0: number, st: CellState): [Vec3, Vec3, Vec3] {
  const e = a0 * Math.cbrt(st.vol);
  const a = e * st.ca ** (-1 / 3);
  const c = e * st.ca ** (2 / 3);
  return [
    [a, 0, 0],
    [0, a, 0],
    [c * Math.tan((st.tilt * Math.PI) / 180), 0, c],
  ];
}

function relaxLandscape(p: Record<string, unknown>) {
  const method = (String(p.ibrion) as Optimizer) ?? 'cg';
  const potim = Number(p.potim);
  const run = relaxRun(method, potim, String(p.start));
  const steps = run.steps;
  const n = Math.min(Number(p.step), steps.length - 1);
  const cur = steps[n]!;
  const lift = 0.12;
  const at = (q: { x: number; y: number; e: number }): Vec3 => [toX(q.x), toY(q.y), toZ(q.e) + lift];
  const layers: Layer[] = [mbSurfaceLayer()];
  const path = steps.slice(0, n + 1).map(at);
  if (path.length >= 2) layers.push(curve(path, 'accent', 'path', { name: 'Path of the ball', tube: 0.05 }));
  const trials = steps.slice(1, n + 1).filter((s) => s.kind === 'trial');
  if (trials.length)
    layers.push(
      points(trials.map(at), 'c1', 0.1, 'path', {
        name: 'Trial steps',
        labels: trials.map(() => 'trial step'),
      }),
    );
  layers.push(
    atoms([at(cur)], 0.28, 'pos', 'ball', {
      name: 'Ball (the atomic coordinates)',
      labels: ['current geometry'],
    }),
  );
  const fmag = Math.hypot(cur.fx, cur.fy);
  if (fmag > 1e-9) {
    const len = Math.min(2.2, 0.35 + fmag / 120);
    layers.push(
      arrows([at(cur)], [[(cur.fx / fmag) * len, (cur.fy / fmag) * len, 0]], 'neg', 'force', {
        name: 'Force (downhill)',
        thickness: 0.05,
      }),
    );
  }
  const st0 = steps[0]!;
  const mins = MB_POINTS.filter((q) => q.name !== 'saddle');
  layers.push(
    labels(
      [
        ...mins.map((q) => ({
          text: `${q.name} ${fmt(q.e, 1)}`,
          at: [toX(q.x), toY(q.y), toZ(q.e) + 0.9] as Vec3,
        })),
        { text: 'saddle', at: [toX(MB_POINTS[3]!.x), toY(MB_POINTS[3]!.y), toZ(MB_POINTS[3]!.e) + 0.9] },
        { text: 'start', at: [toX(st0.x), toY(st0.y), toZ(st0.e) + 0.9] },
      ],
      'labels',
    ),
  );
  layers.push(
    ...axesLayers([2, 2, 2], ['x', 'y', 'energy'], [toX(MB_X[0]) - 0.6, toY(MB_Y[0]) - 0.6, toZ(-150)]),
  );
  const last = steps.length - 1;
  const opt = OPTIMIZERS.find((o) => o.value === method) ?? OPTIMIZERS[0]!;
  const nearest = mins.reduce((a, b) =>
    Math.hypot(b.x - cur.x, b.y - cur.y) < Math.hypot(a.x - cur.x, a.y - cur.y) ? b : a,
  );
  const status =
    n < last
      ? 'still moving'
      : run.converged
        ? `converged after ${last} steps`
        : `stopped at the step limit (${RELAX_NSW}) without converging`;
  const end = steps[last]!;
  const endMin = mins.reduce((a, b) =>
    Math.hypot(b.x - end.x, b.y - end.y) < Math.hypot(a.x - end.x, a.y - end.y) ? b : a,
  );
  const describe =
    `A ball on the Muller-Brown model energy surface stands for the atomic coordinates; it moves by ${opt.vasp} with a step scale of ${fmt(potim, 1)}. ` +
    `Step ${n} of ${last}: energy ${fmt(cur.e, 1)} model units, force ${fmt(fmag, 1)}, nearest valley the ${nearest.name}. ` +
    (run.converged
      ? `The run converges after ${last} steps in the ${endMin.name} at ${fmt(endMin.e, 1)}${endMin === mins[0] ? ', the lowest of the three' : `, not in the deepest valley at ${fmt(mins[0]!.e, 1)}`}.`
      : `The run does not converge within ${RELAX_NSW} steps.`);
  return {
    layers,
    describe,
    camera: 'iso' as const,
    axes: ['x (model)', 'y (model)', 'energy (model units / 25)'] as [string, string, string],
    readouts: [
      { label: 'Step', value: `${n} of ${last}` },
      { label: 'Energy', value: `${fmt(cur.e, 1)} model units` },
      { label: 'Force', value: `${fmt(fmag, 1)} (stop below ${RELAX_FORCE_TOL})` },
      { label: 'Status', value: status },
    ],
  };
}

function relaxCell(p: Record<string, unknown>) {
  const isif = String(p.isif);
  const dof = ISIF_DOF[isif] ?? ISIF_DOF['3']!;
  const n = Number(p.step);
  const s = lookupStructure('perovskite')!;
  const a0 = s.lattice[0][0];
  const st = cellAfter(isif, n);
  const L = cellLattice(a0, st);
  const target = cellAfter(isif, 400);
  const LT = cellLattice(a0, target);
  const tones = speciesTones(s.species);
  const pos = s.frac.map((f, i) => {
    const x = v3(fracToCart(f, L as unknown as Mat3));
    return s.species[i] === 'Ti' ? add(x, [0, 0, st.off]) : x;
  });
  const layers: Layer[] = [
    lines(cellEdges(L), 'ink', 'cell', { name: 'Cell now', tube: 0.025 }),
    lines(cellEdges(LT), 'muted', 'target', { name: 'Where this ISIF can take the cell', dashed: true }),
    atoms(
      pos,
      s.species.map((e) => elementRadius(e)),
      s.species.map((e) => tones.get(e)!),
      'atoms',
      { name: 'Atoms', labels: s.species.map((e, i) => `${e} ${i + 1}`) },
    ),
  ];
  const head = (on: boolean) => (on ? 'solid' : 'open');
  const tone = (on: boolean): Color => (on ? 'pos' : 'muted');
  // the ion: Ti pushed back to the centre of the octahedron
  const ti = s.species.indexOf('Ti');
  if (st.off > 0.005)
    layers.push(
      arrows([pos[ti]!], [[0, 0, -3 * st.off]], tone(dof.ions), 'ions', {
        name: 'Force on the ion',
        head: head(dof.ions),
        thickness: 0.06,
      }),
    );
  // volume: arrows on the face centres toward the relaxed size
  const [a, b, c] = L;
  const centre = scale(add(add(a, b), c), 0.5);
  const dv = Math.cbrt(st.vol) - 1;
  if (Math.abs(dv) > 0.002) {
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    for (const [u, w] of [
      [b, c],
      [a, c],
      [a, b],
    ] as [Vec3, Vec3][]) {
      const nrm = normalize(cross(u, w));
      const off = scale(nrm, Math.abs(dot(sub(centre, [0, 0, 0]), nrm)));
      for (const sgn of [1, -1]) {
        from.push(add(centre, scale(off, sgn)));
        vec.push(scale(nrm, -sgn * Math.sign(dv) * Math.min(1.2, 12 * Math.abs(dv))));
      }
    }
    layers.push(
      arrows(from, vec, tone(dof.volume), 'volume', {
        name: 'Volume stress',
        head: head(dof.volume),
        thickness: 0.05,
      }),
    );
  }
  // shape: the top corners toward the cube of the same volume
  const cube = cellLattice(a0, { ...st, ca: 1, tilt: 0 });
  const tops: [Vec3, Vec3][] = (
    [
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [a, cube[0]! as Vec3],
      [b, cube[1]! as Vec3],
      [add(a, b), add(cube[0]! as Vec3, cube[1]! as Vec3)],
    ] as [Vec3, Vec3][]
  ).map(([x, y]) => [add(x, c), add(y, cube[2]! as Vec3)] as [Vec3, Vec3]);
  const shapeVec = tops.map(([x, y]) => sub(y, x));
  if (Math.max(...shapeVec.map(norm)) > 0.01)
    layers.push(
      arrows(
        tops.map(([x]) => x),
        shapeVec.map((v) => scale(v, 2)),
        tone(dof.shape),
        'shape',
        { name: 'Shape stress', head: head(dof.shape), thickness: 0.05 },
      ),
    );
  layers.push(
    labels(
      [
        { text: `ISIF = ${isif}`, at: add(c, [0, 0, 0.8]) },
        { text: dof.ions ? 'ion moves' : 'ion held', at: add(pos[ti]!, [0.9, 0, 0]) },
      ],
      'labels',
    ),
  );
  const yes = (on: boolean) => (on ? 'yes' : 'no');
  const moves = [
    dof.ions && 'the ions',
    dof.shape && 'the cell shape',
    dof.volume && 'the cell volume',
  ].filter(Boolean) as string[];
  const held = [
    !dof.ions && 'the ions',
    !dof.shape && 'the cell shape',
    !dof.volume && 'the cell volume',
  ].filter(Boolean) as string[];
  const describe =
    `A strained cubic perovskite cell (SrTiO3) after ${n} relaxation steps with ISIF = ${isif}: ${moves.join(', ')} may change; ${held.length ? `${held.join(' and ')} stay fixed` : 'nothing is held fixed'}. ` +
    `Ti is ${fmt(st.off, 3)} Angstrom off centre, the volume is ${fmt((st.vol - 1) * 100, 1)} percent above the relaxed cube, c/a is ${fmt(st.ca, 3)} and c is tilted ${fmt(st.tilt, 1)} degrees. ` +
    `Solid arrows are stresses and forces this ISIF lets the run remove; open arrows are ones it leaves in place.`;
  return {
    layers,
    describe,
    lattice: L,
    ortho: true,
    camera: 'iso' as const,
    readouts: [
      {
        label: 'ISIF moves',
        value: `ions ${yes(dof.ions)}, shape ${yes(dof.shape)}, volume ${yes(dof.volume)}`,
      },
      { label: 'Ti off centre', value: `${fmt(st.off, 3)} A` },
      { label: 'Volume vs relaxed', value: `${fmt((st.vol - 1) * 100, 1)} %` },
      { label: 'c/a, tilt', value: `${fmt(st.ca, 3)}, ${fmt(st.tilt, 1)} degrees` },
    ],
  };
}

const relaxation: SceneDef = {
  id: 'm05b-relaxation',
  title: 'Geometry relaxation in 3D',
  badge: 'toy-model',
  sources: ['S-164', 'S-068', 'S-041', 'S-019'],
  banner:
    'Toy model. The landscape is the Muller-Brown model surface, not a DFT energy, and the optimisers are simplified versions of the VASP ones. The cell view eases a strained cell toward the cube along the motions ISIF allows; it computes no forces or stress.',
  params: [
    {
      kind: 'select',
      id: 'view',
      label: 'View',
      physics: true,
      value: 'landscape',
      options: [
        { value: 'landscape', label: 'Ball on an energy landscape' },
        { value: 'cell', label: 'ISIF on a real cell' },
      ],
    },
    {
      kind: 'select',
      id: 'ibrion',
      label: 'Optimiser (IBRION)',
      physics: true,
      value: 'cg',
      options: OPTIMIZERS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      kind: 'slider',
      id: 'potim',
      label: 'Step scale (POTIM)',
      min: 0.2,
      max: 2,
      step: 0.1,
      value: 1,
      digits: 1,
      physics: true,
    },
    {
      kind: 'select',
      id: 'start',
      label: 'Starting geometry',
      physics: true,
      value: 'upper',
      options: Object.entries(RELAX_STARTS).map(([value, v]) => ({ value, label: v.label })),
    },
    {
      kind: 'select',
      id: 'isif',
      label: 'ISIF (cell view)',
      physics: true,
      value: '3',
      options: Object.keys(ISIF_DOF).map((k) => ({ value: k, label: `ISIF = ${k}` })),
    },
    {
      kind: 'step',
      id: 'step',
      label: 'Ionic step',
      min: 0,
      max: RELAX_NSW,
      value: 0,
      interval: 0.35,
      physics: true,
    },
  ],
  build(p) {
    return p.view === 'cell' ? relaxCell(p) : relaxLandscape(p);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// 3. Beyond DFT: the rungs PBE, G0W0 and GW0 against the measured gap
// ---------------------------------------------------------------------------------------------------------------

/**
 * Band gaps in eV: PBE, G0W0 and GW0 (all in VASP, PAW) and experiment, as tabulated by Shishkin and Kresse,
 * Phys. Rev. B 75, 235102 (2007), Table I (S-131), checked against the table on 2026-11-27 (columns PBE, G0W0, GW0, Expt.).
 */
export const GW_GAPS: { id: string; pbe: number; g0w0: number; gw0: number; exp: number }[] = [
  { id: 'Si', pbe: 0.62, g0w0: 1.12, gw0: 1.2, exp: 1.17 },
  { id: 'GaAs', pbe: 0.49, g0w0: 1.3, gw0: 1.42, exp: 1.52 },
  { id: 'ZnO', pbe: 0.67, g0w0: 2.12, gw0: 2.54, exp: 3.44 },
  { id: 'C', pbe: 4.12, g0w0: 5.5, gw0: 5.68, exp: 5.48 },
  { id: 'MgO', pbe: 4.76, g0w0: 7.25, gw0: 7.72, exp: 7.83 },
  { id: 'Ar', pbe: 8.69, g0w0: 13.28, gw0: 13.87, exp: 14.2 },
  { id: 'LiF', pbe: 9.2, g0w0: 13.27, gw0: 13.96, exp: 14.2 },
];
const RUNGS = [
  { key: 'pbe', label: 'PBE', tone: 'c0' },
  { key: 'g0w0', label: 'G0W0', tone: 'c1' },
  { key: 'gw0', label: 'GW0', tone: 'c2' },
] as const;
type Rung = (typeof RUNGS)[number]['key'];

/** Mean absolute error (eV) and mean relative error (percent, signed) of one rung over the materials. */
export function rungErrors(rung: Rung): { mae: number; mre: number } {
  const errs = GW_GAPS.map((g) => g[rung] - g.exp);
  const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length;
  const mre = (100 * GW_GAPS.reduce((a, g) => a + (g[rung] - g.exp) / g.exp, 0)) / GW_GAPS.length;
  return { mae, mre };
}

/** A box from (x0, y0, z0) to (x1, y1, z1) as 12 triangles, appended to positions and indices. */
function pushBox(pos: number[], idx: number[], lo: Vec3, hi: Vec3): void {
  const o = pos.length / 3;
  for (const z of [lo[2], hi[2]])
    for (const y of [lo[1], hi[1]]) for (const x of [lo[0], hi[0]]) pos.push(x, y, z);
  const f = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  for (const [a, b, c, d] of f) idx.push(o + a!, o + b!, o + c!, o + a!, o + c!, o + d!);
}

const GX = 1.4;
const GY = 1.8;
const GZ = 0.6;
const EZ = 1.2;

const beyond: SceneDef = {
  id: 'm05b-beyond-dft',
  title: 'Band gaps up the ladder of methods',
  badge: 'sample',
  sources: ['S-131', 'S-130', 'S-049'],
  banner:
    'Literature values: PBE, G0W0, GW0 and measured gaps of seven solids from Shishkin and Kresse (2007), Table I. Not computed on this site.',
  params: [
    {
      kind: 'select',
      id: 'method',
      label: 'Rung',
      physics: true,
      value: 'pbe',
      options: RUNGS.map((r) => ({ value: r.key, label: r.label })),
    },
    {
      kind: 'select',
      id: 'view',
      label: 'Height shows',
      physics: true,
      value: 'gap',
      options: [
        { value: 'gap', label: 'The gap (eV)' },
        { value: 'error', label: 'The error against experiment (eV)' },
      ],
    },
    {
      kind: 'select',
      id: 'material',
      label: 'Material',
      physics: true,
      value: 'all',
      options: [{ value: 'all', label: 'All seven' }, ...GW_GAPS.map((g) => ({ value: g.id, label: g.id }))],
    },
  ],
  build(p) {
    const rung = (RUNGS.find((r) => r.key === p.method) ?? RUNGS[0]!).key;
    const err = p.view === 'error';
    const zOf = (g: (typeof GW_GAPS)[number], v: number) => (err ? (v - g.exp) * EZ : v * GZ);
    const layers: Layer[] = [];
    const w = 0.32;
    RUNGS.forEach((r, j) => {
      const pos: number[] = [];
      const idx: number[] = [];
      GW_GAPS.forEach((g, i) => {
        const z = zOf(g, g[r.key]);
        const lo: Vec3 = [i * GX - w, j * GY - w, Math.min(0, z)];
        const hi: Vec3 = [i * GX + w, j * GY + w, Math.max(0, z) + (Math.abs(z) < 0.02 ? 0.02 : 0)];
        pushBox(pos, idx, lo, hi);
      });
      layers.push({
        kind: 'mesh',
        group: 'bars',
        name: 'Computed gaps',
        positions: pos,
        indices: idx,
        color: r.tone,
        opacity: r.key === rung ? 0.95 : 0.3,
        edges: r.key === rung,
      });
    });
    // the measured gap: a plate across the rungs at the measured height (zero in the error view)
    const plate: number[] = [];
    const plateIdx: number[] = [];
    const rims: [Vec3, Vec3][] = [];
    GW_GAPS.forEach((g, i) => {
      const z = err ? 0 : g.exp * GZ;
      const q0: Vec3 = [i * GX - 0.55, -0.6, z];
      const o = plate.length / 3;
      plate.push(
        q0[0],
        q0[1],
        z,
        q0[0] + 1.1,
        q0[1],
        z,
        q0[0] + 1.1,
        2 * GY + 0.6,
        z,
        q0[0],
        2 * GY + 0.6,
        z,
      );
      plateIdx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      rims.push(
        [q0, [q0[0] + 1.1, q0[1], z]],
        [
          [q0[0], 2 * GY + 0.6, z],
          [q0[0] + 1.1, 2 * GY + 0.6, z],
        ],
      );
    });
    layers.push({
      kind: 'mesh',
      group: 'measured',
      name: 'Measured gap',
      positions: plate,
      indices: plateIdx,
      color: 'muted',
      opacity: 0.35,
    });
    layers.push(lines(rims, 'ink', 'measured', { dashed: true }));
    // arrows from the chosen rung to the measured value: up (solid) where the method is too low, down (open) where too high
    const sel = p.material === 'all' ? GW_GAPS : GW_GAPS.filter((g) => g.id === p.material);
    const j = RUNGS.findIndex((r) => r.key === rung);
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    const heads: ('solid' | 'open')[] = [];
    for (const g of sel) {
      const i = GW_GAPS.indexOf(g);
      const z0 = zOf(g, g[rung]);
      const z1 = err ? 0 : g.exp * GZ;
      if (Math.abs(z1 - z0) < 0.05) continue;
      from.push([i * GX, j * GY - w - 0.15, z0]);
      vec.push([0, 0, z1 - z0]);
      heads.push(z1 > z0 ? 'solid' : 'open');
    }
    if (from.length)
      layers.push(
        arrows(from, vec, 'accent', 'correction', {
          name: 'Distance to the measured gap',
          head: heads,
          thickness: 0.03,
        }),
      );
    layers.push(
      labels(
        [
          ...GW_GAPS.map((g, i) => ({ text: g.id, at: [i * GX, -1.2, 0] as Vec3 })),
          ...RUNGS.map((r, k) => ({ text: r.label, at: [-1.5, k * GY, 0] as Vec3 })),
        ],
        'labels',
      ),
    );
    layers.push(...axesLayers([1.2, 1.2, 1.5], ['material', 'rung', err ? 'error' : 'gap'], [-2.4, -1.4, 0]));
    const { mae, mre } = rungErrors(rung);
    const label = RUNGS[j]!.label;
    const one = p.material === 'all' ? undefined : GW_GAPS.find((g) => g.id === p.material);
    const describe =
      `Bars for seven solids (${GW_GAPS.map((g) => g.id).join(', ')}, ordered by measured gap) on three rungs, PBE, G0W0 and GW0; ` +
      `${err ? 'height is the computed gap minus the measured gap, with the measured value at zero' : 'height is the gap, and a flat plate marks the measured gap'}. ` +
      `${label} is highlighted: mean absolute error ${fmt(mae, 2)} eV, mean relative error ${fmt(mre, 0)} percent.` +
      (one
        ? ` ${one.id}: PBE ${fmt(one.pbe, 2)}, G0W0 ${fmt(one.g0w0, 2)}, GW0 ${fmt(one.gw0, 2)} eV against ${fmt(one.exp, 2)} eV measured.`
        : '');
    return {
      layers,
      describe,
      camera: 'iso',
      axes: [
        'material',
        'rung of the ladder',
        err ? 'computed minus measured gap (eV x 1.2)' : 'gap (eV x 0.6)',
      ],
      readouts: [
        { label: 'Rung', value: label },
        { label: 'Mean absolute error', value: `${fmt(mae, 2)} eV` },
        { label: 'Mean relative error', value: `${fmt(mre, 0)} %` },
        {
          label: one ? `${one.id}, ${label} / measured` : 'Largest gap',
          value: one
            ? `${fmt(one[rung], 2)} / ${fmt(one.exp, 2)} eV`
            : `${fmt(Math.max(...GW_GAPS.map((g) => g.exp)), 2)} eV (measured)`,
        },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [symmetry.id]: symmetry,
  [relaxation.id]: relaxation,
  [beyond.id]: beyond,
};
