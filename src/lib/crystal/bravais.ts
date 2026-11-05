// The 14 Bravais lattices as input for the k-path tool: lattice parameters in, a cell with one point per lattice
// point out. Only the lattice is described, so the symmetry found later is the lattice symmetry (the holohedry).
// @source S-036 (primitive and conventional cells; centring vectors of the centred lattices), S-032 (spglib/moyo standardized cells)
import { fromParameters } from './lattice';
import type { Mat3, Structure, Vec3 } from './types';

export type BravaisId =
  'aP' | 'mP' | 'mC' | 'oP' | 'oC' | 'oI' | 'oF' | 'tP' | 'tI' | 'hP' | 'hR' | 'cP' | 'cI' | 'cF';

export type ParamKey = 'a' | 'b' | 'c' | 'alpha' | 'beta' | 'gamma';
export type Params = Partial<Record<ParamKey, number>>;

export interface BravaisInfo {
  id: BravaisId;
  label: string;
  /** Parameters the user may change; the others are fixed by the crystal system. */
  fields: ParamKey[];
  defaults: Required<Pick<Params, 'a'>> & Params;
  /** Lattice points inside the drawn cell, in fractional coordinates of that cell. */
  points: Vec3[];
}

const P0: Vec3[] = [[0, 0, 0]];
const C: Vec3[] = [
  [0, 0, 0],
  [0.5, 0.5, 0],
];
const I: Vec3[] = [
  [0, 0, 0],
  [0.5, 0.5, 0.5],
];
const F: Vec3[] = [
  [0, 0, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [0.5, 0.5, 0],
];

export const BRAVAIS: readonly BravaisInfo[] = [
  { id: 'cP', label: 'Cubic, primitive (cP)', fields: ['a'], defaults: { a: 4 }, points: P0 },
  { id: 'cI', label: 'Cubic, body-centred (cI)', fields: ['a'], defaults: { a: 3 }, points: I },
  { id: 'cF', label: 'Cubic, face-centred (cF)', fields: ['a'], defaults: { a: 3.61 }, points: F },
  { id: 'tP', label: 'Tetragonal, primitive (tP)', fields: ['a', 'c'], defaults: { a: 3, c: 5 }, points: P0 },
  {
    id: 'tI',
    label: 'Tetragonal, body-centred (tI)',
    fields: ['a', 'c'],
    defaults: { a: 3, c: 5 },
    points: I,
  },
  {
    id: 'oP',
    label: 'Orthorhombic, primitive (oP)',
    fields: ['a', 'b', 'c'],
    defaults: { a: 3, b: 4, c: 5 },
    points: P0,
  },
  {
    id: 'oC',
    label: 'Orthorhombic, base-centred (oC)',
    fields: ['a', 'b', 'c'],
    defaults: { a: 3, b: 4, c: 5 },
    points: C,
  },
  {
    id: 'oI',
    label: 'Orthorhombic, body-centred (oI)',
    fields: ['a', 'b', 'c'],
    defaults: { a: 3, b: 4, c: 5 },
    points: I,
  },
  {
    id: 'oF',
    label: 'Orthorhombic, face-centred (oF)',
    fields: ['a', 'b', 'c'],
    defaults: { a: 3, b: 4, c: 5 },
    points: F,
  },
  {
    id: 'hP',
    label: 'Hexagonal (hP), gamma = 120 degrees',
    fields: ['a', 'c'],
    defaults: { a: 3.21, c: 5.21 },
    points: P0,
  },
  {
    id: 'hR',
    label: 'Rhombohedral (hR), primitive cell with a and alpha',
    fields: ['a', 'alpha'],
    defaults: { a: 4, alpha: 70 },
    points: P0,
  },
  {
    id: 'mP',
    label: 'Monoclinic, primitive (mP), unique axis b',
    fields: ['a', 'b', 'c', 'beta'],
    defaults: { a: 3, b: 4, c: 5, beta: 100 },
    points: P0,
  },
  {
    id: 'mC',
    label: 'Monoclinic, base-centred (mC), unique axis b',
    fields: ['a', 'b', 'c', 'beta'],
    defaults: { a: 3, b: 4, c: 5, beta: 100 },
    points: C,
  },
  {
    id: 'aP',
    label: 'Triclinic (aP)',
    fields: ['a', 'b', 'c', 'alpha', 'beta', 'gamma'],
    defaults: { a: 3, b: 4, c: 5, alpha: 80, beta: 85, gamma: 95 },
    points: P0,
  },
];

export const bravaisInfo = (id: BravaisId): BravaisInfo => BRAVAIS.find((b) => b.id === id)!;

const PLAIN: Record<ParamKey, string> = {
  a: 'a',
  b: 'b',
  c: 'c',
  alpha: 'alpha',
  beta: 'beta',
  gamma: 'gamma',
};

export interface BravaisResult {
  ok: boolean;
  /** One plain-language message per problem, keyed by the field it belongs to (or 'cell' for the whole cell). */
  errors: Partial<Record<ParamKey | 'cell', string>>;
  structure?: Structure;
}

/** Volume factor of a cell: 1 - cos^2 a - cos^2 b - cos^2 g + 2 cos a cos b cos g. Positive exactly when the three angles can close a cell. */
export function volumeFactor(alpha: number, beta: number, gamma: number): number {
  const r = Math.PI / 180;
  const ca = Math.cos(alpha * r);
  const cb = Math.cos(beta * r);
  const cg = Math.cos(gamma * r);
  return 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
}

/** Full set of six parameters for a Bravais lattice, with the fixed ones filled in by the crystal system. */
export function fullParams(id: BravaisId, p: Params): Required<Params> {
  const a = p.a ?? 0;
  switch (id[0]) {
    case 'c':
      return { a, b: a, c: a, alpha: 90, beta: 90, gamma: 90 };
    case 't':
      return { a, b: a, c: p.c ?? 0, alpha: 90, beta: 90, gamma: 90 };
    case 'o':
      return { a, b: p.b ?? 0, c: p.c ?? 0, alpha: 90, beta: 90, gamma: 90 };
    case 'h':
      return id === 'hP'
        ? { a, b: a, c: p.c ?? 0, alpha: 90, beta: 90, gamma: 120 }
        : { a, b: a, c: a, alpha: p.alpha ?? 0, beta: p.alpha ?? 0, gamma: p.alpha ?? 0 };
    case 'm':
      return { a, b: p.b ?? 0, c: p.c ?? 0, alpha: 90, beta: p.beta ?? 0, gamma: 90 };
    default:
      return {
        a,
        b: p.b ?? 0,
        c: p.c ?? 0,
        alpha: p.alpha ?? 0,
        beta: p.beta ?? 0,
        gamma: p.gamma ?? 0,
      };
  }
}

/** Check the parameters and build the cell: the conventional cell of the lattice with one atom per lattice point. */
export function buildBravais(id: BravaisId, p: Params): BravaisResult {
  const info = bravaisInfo(id);
  const errors: BravaisResult['errors'] = {};
  for (const k of info.fields) {
    const v = p[k];
    const angle = k === 'alpha' || k === 'beta' || k === 'gamma';
    if (v === undefined || !Number.isFinite(v)) errors[k] = `Enter a number for ${PLAIN[k]}.`;
    else if (!angle && v <= 0) errors[k] = `${PLAIN[k]} is a length and must be larger than zero.`;
    else if (angle && (v <= 0 || v >= 180))
      errors[k] = `${PLAIN[k]} is an angle and must be between 0 and 180 degrees.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const f = fullParams(id, p);
  if (volumeFactor(f.alpha, f.beta, f.gamma) <= 1e-9) {
    errors.cell =
      'These three angles cannot form a cell: the three edges would lie in one plane, so the cell has no volume. Change one of the angles.';
    return { ok: false, errors };
  }
  const lattice: Mat3 = fromParameters(f.a, f.b, f.c, f.alpha, f.beta, f.gamma);
  const structure: Structure = {
    lattice,
    species: info.points.map(() => 'H'),
    frac: info.points.map((q) => [...q] as Vec3),
    comment: `${id} lattice, a=${f.a}, b=${f.b}, c=${f.c}, alpha=${f.alpha}, beta=${f.beta}, gamma=${f.gamma}`,
  };
  return { ok: true, errors, structure };
}
