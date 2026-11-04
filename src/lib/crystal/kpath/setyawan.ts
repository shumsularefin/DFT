// Setyawan-Curtarolo k-path (the pymatgen / Materials Project convention): Setyawan and Curtarolo, Comput. Mater. Sci. 49, 299 (2010).
// Algorithm and tables ported from pymatgen (MIT, Copyright (c) Pymatgen Development Team; see THIRD_PARTY_NOTICES.md):
// pymatgen/symmetry/kpath.py (KPathSetyawanCurtarolo, 23 branch methods), pymatgen/symmetry/analyzer.py
// (get_conventional_standard_structure, get_primitive_standard_structure) and pymatgen/core/lattice.py (LLL reduction).
// The refined (idealised conventional) cell comes from moyo with the 'Spglib' setting, which plays the role of spglib's refine_cell (D-047).
// Differences from pymatgen, all deliberate (D-048): equalities that decide the orcf3, mclc2 and mclc4 variants use a small tolerance
// (pymatgen compares floats with ==, so those branches are practically unreachable there); a rhombohedral-looking refined cell cannot
// occur with moyo's hexagonal-axes standard cell, so pymatgen's supercell fix-up for it is omitted.
// @source S-005 (Setyawan-Curtarolo 2010), S-034 (pymatgen)
import { latticeParameters, reciprocalLattice } from '../lattice';
import { inv3, mul } from '../linalg';
import type { SymmetryResult } from '../symmetry';
import type { Mat3, Vec3 } from '../types';

export type ScVariantId =
  | 'cubic'
  | 'fcc'
  | 'bcc'
  | 'tet'
  | 'bctet1'
  | 'bctet2'
  | 'orc'
  | 'orcf1'
  | 'orcf2'
  | 'orcf3'
  | 'orci'
  | 'orcc'
  | 'hex'
  | 'rhl1'
  | 'rhl2'
  | 'mcl'
  | 'mclc1'
  | 'mclc2'
  | 'mclc3'
  | 'mclc4'
  | 'mclc5'
  | 'tria'
  | 'trib';

export interface SetyawanOptions {
  /** Tolerance for the equalities that separate orcf3, mclc2 and mclc4 from their neighbours (default 1e-8, relative). */
  boundaryTol?: number;
}

export interface SetyawanResult {
  convention: 'Setyawan-Curtarolo';
  /** pymatgen method name, e.g. 'bctet1'. */
  variantId: ScVariantId;
  /** Name used in the paper and by pymatgen, e.g. 'BCT1', 'TRI1a'. */
  variant: string;
  latticeType: string;
  spacegroupNumber: number;
  spacegroupInternational: string;
  /** Label to coordinates in the basis of `reciprocalPrimitive`. Labels as in pymatgen, e.g. "\\Gamma", "A_1". */
  pointCoords: Record<string, Vec3>;
  /** Chains of labels, as pymatgen's `kpath['path']`. */
  pathSegments: string[][];
  /** The same path as consecutive pairs. */
  path: [string, string][];
  warnings: string[];
  convLattice: Mat3;
  convSpecies: string[];
  convFrac: Vec3[];
  primitiveLattice: Mat3;
  primitiveSpecies: string[];
  primitiveFrac: Vec3[];
  /** Rows, with the 2 pi factor. */
  reciprocalPrimitive: Mat3;
}

/** Display form of a pymatgen label: "\\Gamma" to Γ, "A_1" to A₁. */
export function scLabelDisplay(label: string): string {
  const greek: Record<string, string> = { '\\Gamma': 'Γ', '\\Sigma': 'Σ' };
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  const m = /^(\\?[A-Za-z]+)(?:_(\d+))?$/.exec(label);
  if (!m) return label;
  const digits = (m[2] ?? '').replace(/\d/g, (d) => sub[Number(d)]!);
  return (greek[m[1]!] ?? m[1]!) + digits;
}

const DEG = Math.PI / 180;
const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

/** Python's round(): half to even. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Lenstra-Lenstra-Lovasz reduction exactly as in pymatgen Lattice._calculate_lll (delta 0.75). Rows are lattice vectors. */
export function lllReduce(rows: Mat3, delta = 0.75): Mat3 {
  const a = rows.map((r) => [r[0], r[1], r[2]]);
  const b = [0, 1, 2].map(() => [0, 0, 0]);
  const u = [0, 1, 2].map(() => [0, 0, 0]);
  const m = [0, 0, 0];
  const d = (x: number[], y: number[]) => x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  const gs = (i: number) => {
    for (let j = 0; j < i; j++) u[i]![j] = d(a[i]!, b[j]!) / m[j]!;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let j = 0; j < i; j++) s += b[j]![c]! * u[i]![j]!;
      b[i]![c] = a[i]![c]! - s;
    }
    m[i] = d(b[i]!, b[i]!);
  };
  b[0] = [...a[0]!];
  m[0] = d(b[0]!, b[0]!);
  gs(1);
  gs(2);
  let k = 2;
  let guard = 0;
  while (k <= 3) {
    if (++guard > 10000) throw new Error('LLL reduction did not converge.');
    for (let i = k - 1; i > 0; i--) {
      const q = pyRound(u[k - 1]![i - 1]!);
      if (q !== 0) {
        for (let c = 0; c < 3; c++) a[k - 1]![c] = a[k - 1]![c]! - q * a[i - 1]![c]!;
        const uu = [...u[i - 1]!.slice(0, i - 1), 1];
        for (let j = 0; j < i; j++) u[k - 1]![j] = u[k - 1]![j]! - q * uu[j]!;
      }
    }
    const lhs = d(b[k - 1]!, b[k - 1]!);
    const rhs = (delta - Math.abs(u[k - 1]![k - 2]!) ** 2) * d(b[k - 2]!, b[k - 2]!);
    if (lhs >= rhs) {
      k += 1;
    } else {
      const t = a[k - 1]!;
      a[k - 1] = a[k - 2]!;
      a[k - 2] = t;
      for (let s = k - 1; s <= k; s++) gs(s - 1);
      if (k > 2) k -= 1;
      else for (let j = 0; j < 2; j++) u[2]![j] = d(a[2]!, b[j]!) / m[j]!;
    }
  }
  return a.map((r) => [r[0]!, r[1]!, r[2]!] as unknown as Vec3) as unknown as Mat3;
}

interface Cell {
  lattice: Mat3;
  species: string[];
  frac: Vec3[];
}

const wrap1 = (x: number): number => x - Math.floor(x);
const wrapV = (f: Vec3): Vec3 => [wrap1(f[0]), wrap1(f[1]), wrap1(f[2])];

/** frac' = frac . transf^T, then into the unit cell (pymatgen: struct.frac_coords @ transf.T, to_unit_cell=True). */
function applyTransf(frac: readonly Vec3[], t: number[][]): Vec3[] {
  return frac.map((f) =>
    wrapV([0, 1, 2].map((j) => f[0] * t[j]![0]! + f[1] * t[j]![1]! + f[2] * t[j]![2]!) as unknown as Vec3),
  );
}

const lens = (m: Mat3): [number, number, number] => {
  const p = latticeParameters(m);
  return [p.a, p.b, p.c];
};
const rowsOf = (m: number[][]): Mat3 => m.map((r) => [r[0]!, r[1]!, r[2]!]) as unknown as Mat3;
const matMul3 = (a: number[][], b: number[][]): number[][] =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!),
  );
const zeros = (): number[][] => [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const isClose90 = (x: number, tol = 1e-10) => Math.abs(x - 90) <= tol;

/** pymatgen SpacegroupAnalyzer.get_conventional_standard_structure(international_monoclinic=False), starting from the refined cell. */
function conventionalStandard(sym: SymmetryResult, latticeType: string, symbol: string): Cell {
  const tol = 1e-5;
  let struct: Cell = {
    lattice: sym.stdCell.lattice,
    species: [...sym.stdCell.species],
    frac: [...sym.stdCell.frac],
  };
  const abc = lens(struct.lattice);
  const sortedIdx = (idxs: number[]) => [...idxs].sort((i, j) => abc[i]! - abc[j]!);
  let transf = zeros();
  let lattice: Mat3;

  if (latticeType === 'orthorhombic' || latticeType === 'cubic') {
    let a: number, b: number, c: number;
    if (symbol.startsWith('C')) {
      transf[2] = [0, 0, 1];
      [a, b] = [abc[0], abc[1]].sort((x, y) => x - y) as [number, number];
      sortedIdx([0, 1]).forEach((o, idx) => (transf[idx]![o] = 1));
      c = abc[2];
    } else if (symbol.startsWith('A')) {
      transf[2] = [1, 0, 0];
      [a, b] = [abc[1], abc[2]].sort((x, y) => x - y) as [number, number];
      sortedIdx([1, 2]).forEach((o, idx) => (transf[idx]![o] = 1));
      c = abc[0];
    } else {
      sortedIdx([0, 1, 2]).forEach((o, idx) => (transf[idx]![o] = 1));
      [a, b, c] = [...abc].sort((x, y) => x - y) as [number, number, number];
    }
    lattice = [v3(a, 0, 0), v3(0, b, 0), v3(0, 0, c)];
  } else if (latticeType === 'tetragonal') {
    let [a, , c] = [...abc].sort((x, y) => x - y) as [number, number, number];
    const b = [...abc].sort((x, y) => x - y)[1]!;
    sortedIdx([0, 1, 2]).forEach((o, idx) => (transf[idx]![o] = 1));
    if (Math.abs(b - c) < tol && tol < Math.abs(a - c)) {
      [a, c] = [c, a];
      transf = matMul3(
        [
          [0, 0, 1],
          [0, 1, 0],
          [1, 0, 0],
        ],
        transf,
      );
    }
    lattice = [v3(a, 0, 0), v3(0, a, 0), v3(0, 0, c)];
  } else if (latticeType === 'hexagonal' || latticeType === 'rhombohedral') {
    let [a, , c] = abc;
    const b = abc[1];
    if (Math.abs(b - c) < 0.001) [a, c] = [c, a];
    lattice = [v3(a / 2, (-a * Math.sqrt(3)) / 2, 0), v3(a / 2, (a * Math.sqrt(3)) / 2, 0), v3(0, 0, c)];
    transf = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  } else if (latticeType === 'monoclinic') {
    const m = struct.lattice;
    let newMatrix: Mat3 | null = null;
    if (symbol.startsWith('C')) {
      transf[2] = [0, 0, 1];
      const sd = sortedIdx([0, 1]);
      let a = abc[sd[0]!]!;
      let b = abc[sd[1]!]!;
      let c = abc[2];
      for (const [p0, p1] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const p2 = latticeParameters([m[p0], m[p1], m[2]]);
        let alpha = p2.alpha;
        if (isClose90(alpha)) continue;
        transf = zeros();
        transf[2]![2] = 1;
        if (alpha > 90) {
          const q = latticeParameters([neg(m[p0]), neg(m[p1]), m[2]]);
          ({ a, b, c, alpha } = q);
          transf[0]![p0] = -1;
          transf[1]![p1] = -1;
        } else {
          transf[0]![p0] = 1;
          transf[1]![p1] = 1;
          ({ a, b, c } = p2);
        }
        const ar = alpha * DEG;
        newMatrix = [v3(a, 0, 0), v3(0, b, 0), v3(0, c * Math.cos(ar), c * Math.sin(ar))];
      }
      if (newMatrix === null) {
        newMatrix = [v3(a, 0, 0), v3(0, b, 0), v3(0, 0, c)];
        sd.forEach((o, idx) => (transf[idx]![o] = 1));
      }
    } else {
      const perms = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
      ] as const;
      for (const [p0, p1, p2] of perms) {
        const q = latticeParameters([m[p0], m[p1], m[p2]]);
        if (isClose90(q.alpha) || q.b >= q.c) continue;
        transf = zeros();
        transf[2]![p2] = 1;
        let { a, b, c, alpha } = q;
        if (alpha > 90) {
          ({ a, b, c, alpha } = latticeParameters([neg(m[p0]), neg(m[p1]), m[p2]]));
          transf[0]![p0] = -1;
          transf[1]![p1] = -1;
        } else {
          transf[0]![p0] = 1;
          transf[1]![p1] = 1;
        }
        const ar = alpha * DEG;
        newMatrix = [v3(a, 0, 0), v3(0, b, 0), v3(0, c * Math.cos(ar), c * Math.sin(ar))];
      }
      if (newMatrix === null) {
        const rowsOut: Vec3[] = [m[0], m[1], m[2]];
        const sd = sortedIdx([0, 1, 2]);
        sd.forEach((o, idx) => {
          rowsOut[idx] = m[o]!;
          transf[idx]![o] = 1;
        });
        newMatrix = rowsOut as unknown as Mat3;
      }
    }
    lattice = newMatrix;
  } else {
    // triclinic: LLL, then the first of four orientations whose reciprocal angles are all acute or all obtuse (the last that fits wins, as in pymatgen)
    const cart = struct.frac.map((f) =>
      [0, 1, 2].map(
        (j) => f[0] * struct.lattice[0][j]! + f[1] * struct.lattice[1][j]! + f[2] * struct.lattice[2][j]!,
      ),
    );
    const red = lllReduce(struct.lattice);
    const ri = inv3(red);
    struct = {
      lattice: red,
      species: struct.species,
      frac: cart.map((x) =>
        wrapV(
          [0, 1, 2].map(
            (j) => x[0]! * ri[0]![j]! + x[1]! * ri[1]![j]! + x[2]! * ri[2]![j]!,
          ) as unknown as Vec3,
        ),
      ),
    };
    const p = latticeParameters(red);
    const { a, b, c } = p;
    const al = p.alpha * DEG;
    const be = p.beta * DEG;
    const ga = p.gamma * DEG;
    const x = (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
    const z =
      Math.sqrt(
        Math.sin(ga) ** 2 -
          Math.cos(al) ** 2 -
          Math.cos(be) ** 2 +
          2 * Math.cos(al) * Math.cos(be) * Math.cos(ga),
      ) / Math.sin(ga);
    const ok = (mat: Mat3) => {
      const r = latticeParameters(reciprocalLattice(mat));
      const ang = [r.alpha, r.beta, r.gamma];
      return ang.every((t) => t <= 90) || ang.every((t) => t > 90);
    };
    let found: Mat3 | null = null;
    const tries: [Mat3, number[][]][] = [
      [
        [v3(a, 0, 0), v3(b * Math.cos(ga), b * Math.sin(ga), 0), v3(c * Math.cos(be), c * x, c * z)],
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ],
      [
        [v3(-a, 0, 0), v3(b * Math.cos(ga), b * Math.sin(ga), 0), v3(-c * Math.cos(be), -c * x, -c * z)],
        [
          [-1, 0, 0],
          [0, 1, 0],
          [0, 0, -1],
        ],
      ],
      [
        [v3(-a, 0, 0), v3(-b * Math.cos(ga), -b * Math.sin(ga), 0), v3(c * Math.cos(be), c * x, c * z)],
        [
          [-1, 0, 0],
          [0, -1, 0],
          [0, 0, 1],
        ],
      ],
      [
        [v3(a, 0, 0), v3(-b * Math.cos(ga), -b * Math.sin(ga), 0), v3(-c * Math.cos(be), -c * x, -c * z)],
        [
          [1, 0, 0],
          [0, -1, 0],
          [0, 0, -1],
        ],
      ],
    ];
    for (const [mat, t] of tries) {
      if (ok(mat)) {
        found = mat;
        transf = t;
      }
    }
    if (found === null)
      throw new RangeError(
        'No orientation of this triclinic cell has all-acute or all-obtuse reciprocal angles.',
      );
    lattice = found;
  }
  return { lattice, species: struct.species, frac: applyTransf(struct.frac, transf) };
}

/** Conventional to primitive (rows), pymatgen get_conventional_to_primitive_transformation_matrix. */
function toPrimitiveMatrix(symbol: string, latticeType: string): number[][] {
  if (symbol.startsWith('P'))
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  if (symbol.startsWith('R'))
    return [
      [2 / 3, 1 / 3, 1 / 3],
      [-1 / 3, 1 / 3, 1 / 3],
      [-1 / 3, -2 / 3, 1 / 3],
    ];
  if (symbol.startsWith('I'))
    return [
      [-0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, -0.5],
    ];
  if (symbol.startsWith('F'))
    return [
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
      [0.5, 0.5, 0],
    ];
  if (symbol.startsWith('C') || symbol.startsWith('A')) {
    if (latticeType === 'monoclinic')
      return [
        [0.5, 0.5, 0],
        [-0.5, 0.5, 0],
        [0, 0, 1],
      ];
    return [
      [0.5, -0.5, 0],
      [0.5, 0.5, 0],
      [0, 0, 1],
    ];
  }
  throw new RangeError(`Unrecognised space group symbol ${symbol}.`);
}

/** pymatgen get_primitive_standard_structure(international_monoclinic=False). */
function primitiveStandard(conv: Cell, symbol: string, latticeType: string): Cell {
  if (symbol.startsWith('P')) return conv;
  const tm = toPrimitiveMatrix(symbol, latticeType);
  const lat = mul(rowsOf(tm), conv.lattice);
  const inv = inv3(lat);
  const species: string[] = [];
  const frac: Vec3[] = [];
  conv.frac.forEach((f, i) => {
    const x = [0, 1, 2].map(
      (j) => f[0] * conv.lattice[0][j]! + f[1] * conv.lattice[1][j]! + f[2] * conv.lattice[2][j]!,
    );
    const nf = wrapV(
      [0, 1, 2].map(
        (j) => x[0]! * inv[0]![j]! + x[1]! * inv[1]![j]! + x[2]! * inv[2]![j]!,
      ) as unknown as Vec3,
    );
    const dup = frac.some((g, k) => {
      if (species[k] !== conv.species[i]) return false;
      return [0, 1, 2].every((j) => {
        let dd = g[j]! - nf[j]!;
        dd -= Math.round(dd);
        return Math.abs(dd) <= 1e-8;
      });
    });
    if (!dup) {
      species.push(conv.species[i]!);
      frac.push(nf);
    }
  });
  let lattice = lat;
  if (symbol.startsWith('R')) {
    // reorient to the Setyawan-Curtarolo A.11 setting (sites and fractional coordinates are kept)
    const p = latticeParameters(lat);
    const alpha = p.alpha * DEG;
    const ca = Math.cos(alpha);
    const cah = Math.cos(alpha / 2);
    const cf = ca / cah;
    const ash = p.a * Math.sin(alpha / 2);
    lattice = [v3(p.a * cah, -ash, 0), v3(p.a * cah, ash, 0), v3(p.a * cf, 0, p.a * Math.sqrt(1 - cf * cf))];
  }
  return { lattice, species, frac };
}

function crystalFamily(n: number): string {
  if (n <= 2) return 'triclinic';
  if (n <= 15) return 'monoclinic';
  if (n <= 74) return 'orthorhombic';
  if (n <= 142) return 'tetragonal';
  if (n <= 194) return 'hexagonal';
  return 'cubic';
}

type Path = { kpoints: Record<string, Vec3>; path: string[][]; name: string };
const G = '\\Gamma';
const S_ = '\\Sigma';

const cubic = (): Path => ({
  name: 'CUB',
  kpoints: { [G]: v3(0, 0, 0), X: v3(0, 0.5, 0), R: v3(0.5, 0.5, 0.5), M: v3(0.5, 0.5, 0) },
  path: [
    [G, 'X', 'M', G, 'R', 'X'],
    ['M', 'R'],
  ],
});
const fcc = (): Path => ({
  name: 'FCC',
  kpoints: {
    [G]: v3(0, 0, 0),
    K: v3(3 / 8, 3 / 8, 3 / 4),
    L: v3(0.5, 0.5, 0.5),
    U: v3(5 / 8, 1 / 4, 5 / 8),
    W: v3(0.5, 1 / 4, 3 / 4),
    X: v3(0.5, 0, 0.5),
  },
  path: [
    [G, 'X', 'W', 'K', G, 'L', 'U', 'W', 'L', 'K'],
    ['U', 'X'],
  ],
});
const bcc = (): Path => ({
  name: 'BCC',
  kpoints: { [G]: v3(0, 0, 0), H: v3(0.5, -0.5, 0.5), P: v3(0.25, 0.25, 0.25), N: v3(0, 0, 0.5) },
  path: [
    [G, 'H', 'N', G, 'P', 'H'],
    ['P', 'N'],
  ],
});
const tet = (): Path => ({
  name: 'TET',
  kpoints: {
    [G]: v3(0, 0, 0),
    A: v3(0.5, 0.5, 0.5),
    M: v3(0.5, 0.5, 0),
    R: v3(0, 0.5, 0.5),
    X: v3(0, 0.5, 0),
    Z: v3(0, 0, 0.5),
  },
  path: [
    [G, 'X', 'M', G, 'Z', 'R', 'A', 'Z'],
    ['X', 'R'],
    ['M', 'A'],
  ],
});
function bctet1(c: number, a: number): Path {
  const eta = (1 + (c * c) / (a * a)) / 4;
  return {
    name: 'BCT1',
    kpoints: {
      [G]: v3(0, 0, 0),
      M: v3(-0.5, 0.5, 0.5),
      N: v3(0, 0.5, 0),
      P: v3(0.25, 0.25, 0.25),
      X: v3(0, 0, 0.5),
      Z: v3(eta, eta, -eta),
      Z_1: v3(-eta, 1 - eta, eta),
    },
    path: [
      [G, 'X', 'M', G, 'Z', 'P', 'N', 'Z_1', 'M'],
      ['X', 'P'],
    ],
  };
}
function bctet2(c: number, a: number): Path {
  const eta = (1 + (a * a) / (c * c)) / 4;
  const zeta = (a * a) / (2 * c * c);
  return {
    name: 'BCT2',
    kpoints: {
      [G]: v3(0, 0, 0),
      N: v3(0, 0.5, 0),
      P: v3(0.25, 0.25, 0.25),
      [S_]: v3(-eta, eta, eta),
      [`${S_}_1`]: v3(eta, 1 - eta, -eta),
      X: v3(0, 0, 0.5),
      Y: v3(-zeta, zeta, 0.5),
      Y_1: v3(0.5, 0.5, -zeta),
      Z: v3(0.5, 0.5, -0.5),
    },
    path: [
      [G, 'X', 'Y', S_, G, 'Z', `${S_}_1`, 'N', 'P', 'Y_1', 'Z'],
      ['X', 'P'],
    ],
  };
}
const orc = (): Path => ({
  name: 'ORC',
  kpoints: {
    [G]: v3(0, 0, 0),
    R: v3(0.5, 0.5, 0.5),
    S: v3(0.5, 0.5, 0),
    T: v3(0, 0.5, 0.5),
    U: v3(0.5, 0, 0.5),
    X: v3(0.5, 0, 0),
    Y: v3(0, 0.5, 0),
    Z: v3(0, 0, 0.5),
  },
  path: [
    [G, 'X', 'S', 'Y', G, 'Z', 'U', 'R', 'T', 'Z'],
    ['Y', 'T'],
    ['U', 'X'],
    ['S', 'R'],
  ],
});
function orcf1(a: number, b: number, c: number): Path {
  const zeta = (1 + (a * a) / (b * b) - (a * a) / (c * c)) / 4;
  const eta = (1 + (a * a) / (b * b) + (a * a) / (c * c)) / 4;
  return {
    name: 'ORCF1',
    kpoints: {
      [G]: v3(0, 0, 0),
      A: v3(0.5, 0.5 + zeta, zeta),
      A_1: v3(0.5, 0.5 - zeta, 1 - zeta),
      L: v3(0.5, 0.5, 0.5),
      T: v3(1, 0.5, 0.5),
      X: v3(0, eta, eta),
      X_1: v3(1, 1 - eta, 1 - eta),
      Y: v3(0.5, 0, 0.5),
      Z: v3(0.5, 0.5, 0),
    },
    path: [
      [G, 'Y', 'T', 'Z', G, 'X', 'A_1', 'Y'],
      ['T', 'X_1'],
      ['X', 'A', 'Z'],
      ['L', G],
    ],
  };
}
function orcf2(a: number, b: number, c: number): Path {
  const phi = (1 + (c * c) / (b * b) - (c * c) / (a * a)) / 4;
  const eta = (1 + (a * a) / (b * b) - (a * a) / (c * c)) / 4;
  const delta = (1 + (b * b) / (a * a) - (b * b) / (c * c)) / 4;
  return {
    name: 'ORCF2',
    kpoints: {
      [G]: v3(0, 0, 0),
      C: v3(0.5, 0.5 - eta, 1 - eta),
      C_1: v3(0.5, 0.5 + eta, eta),
      D: v3(0.5 - delta, 0.5, 1 - delta),
      D_1: v3(0.5 + delta, 0.5, delta),
      L: v3(0.5, 0.5, 0.5),
      H: v3(1 - phi, 0.5 - phi, 0.5),
      H_1: v3(phi, 0.5 + phi, 0.5),
      X: v3(0, 0.5, 0.5),
      Y: v3(0.5, 0, 0.5),
      Z: v3(0.5, 0.5, 0),
    },
    path: [
      [G, 'Y', 'C', 'D', 'X', G, 'Z', 'D_1', 'H', 'C'],
      ['C_1', 'Z'],
      ['X', 'H_1'],
      ['H', 'Y'],
      ['L', G],
    ],
  };
}
function orcf3(a: number, b: number, c: number): Path {
  const zeta = (1 + (a * a) / (b * b) - (a * a) / (c * c)) / 4;
  const eta = (1 + (a * a) / (b * b) + (a * a) / (c * c)) / 4;
  return {
    name: 'ORCF3',
    kpoints: {
      [G]: v3(0, 0, 0),
      A: v3(0.5, 0.5 + zeta, zeta),
      A_1: v3(0.5, 0.5 - zeta, 1 - zeta),
      L: v3(0.5, 0.5, 0.5),
      T: v3(1, 0.5, 0.5),
      X: v3(0, eta, eta),
      X_1: v3(1, 1 - eta, 1 - eta),
      Y: v3(0.5, 0, 0.5),
      Z: v3(0.5, 0.5, 0),
    },
    path: [
      [G, 'Y', 'T', 'Z', G, 'X', 'A_1', 'Y'],
      ['X', 'A', 'Z'],
      ['L', G],
    ],
  };
}
function orci(a: number, b: number, c: number): Path {
  const zeta = (1 + (a * a) / (c * c)) / 4;
  const eta = (1 + (b * b) / (c * c)) / 4;
  const delta = (b * b - a * a) / (4 * c * c);
  const mu = (a * a + b * b) / (4 * c * c);
  return {
    name: 'ORCI',
    kpoints: {
      [G]: v3(0, 0, 0),
      L: v3(-mu, mu, 0.5 - delta),
      L_1: v3(mu, -mu, 0.5 + delta),
      L_2: v3(0.5 - delta, 0.5 + delta, -mu),
      R: v3(0, 0.5, 0),
      S: v3(0.5, 0, 0),
      T: v3(0, 0, 0.5),
      W: v3(0.25, 0.25, 0.25),
      X: v3(-zeta, zeta, zeta),
      X_1: v3(zeta, 1 - zeta, -zeta),
      Y: v3(eta, -eta, eta),
      Y_1: v3(1 - eta, eta, -eta),
      Z: v3(0.5, 0.5, -0.5),
    },
    path: [
      [G, 'X', 'L', 'T', 'W', 'R', 'X_1', 'Z', G, 'Y', 'S', 'W'],
      ['L_1', 'Y'],
      ['Y_1', 'Z'],
    ],
  };
}
function orcc(a: number, b: number): Path {
  const zeta = (1 + (a * a) / (b * b)) / 4;
  return {
    name: 'ORCC',
    kpoints: {
      [G]: v3(0, 0, 0),
      A: v3(zeta, zeta, 0.5),
      A_1: v3(-zeta, 1 - zeta, 0.5),
      R: v3(0, 0.5, 0.5),
      S: v3(0, 0.5, 0),
      T: v3(-0.5, 0.5, 0.5),
      X: v3(zeta, zeta, 0),
      X_1: v3(-zeta, 1 - zeta, 0),
      Y: v3(-0.5, 0.5, 0),
      Z: v3(0, 0, 0.5),
    },
    path: [
      [G, 'X', 'S', 'R', 'A', 'Z', G, 'Y', 'X_1', 'A_1', 'T', 'Y'],
      ['Z', 'T'],
    ],
  };
}
const hex = (): Path => ({
  name: 'HEX',
  kpoints: {
    [G]: v3(0, 0, 0),
    A: v3(0, 0, 0.5),
    H: v3(1 / 3, 1 / 3, 0.5),
    K: v3(1 / 3, 1 / 3, 0),
    L: v3(0.5, 0, 0.5),
    M: v3(0.5, 0, 0),
  },
  path: [
    [G, 'M', 'K', G, 'A', 'L', 'H', 'A'],
    ['L', 'M'],
    ['K', 'H'],
  ],
});
function rhl1(alpha: number): Path {
  const eta = (1 + 4 * Math.cos(alpha)) / (2 + 4 * Math.cos(alpha));
  const nu = 3 / 4 - eta / 2;
  return {
    name: 'RHL1',
    kpoints: {
      [G]: v3(0, 0, 0),
      B: v3(eta, 0.5, 1 - eta),
      B_1: v3(0.5, 1 - eta, eta - 1),
      F: v3(0.5, 0.5, 0),
      L: v3(0.5, 0, 0),
      L_1: v3(0, 0, -0.5),
      P: v3(eta, nu, nu),
      P_1: v3(1 - nu, 1 - nu, 1 - eta),
      P_2: v3(nu, nu, eta - 1),
      Q: v3(1 - nu, nu, 0),
      X: v3(nu, 0, -nu),
      Z: v3(0.5, 0.5, 0.5),
    },
    path: [
      [G, 'L', 'B_1'],
      ['B', 'Z', G, 'X'],
      ['Q', 'F', 'P_1', 'Z'],
      ['L', 'P'],
    ],
  };
}
function rhl2(alpha: number): Path {
  const eta = 1 / (2 * Math.tan(alpha / 2) ** 2);
  const nu = 3 / 4 - eta / 2;
  return {
    name: 'RHL2',
    kpoints: {
      [G]: v3(0, 0, 0),
      F: v3(0.5, -0.5, 0),
      L: v3(0.5, 0, 0),
      P: v3(1 - nu, -nu, 1 - nu),
      P_1: v3(nu, nu - 1, nu - 1),
      Q: v3(eta, eta, eta),
      Q_1: v3(1 - eta, -eta, -eta),
      Z: v3(0.5, -0.5, 0.5),
    },
    path: [[G, 'P', 'Z', 'Q', G, 'F', 'P_1', 'Q_1', 'L', 'Z']],
  };
}
function mcl(b: number, c: number, beta: number): Path {
  const eta = (1 - (b * Math.cos(beta)) / c) / (2 * Math.sin(beta) ** 2);
  const nu = 0.5 - (eta * c * Math.cos(beta)) / b;
  return {
    name: 'MCL',
    kpoints: {
      [G]: v3(0, 0, 0),
      A: v3(0.5, 0.5, 0),
      C: v3(0, 0.5, 0.5),
      D: v3(0.5, 0, 0.5),
      D_1: v3(0.5, 0, -0.5),
      E: v3(0.5, 0.5, 0.5),
      H: v3(0, eta, 1 - nu),
      H_1: v3(0, 1 - eta, nu),
      H_2: v3(0, eta, -nu),
      M: v3(0.5, eta, 1 - nu),
      M_1: v3(0.5, 1 - eta, nu),
      M_2: v3(0.5, eta, -nu),
      X: v3(0, 0.5, 0),
      Y: v3(0, 0, 0.5),
      Y_1: v3(0, 0, -0.5),
      Z: v3(0.5, 0, 0),
    },
    path: [
      [G, 'Y', 'H', 'C', 'E', 'M_1', 'A', 'X', 'H_1'],
      ['M', 'D', 'Z'],
      ['Y', 'D'],
    ],
  };
}
function mclc1(a: number, b: number, c: number, alpha: number, variant: 'mclc1' | 'mclc2'): Path {
  const sa = Math.sin(alpha);
  const ca = Math.cos(alpha);
  const zeta = (2 - (b * ca) / c) / (4 * sa * sa);
  const eta = 0.5 + (2 * zeta * c * ca) / b;
  const psi = 0.75 - (a * a) / (4 * b * b * sa * sa);
  const phi = psi + (0.75 - psi) * ((b * ca) / c);
  const kpoints: Record<string, Vec3> = {
    [G]: v3(0, 0, 0),
    N: v3(0.5, 0, 0),
    N_1: v3(0, -0.5, 0),
    F: v3(1 - zeta, 1 - zeta, 1 - eta),
    F_1: v3(zeta, zeta, eta),
    F_2: v3(-zeta, -zeta, 1 - eta),
  };
  if (variant === 'mclc2') kpoints['F_3'] = v3(1 - zeta, -zeta, 1 - eta);
  Object.assign(kpoints, {
    I: v3(phi, 1 - phi, 0.5),
    I_1: v3(1 - phi, phi - 1, 0.5),
    L: v3(0.5, 0.5, 0.5),
    M: v3(0.5, 0, 0.5),
    X: v3(1 - psi, psi - 1, 0),
    X_1: v3(psi, 1 - psi, 0),
    X_2: v3(psi - 1, -psi, 0),
    Y: v3(0.5, 0.5, 0),
    Y_1: v3(-0.5, -0.5, 0),
    Z: v3(0, 0, 0.5),
  });
  return variant === 'mclc1'
    ? {
        name: 'MCLC1',
        kpoints,
        path: [
          [G, 'Y', 'F', 'L', 'I'],
          ['I_1', 'Z', 'F_1'],
          ['Y', 'X_1'],
          ['X', G, 'N'],
          ['M', G],
        ],
      }
    : {
        name: 'MCLC2',
        kpoints,
        path: [
          [G, 'Y', 'F', 'L', 'I'],
          ['I_1', 'Z', 'F_1'],
          ['N', G, 'M'],
        ],
      };
}
function mclc34(a: number, b: number, c: number, alpha: number, variant: 'mclc3' | 'mclc4'): Path {
  const sa = Math.sin(alpha);
  const ca = Math.cos(alpha);
  const mu = (1 + (b * b) / (a * a)) / 4;
  const delta = (b * c * ca) / (2 * a * a);
  const zeta = mu - 0.25 + (1 - (b * ca) / c) / (4 * sa * sa);
  const eta = 0.5 + (2 * zeta * c * ca) / b;
  const phi = 1 + zeta - 2 * mu;
  const psi = eta - 2 * delta;
  const kpoints: Record<string, Vec3> = {
    [G]: v3(0, 0, 0),
    F: v3(1 - phi, 1 - phi, 1 - psi),
    F_1: v3(phi, phi - 1, psi),
    F_2: v3(1 - phi, -phi, 1 - psi),
    H: v3(zeta, zeta, eta),
    H_1: v3(1 - zeta, -zeta, 1 - eta),
    H_2: v3(-zeta, -zeta, 1 - eta),
    I: v3(0.5, -0.5, 0.5),
    M: v3(0.5, 0, 0.5),
    N: v3(0.5, 0, 0),
    N_1: v3(0, -0.5, 0),
    X: v3(0.5, -0.5, 0),
    Y: v3(mu, mu, delta),
    Y_1: v3(1 - mu, -mu, -delta),
    Y_2: v3(-mu, -mu, -delta),
    Y_3: v3(mu, mu - 1, delta),
    Z: v3(0, 0, 0.5),
  };
  return variant === 'mclc3'
    ? {
        name: 'MCLC3',
        kpoints,
        path: [
          [G, 'Y', 'F', 'H', 'Z', 'I', 'F_1'],
          ['H_1', 'Y_1', 'X', G, 'N'],
          ['M', G],
        ],
      }
    : {
        name: 'MCLC4',
        kpoints,
        path: [
          [G, 'Y', 'F', 'H', 'Z', 'I'],
          ['H_1', 'Y_1', 'X', G, 'N'],
          ['M', G],
        ],
      };
}
function mclc5(a: number, b: number, c: number, alpha: number): Path {
  const sa = Math.sin(alpha);
  const ca = Math.cos(alpha);
  const zeta = ((b * b) / (a * a) + (1 - (b * ca) / c) / (sa * sa)) / 4;
  const eta = 0.5 + (2 * zeta * c * ca) / b;
  const mu = eta / 2 + (b * b) / (4 * a * a) - (b * c * ca) / (2 * a * a);
  const nu = 2 * mu - zeta;
  const rho = 1 - (zeta * a * a) / (b * b);
  const omega = ((4 * nu - 1 - (b * b * sa * sa) / (a * a)) * c) / (2 * b * ca);
  const delta = (zeta * c * ca) / b + omega / 2 - 0.25;
  return {
    name: 'MCLC5',
    kpoints: {
      [G]: v3(0, 0, 0),
      F: v3(nu, nu, omega),
      F_1: v3(1 - nu, 1 - nu, 1 - omega),
      F_2: v3(nu, nu - 1, omega),
      H: v3(zeta, zeta, eta),
      H_1: v3(1 - zeta, -zeta, 1 - eta),
      H_2: v3(-zeta, -zeta, 1 - eta),
      I: v3(rho, 1 - rho, 0.5),
      I_1: v3(1 - rho, rho - 1, 0.5),
      L: v3(0.5, 0.5, 0.5),
      M: v3(0.5, 0, 0.5),
      N: v3(0.5, 0, 0),
      N_1: v3(0, -0.5, 0),
      X: v3(0.5, -0.5, 0),
      Y: v3(mu, mu, delta),
      Y_1: v3(1 - mu, -mu, -delta),
      Y_2: v3(-mu, -mu, -delta),
      Y_3: v3(mu, mu - 1, delta),
      Z: v3(0, 0, 0.5),
    },
    path: [
      [G, 'Y', 'F', 'L', 'I'],
      ['I_1', 'Z', 'H', 'F_1'],
      ['H_1', 'Y_1', 'X', G, 'N'],
      ['M', G],
    ],
  };
}
const tria = (): Path => ({
  name: 'TRI1a',
  kpoints: {
    [G]: v3(0, 0, 0),
    L: v3(0.5, 0.5, 0),
    M: v3(0, 0.5, 0.5),
    N: v3(0.5, 0, 0.5),
    R: v3(0.5, 0.5, 0.5),
    X: v3(0.5, 0, 0),
    Y: v3(0, 0.5, 0),
    Z: v3(0, 0, 0.5),
  },
  path: [
    ['X', G, 'Y'],
    ['L', G, 'Z'],
    ['N', G, 'M'],
    ['R', G],
  ],
});
const trib = (): Path => ({
  name: 'TRI1b',
  kpoints: {
    [G]: v3(0, 0, 0),
    L: v3(0.5, -0.5, 0),
    M: v3(0, 0, 0.5),
    N: v3(-0.5, -0.5, 0.5),
    R: v3(0, -0.5, 0.5),
    X: v3(0, -0.5, 0),
    Y: v3(0.5, 0, 0),
    Z: v3(-0.5, 0, 0.5),
  },
  path: [
    ['X', G, 'Y'],
    ['L', G, 'Z'],
    ['N', G, 'M'],
    ['R', G],
  ],
});

const NAME_TO_ID: Record<string, ScVariantId> = {
  CUB: 'cubic',
  FCC: 'fcc',
  BCC: 'bcc',
  TET: 'tet',
  BCT1: 'bctet1',
  BCT2: 'bctet2',
  ORC: 'orc',
  ORCF1: 'orcf1',
  ORCF2: 'orcf2',
  ORCF3: 'orcf3',
  ORCI: 'orci',
  ORCC: 'orcc',
  HEX: 'hex',
  RHL1: 'rhl1',
  RHL2: 'rhl2',
  MCL: 'mcl',
  MCLC1: 'mclc1',
  MCLC2: 'mclc2',
  MCLC3: 'mclc3',
  MCLC4: 'mclc4',
  MCLC5: 'mclc5',
  TRI1a: 'tria',
  TRI1b: 'trib',
};

/** Setyawan-Curtarolo path from a symmetry analysis made with `setting: 'Spglib'`. */
export function setyawanPath(sym: SymmetryResult, opts: SetyawanOptions = {}): SetyawanResult {
  if (sym.setting !== 'Spglib')
    throw new RangeError(
      "setyawanPath needs a symmetry analysis made with setting 'Spglib' (the idealised conventional cell of spglib).",
    );
  const eps = opts.boundaryTol ?? 1e-8;
  const symbol = sym.hmSymbol.replace(/\s+/g, '');
  const latticeType = symbol.startsWith('R') ? 'rhombohedral' : crystalFamily(sym.number);
  const conv = conventionalStandard(sym, latticeType, symbol);
  const prim = primitiveStandard(conv, symbol, latticeType);
  const rec = reciprocalLattice(prim.lattice);
  const [a, b, c] = lens(conv.lattice);
  const cp = latticeParameters(conv.lattice);
  const rp = latticeParameters(rec);
  const warnings: string[] = [];
  const bad = (): never => {
    throw new RangeError(`Unexpected space group symbol ${symbol} for a ${latticeType} lattice.`);
  };
  let p: Path;
  if (latticeType === 'cubic') {
    if (symbol.includes('P')) p = cubic();
    else if (symbol.includes('F')) p = fcc();
    else if (symbol.includes('I')) p = bcc();
    else p = bad();
  } else if (latticeType === 'tetragonal') {
    if (symbol.includes('P')) p = tet();
    else if (symbol.includes('I')) p = c < a ? bctet1(c, a) : bctet2(c, a);
    else p = bad();
  } else if (latticeType === 'orthorhombic') {
    if (symbol.includes('P')) p = orc();
    else if (symbol.includes('F')) {
      const l = 1 / (a * a);
      const r = 1 / (b * b) + 1 / (c * c);
      if (Math.abs(l - r) <= eps * Math.max(l, r)) p = orcf3(a, b, c);
      else p = l > r ? orcf1(a, b, c) : orcf2(a, b, c);
    } else if (symbol.includes('I')) p = orci(a, b, c);
    else if (symbol.includes('C') || symbol.includes('A')) p = orcc(a, b);
    else p = bad();
  } else if (latticeType === 'hexagonal') {
    p = hex();
  } else if (latticeType === 'rhombohedral') {
    const alpha = latticeParameters(prim.lattice).alpha;
    p = alpha < 90 ? rhl1(alpha * DEG) : rhl2(alpha * DEG);
  } else if (latticeType === 'monoclinic') {
    const alpha = cp.alpha * DEG;
    if (symbol.includes('P')) p = mcl(b, c, alpha);
    else if (symbol.includes('C')) {
      const kg = rp.gamma;
      const t = (b * Math.cos(alpha)) / c + (b * b * Math.sin(alpha) ** 2) / (a * a);
      if (Math.abs(kg - 90) <= eps * 90) p = mclc1(a, b, c, alpha, 'mclc2');
      else if (kg > 90) p = mclc1(a, b, c, alpha, 'mclc1');
      else if (Math.abs(t - 1) <= eps) p = mclc34(a, b, c, alpha, 'mclc4');
      else if (t < 1) p = mclc34(a, b, c, alpha, 'mclc3');
      else p = mclc5(a, b, c, alpha);
    } else p = bad();
  } else {
    const { alpha, beta, gamma } = rp;
    if (alpha > 90 && beta > 90 && gamma >= 90) p = tria();
    else if (alpha < 90 && beta < 90 && gamma <= 90) p = trib();
    else
      throw new RangeError(
        'The reciprocal angles of this triclinic cell fit neither TRI1a nor TRI1b (Setyawan-Curtarolo leave this case open).',
      );
  }
  const pairs: [string, string][] = [];
  for (const seg of p.path) for (let i = 0; i + 1 < seg.length; i++) pairs.push([seg[i]!, seg[i + 1]!]);
  const id = NAME_TO_ID[p.name]!;
  return {
    convention: 'Setyawan-Curtarolo',
    variantId: id,
    variant: p.name,
    latticeType,
    spacegroupNumber: sym.number,
    spacegroupInternational: sym.hmSymbol,
    pointCoords: p.kpoints,
    pathSegments: p.path,
    path: pairs,
    warnings,
    convLattice: conv.lattice,
    convSpecies: conv.species,
    convFrac: conv.frac,
    primitiveLattice: prim.lattice,
    primitiveSpecies: prim.species,
    primitiveFrac: prim.frac,
    reciprocalPrimitive: rec,
  };
}
