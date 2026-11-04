// HPKOT k-path (the default convention): Hinuma, Pizzi, Kumagai, Oba, Tanaka, Comput. Mater. Sci. 128, 140 (2017).
// Algorithm and tables ported from SeeK-path 2.2.2 (MIT, Copyright (c) 2016-2023 Giovanni Pizzi et al.; see THIRD_PARTY_NOTICES.md):
// seekpath/hpkot/__init__.py, spg_mapping.py, tools.py, spg_db.py and band_path_data/*. The conventional cell comes from
// moyo with the 'Spglib' setting (matches spglib's std cell, D-047); everything after that follows SeeK-path.
// @source S-006 (HPKOT paper), S-033 (SeeK-path)
import spacegroups from '../../../data/kpath/hpkot/spacegroups.json';
import variantsData from '../../../data/kpath/hpkot/variants.json';
import { latticeParameters, reciprocalLattice } from '../lattice';
import { det3, inv3, mul, transpose } from '../linalg';
import { niggliReduce } from '../niggli';
import type { MoyoApi, SymmetryResult } from '../symmetry';
import { analyzeWith } from '../symmetry';
import type { Mat3, Structure, Vec3 } from '../types';
import { evalExpr } from './expr';

export interface HpkotOptions {
  /** With time reversal (default) no extra -k path is added. */
  withTimeReversal?: boolean;
  /** Edge-case detection threshold (SeeK-path default 1e-7). */
  threshold?: number;
}

export interface KPathResult {
  convention: 'HPKOT';
  bravaisLattice: string;
  bravaisLatticeExtended: string;
  spacegroupNumber: number;
  spacegroupInternational: string;
  hasInversion: boolean;
  augmentedPath: boolean;
  /** Label to coordinates in the basis of `reciprocalPrimitive`. */
  pointCoords: Record<string, Vec3>;
  path: [string, string][];
  /** Edge cases the choice of variant depends on (e.g. a almost equal to c). Empty when unambiguous. */
  warnings: string[];
  convLattice: Mat3;
  convSpecies: string[];
  convFrac: Vec3[];
  primitiveLattice: Mat3;
  primitiveSpecies: string[];
  primitiveFrac: Vec3[];
  /** Rows, with the 2 pi factor. */
  reciprocalPrimitive: Mat3;
  /** P: primitive vectors = conventional vectors times P (columns). invP is an integer matrix. */
  P: Mat3;
  invP: Mat3;
}

interface Variant {
  kparams: [string, string][];
  points: Record<string, string[]>;
  path: [string, string][];
}
const VARIANTS = variantsData.variants as unknown as Record<string, Variant>;
const GROUPS = spacegroups.groups as unknown as Record<string, [string, string, boolean]>;

const HP1 = new Set([143, 144, 145, 146, 147, 148, 149, 151, 153, 157, 159, 160, 161, 162, 163]);

const near = (x: number, y: number, thr: number): boolean => Math.abs(x - y) < thr;

/** Display form of a label: GAMMA to Greek, DELTA/LAMBDA/SIGMA likewise, "_2" to a subscript, trailing ' kept. */
export function labelDisplay(label: string): string {
  const greek: Record<string, string> = { GAMMA: 'Γ', DELTA: 'Δ', LAMBDA: 'Λ', SIGMA: 'Σ' };
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  const m = /^([A-Z]+)(?:_(\d+))?('?)$/.exec(label);
  if (!m) return label;
  const base = greek[m[1]!] ?? m[1]!;
  const digits = (m[2] ?? '').replace(/\d/g, (d) => sub[Number(d)]!);
  return base + digits + (m[3] ?? '');
}

const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** HPKOT Table 3: P (conventional to primitive, (a_P b_P c_P) = (a b c) P) and the integer inverse, as in SeeK-path's get_P_matrix. */
const PTABLE: Record<string, { P: Mat3; invP: Mat3 }> = {
  P: { P: I3, invP: I3 },
  F: {
    P: [
      [0, 1 / 2, 1 / 2],
      [1 / 2, 0, 1 / 2],
      [1 / 2, 1 / 2, 0],
    ],
    invP: [
      [-1, 1, 1],
      [1, -1, 1],
      [1, 1, -1],
    ],
  },
  I: {
    P: [
      [-1 / 2, 1 / 2, 1 / 2],
      [1 / 2, -1 / 2, 1 / 2],
      [1 / 2, 1 / 2, -1 / 2],
    ],
    invP: [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ],
  },
  hR: {
    P: [
      [2 / 3, -1 / 3, -1 / 3],
      [1 / 3, 1 / 3, -2 / 3],
      [1 / 3, 1 / 3, 1 / 3],
    ],
    invP: [
      [1, 0, 1],
      [-1, 1, 1],
      [0, -1, 1],
    ],
  },
  oC: {
    P: [
      [1 / 2, 1 / 2, 0],
      [-1 / 2, 1 / 2, 0],
      [0, 0, 1],
    ],
    invP: [
      [1, -1, 0],
      [1, 1, 0],
      [0, 0, 1],
    ],
  },
  oA: {
    P: [
      [0, 0, 1],
      [1 / 2, 1 / 2, 0],
      [-1 / 2, 1 / 2, 0],
    ],
    invP: [
      [0, 1, -1],
      [0, 1, 1],
      [1, 0, 0],
    ],
  },
  mC: {
    P: [
      [1 / 2, -1 / 2, 0],
      [1 / 2, 1 / 2, 0],
      [0, 0, 1],
    ],
    invP: [
      [1, 1, 0],
      [-1, 1, 0],
      [0, 0, 1],
    ],
  },
};

/** Transformation matrices for a Bravais lattice such as 'cF' or 'mC'. */
export function primitiveMatrices(bravais: string): { P: Mat3; invP: Mat3 } {
  const key = ['hR', 'oC', 'oA', 'mC'].includes(bravais)
    ? bravais
    : bravais === 'aP'
      ? 'P'
      : bravais.slice(1);
  const m = PTABLE[key];
  if (!m) throw new RangeError(`No primitive transformation for Bravais lattice ${bravais}.`);
  return m;
}

function cellParams(m: Mat3) {
  const p = latticeParameters(m);
  const rad = Math.PI / 180;
  return {
    a: p.a,
    b: p.b,
    c: p.c,
    ca: Math.cos(p.alpha * rad),
    cb: Math.cos(p.beta * rad),
    cg: Math.cos(p.gamma * rad),
  };
}

/** Real cell rows to reciprocal rows (with 2 pi) and back; the maps are the same operation. */
const recip = (m: Mat3): Mat3 => reciprocalLattice(m);

interface Std {
  lattice: Mat3;
  species: string[];
  frac: Vec3[];
}

function choose(
  bravais: string,
  n: number,
  lat: Mat3,
  thr: number,
  warnings: string[],
): { ext: string; std?: Std } {
  const { a, b, c, cb } = cellParams(lat);
  const sb2 = 1 - cb * cb;
  switch (bravais) {
    case 'cP':
      return { ext: n <= 206 ? 'cP1' : 'cP2' };
    case 'cF':
      return { ext: n <= 206 ? 'cF1' : 'cF2' };
    case 'cI':
      return { ext: 'cI1' };
    case 'tP':
      return { ext: 'tP1' };
    case 'tI':
      if (near(c, a, thr)) warnings.push('tI lattice, but a almost equal to c');
      return { ext: c <= a ? 'tI1' : 'tI2' };
    case 'oP':
      return { ext: 'oP1' };
    case 'oF': {
      const ia = 1 / (a * a);
      const ib = 1 / (b * b);
      const ic = 1 / (c * c);
      if (near(ia, ib + ic, thr)) warnings.push('oF lattice, but 1/a^2 almost equal to 1/b^2 + 1/c^2');
      if (near(ic, ia + ib, thr)) warnings.push('oF lattice, but 1/c^2 almost equal to 1/a^2 + 1/b^2');
      return { ext: ia > ib + ic ? 'oF1' : ic > ia + ib ? 'oF2' : 'oF3' };
    }
    case 'oI': {
      const s: [number, number, string][] = [
        [c, 1, 'c'],
        [b, 3, 'b'],
        [a, 2, 'a'],
      ];
      s.sort((x, y) => (x[0] !== y[0] ? y[0] - x[0] : y[1] - x[1]));
      if (near(s[0]![0], s[1]![0], thr))
        warnings.push(
          `oI lattice, but the two longest vectors ${s[0]![2]} and ${s[1]![2]} have almost the same length`,
        );
      return { ext: `oI${s[0]![1]}` };
    }
    case 'oC':
      if (near(b, a, thr)) warnings.push('oC lattice, but a almost equal to b');
      return { ext: a <= b ? 'oC1' : 'oC2' };
    case 'oA':
      if (near(b, c, thr)) warnings.push('oA lattice, but b almost equal to c');
      return { ext: b <= c ? 'oA1' : 'oA2' };
    case 'hP':
      return { ext: HP1.has(n) ? 'hP1' : 'hP2' };
    case 'hR':
      if (near(Math.sqrt(3) * a, Math.sqrt(2) * c, thr))
        warnings.push('hR lattice, but sqrt(3)a almost equal to sqrt(2)c');
      return { ext: Math.sqrt(3) * a <= Math.sqrt(2) * c ? 'hR1' : 'hR2' };
    case 'mP':
      return { ext: 'mP1' };
    case 'mC': {
      const sinb = Math.sqrt(sb2);
      if (near(b, a * sinb, thr)) warnings.push('mC lattice, but b almost equal to a*sin(beta)');
      if (b < a * sinb) return { ext: 'mC1' };
      const q = (-a * cb) / c + (a * a * sb2) / (b * b);
      if (near(q, 1, thr))
        warnings.push('mC lattice, but -a*cos(beta)/c + a^2*sin(beta)^2/b^2 almost equal to 1');
      return { ext: q <= 1 ? 'mC2' : 'mC3' };
    }
    default:
      throw new RangeError(`Unknown Bravais lattice '${bravais}'.`);
  }
}

const M2: Mat3[] = [
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
];

/** Triclinic: replace the conventional cell by SeeK-path's (Niggli-reduced reciprocal cell, permuted, all-acute or all-obtuse). */
function triclinic(std: Std, thr: number, warnings: string[]): { ext: string; std: Std } {
  const rec2 = niggliReduce(recip(std.lattice));
  const real2 = recip(rec2);
  const k2 = cellParams(rec2);
  const cond = [Math.abs(k2.b * k2.c * k2.ca), Math.abs(k2.c * k2.a * k2.cb), Math.abs(k2.a * k2.b * k2.cg)];
  // numpy argsort is stable for the first minimum
  let imin = 0;
  for (let i = 1; i < 3; i++) if (cond[i]! < cond[imin]!) imin = i;
  const m2 = M2[imin]!;
  // real_cell3 = (real_cell2^T . M2)^T
  const real3 = transpose(mul(transpose(real2), m2));
  const k3 = cellParams(recip(real3));
  if (Math.abs(k3.ca) < thr)
    warnings.push('aP lattice, but the k_alpha3 angle is almost equal to 90 degrees');
  if (Math.abs(k3.cb) < thr) warnings.push('aP lattice, but the k_beta3 angle is almost equal to 90 degrees');
  if (Math.abs(k3.cg) < thr)
    warnings.push('aP lattice, but the k_gamma3 angle is almost equal to 90 degrees');
  const pos = [k3.ca > 0, k3.cb > 0, k3.cg > 0];
  const npos = pos.filter(Boolean).length;
  let m3: Mat3;
  if (npos === 3 || npos === 0) {
    m3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  } else if ((pos[0] && !pos[1] && !pos[2]) || (!pos[0] && pos[1] && pos[2])) {
    m3 = [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ];
  } else if ((!pos[0] && pos[1] && !pos[2]) || (pos[0] && !pos[1] && pos[2])) {
    m3 = [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
  } else {
    m3 = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ];
  }
  const realF = transpose(mul(transpose(real3), m3));
  const kf = cellParams(recip(realF));
  let ext: string;
  if (kf.ca <= 0 && kf.cb <= 0 && kf.cg <= 0) ext = 'aP2';
  else if (kf.ca >= 0 && kf.cb >= 0 && kf.cg >= 0) ext = 'aP3';
  else throw new RangeError('Unexpected aP triclinic lattice: it is neither all-obtuse nor all-acute.');
  // Same atoms, new basis: frac' = frac A A'^-1
  const T = mul(std.lattice, inv3(realF));
  const frac = std.frac.map(
    (f) => [0, 1, 2].map((j) => f[0] * T[0]![j]! + f[1] * T[1]![j]! + f[2] * T[2]![j]!) as unknown as Vec3,
  );
  return { ext, std: { lattice: realF, species: std.species, frac } };
}

/** Primitive cell from the conventional one, following SeeK-path (positions are not wrapped). */
function getPrimitive(std: Std, bravais: string) {
  const { P, invP } = primitiveMatrices(bravais);
  const ratio = Math.round(det3(invP));
  // prim vectors (rows) = P^T . conventional rows
  const lattice = mul(transpose(P), std.lattice);
  const pos = std.frac.map(
    (f) =>
      [0, 1, 2].map(
        (i) => invP[i]![0]! * f[0] + invP[i]![1]! * f[1] + invP[i]![2]! * f[2],
      ) as unknown as Vec3,
  );
  const same = (x: number, y: number) => Math.abs(((((x - y + 0.5) % 1) + 1) % 1) - 0.5) < 1e-6;
  const seen: number[][] = [];
  const keep: number[] = [];
  pos.forEach((p, i) => {
    const g = seen.findIndex(
      (s) => same(pos[s[0]!]![0], p[0]) && same(pos[s[0]!]![1], p[1]) && same(pos[s[0]!]![2], p[2]),
    );
    if (g < 0) {
      seen.push([i]);
      keep.push(i);
    } else seen[g]!.push(i);
  });
  for (const g of seen) {
    if (g.length !== ratio)
      throw new Error(
        `Problem creating the primitive cell: a group of atoms has ${g.length} members, expected ${ratio}.`,
      );
    if (new Set(g.map((i) => std.species[i])).size !== 1)
      throw new Error('Atoms of different species map onto the same primitive site.');
  }
  return { lattice, P, invP, species: keep.map((i) => std.species[i]!), frac: keep.map((i) => pos[i]!) };
}

/**
 * HPKOT path from a symmetry analysis made with `setting: 'Spglib'` (so the conventional cell matches spglib's, as SeeK-path expects).
 */
export function hpkotPath(sym: SymmetryResult, opts: HpkotOptions = {}): KPathResult {
  if (sym.setting !== 'Spglib')
    throw new RangeError(
      "hpkotPath needs a symmetry analysis made with setting 'Spglib' (the SeeK-path conventional cell).",
    );
  const thr = opts.threshold ?? 1e-7;
  const n = sym.number;
  const props = GROUPS[String(n)];
  if (!props) throw new RangeError(`Unknown space group number ${n}.`);
  const bravais = `${props[0]}${props[1]}`;
  const hasInv = props[2];
  const warnings: string[] = [];
  let std: Std = {
    lattice: sym.stdCell.lattice,
    species: [...sym.stdCell.species],
    frac: [...sym.stdCell.frac],
  };
  // The parameters a, b, c, cos(alpha..) are those of the cell BEFORE any aP replacement (SeeK-path does the same).
  const cp = cellParams(std.lattice);
  let ext: string;
  if (bravais === 'aP') {
    const t = triclinic(std, thr, warnings);
    ext = t.ext;
    std = t.std;
  } else {
    ext = choose(bravais, n, std.lattice, thr, warnings).ext;
  }
  const prim = getPrimitive(std, bravais);
  const v = VARIANTS[ext];
  if (!v) throw new RangeError(`No HPKOT table for ${ext}.`);
  const vars: Record<string, number> = {
    a: cp.a,
    b: cp.b,
    c: cp.c,
    cosalpha: cp.ca,
    cosbeta: cp.cb,
    cosgamma: cp.cg,
    sinbeta: Math.sqrt(1 - cp.cb * cp.cb),
  };
  for (const [name, expr] of v.kparams) vars[name] = evalExpr(expr, vars);
  const points: Record<string, Vec3> = {};
  for (const [label, e] of Object.entries(v.points)) {
    points[label] = [evalExpr(e[0]!, vars), evalExpr(e[1]!, vars), evalExpr(e[2]!, vars)];
  }
  const path = v.path.map(([x, y]) => [x, y] as [string, string]);
  const augmented = !hasInv && opts.withTimeReversal === false;
  if (augmented) {
    for (const [label, c] of Object.entries({ ...points })) {
      if (label !== 'GAMMA') points[`${label}'`] = [-c[0] + 0, -c[1] + 0, -c[2] + 0];
    }
    for (const [x, y] of v.path) path.push([x === 'GAMMA' ? x : `${x}'`, y === 'GAMMA' ? y : `${y}'`]);
  }
  return {
    convention: 'HPKOT',
    bravaisLattice: bravais,
    bravaisLatticeExtended: ext,
    spacegroupNumber: n,
    spacegroupInternational: sym.hmSymbol,
    hasInversion: hasInv,
    augmentedPath: augmented,
    pointCoords: points,
    path,
    warnings,
    convLattice: std.lattice,
    convSpecies: std.species,
    convFrac: std.frac,
    primitiveLattice: prim.lattice,
    primitiveSpecies: prim.species,
    primitiveFrac: prim.frac,
    reciprocalPrimitive: recip(prim.lattice),
    P: prim.P,
    invP: prim.invP,
  };
}

/** Convenience: run moyo (Spglib setting) and then `hpkotPath`. */
export function hpkotPathFor(
  api: MoyoApi,
  s: Structure,
  symprec = 1e-4,
  opts: HpkotOptions = {},
): KPathResult {
  return hpkotPath(analyzeWith(api, s, { symprec, setting: 'Spglib' }), opts);
}
