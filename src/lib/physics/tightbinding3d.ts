// Nearest-neighbour (and, for fcc, second-neighbour) tight-binding s bands on the cubic Bravais lattices, a two-band toy
// insulator built from two such bands with a constant on-site mixing, k-paths through the first Brillouin zone, and a
// density of states on a uniform mesh by Gaussian broadening or by the linear tetrahedron method. Pure, no DOM.
//
// Closed forms (lattice constant a of the conventional cube, hopping t > 0 so the band bottom is at Gamma):
//   sc   E = e0 - 2 t1 (cos kx a + cos ky a + cos kz a)                       range [e0 - 6 t1, e0 + 6 t1]
//   bcc  E = e0 - 8 t1 cos(kx a/2) cos(ky a/2) cos(kz a/2)                     range [e0 - 8 t1, e0 + 8 t1]
//   fcc  E = e0 - 4 t1 (cx cy + cy cz + cz cx) - 2 t2 (cos kx a + cos ky a + cos kz a),  c = cos(k a / 2)
//        with t2 = 0: range [e0 - 12 t1, e0 + 4 t1]
// @source S-036 (Ashcroft and Mermin, chapter 10: tight-binding s bands of the cubic lattices), S-050 (Kittel)
// @source S-005 (Setyawan and Curtarolo: the special points Gamma, X, M, R, H, N, P, W, K, L, U and the paths)
// @source S-017 (Blochl, Jepsen, Andersen: linear tetrahedron DOS), S-019 (VASP wiki ISMEAR, NEDOS)

export type CubicLattice = 'sc' | 'bcc' | 'fcc';
export type K3 = [number, number, number];

export interface Band {
  lattice: CubicLattice;
  /** Conventional cubic lattice constant in Angstrom. */
  a: number;
  /** On-site energy in eV. */
  e0: number;
  /** Nearest-neighbour hopping in eV (positive: band minimum at Gamma). */
  t1: number;
  /** fcc second-neighbour hopping in eV (neighbours at a along the cube axes); ignored for sc and bcc. */
  t2?: number;
}

/** E(k) of one s band, k Cartesian in 1/Angstrom (with the 2 pi). */
export function bandEnergy(b: Band, k: readonly number[]): number {
  const [kx, ky, kz] = [k[0]!, k[1]!, k[2]!];
  const a = b.a;
  if (b.lattice === 'sc') return b.e0 - 2 * b.t1 * (Math.cos(kx * a) + Math.cos(ky * a) + Math.cos(kz * a));
  if (b.lattice === 'bcc')
    return b.e0 - 8 * b.t1 * Math.cos((kx * a) / 2) * Math.cos((ky * a) / 2) * Math.cos((kz * a) / 2);
  const cx = Math.cos((kx * a) / 2);
  const cy = Math.cos((ky * a) / 2);
  const cz = Math.cos((kz * a) / 2);
  const t2 = b.t2 ?? 0;
  const g = t2 ? Math.cos(kx * a) + Math.cos(ky * a) + Math.cos(kz * a) : 0;
  return b.e0 - 4 * b.t1 * (cx * cy + cy * cz + cz * cx) - 2 * t2 * g;
}

/** Primitive lattice vectors (rows, Angstrom) of the cubic Bravais lattice with conventional constant a. */
export function primitiveLattice(
  lattice: CubicLattice,
  a: number,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const h = a / 2;
  if (lattice === 'sc')
    return [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, a],
    ];
  if (lattice === 'bcc')
    return [
      [-h, h, h],
      [h, -h, h],
      [h, h, -h],
    ];
  return [
    [0, h, h],
    [h, 0, h],
    [h, h, 0],
  ];
}

/** Reciprocal rows with 2 pi (b_i . a_j = 2 pi delta_ij). */
export function reciprocalRows(rows: readonly (readonly number[])[]): K3[] {
  const [a1, a2, a3] = rows as [number[], number[], number[]];
  const cr = (u: readonly number[], v: readonly number[]): K3 => [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  const c23 = cr(a2, a3);
  const vol = a1[0]! * c23[0] + a1[1]! * c23[1] + a1[2]! * c23[2];
  const f = (2 * Math.PI) / vol;
  return [c23, cr(a3, a1), cr(a1, a2)].map((v) => [v[0] * f, v[1] * f, v[2] * f] as K3);
}

/** Special points in Cartesian units of 2 pi / a (Setyawan and Curtarolo, S-005). */
export const SPECIAL_POINTS: Record<CubicLattice, Record<string, K3>> = {
  sc: { G: [0, 0, 0], X: [0, 0.5, 0], M: [0.5, 0.5, 0], R: [0.5, 0.5, 0.5] },
  bcc: { G: [0, 0, 0], H: [0, 0, 1], N: [0.5, 0.5, 0], P: [0.5, 0.5, 0.5] },
  fcc: {
    G: [0, 0, 0],
    X: [0, 1, 0],
    W: [0.5, 1, 0],
    K: [0.75, 0.75, 0],
    L: [0.5, 0.5, 0.5],
    U: [0.25, 1, 0.25],
  },
};

/** The continuous paths used by the band scene (a common subset of the standard paths, S-005). */
export const PATHS: Record<CubicLattice, string[]> = {
  sc: ['G', 'X', 'M', 'G', 'R', 'X'],
  bcc: ['G', 'H', 'N', 'G', 'P', 'H'],
  fcc: ['G', 'X', 'W', 'K', 'G', 'L', 'U', 'W', 'L', 'K'],
};

export const pointLabel = (p: string): string => (p === 'G' ? 'Gamma' : p);

export interface KPath {
  /** Cartesian k-points in 1/Angstrom. */
  k: K3[];
  /** Accumulated path length in 1/Angstrom. */
  s: number[];
  /** Index into k of each special point, with its label. */
  ticks: { label: string; index: number; s: number }[];
  length: number;
}

/** Sample a path of special points with about `n` points in total, spaced evenly in |k|. */
export function kPath(lattice: CubicLattice, a: number, n = 240): KPath {
  const pts = PATHS[lattice].map((p) => {
    const f = SPECIAL_POINTS[lattice][p]!;
    const u = (2 * Math.PI) / a;
    return { label: p, k: [f[0] * u, f[1] * u, f[2] * u] as K3 };
  });
  const segLen = pts.slice(1).map((p, i) => Math.hypot(...sub3(p.k, pts[i]!.k)));
  const total = segLen.reduce((x, y) => x + y, 0);
  const k: K3[] = [pts[0]!.k];
  const s: number[] = [0];
  const ticks = [{ label: pts[0]!.label, index: 0, s: 0 }];
  let acc = 0;
  for (let i = 0; i < segLen.length; i++) {
    const m = Math.max(2, Math.round((n * segLen[i]!) / total));
    const [p, q] = [pts[i]!.k, pts[i + 1]!.k];
    for (let j = 1; j <= m; j++) {
      const t = j / m;
      k.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
      s.push(acc + segLen[i]! * t);
    }
    acc += segLen[i]!;
    ticks.push({ label: pts[i + 1]!.label, index: k.length - 1, s: acc });
  }
  return { k, s, ticks, length: total };
}

const sub3 = (p: readonly number[], q: readonly number[]): K3 => [
  p[0]! - q[0]!,
  p[1]! - q[1]!,
  p[2]! - q[2]!,
];

/**
 * Two bands with a constant on-site mixing V between their orbitals: H = [[Ev, V], [V, Ec]].
 * Returns the lower and upper eigenvalue and the weight of orbital 2 (the conduction-like orbital) in each.
 */
export function twoBand(
  ev: number,
  ec: number,
  v: number,
): { lo: number; hi: number; w2lo: number; w2hi: number } {
  const m = (ev + ec) / 2;
  const d = (ec - ev) / 2;
  const r = Math.hypot(d, v);
  if (r === 0) return { lo: m, hi: m, w2lo: 0.5, w2hi: 0.5 };
  // upper eigenvector weight on orbital 2: (1 + d / r) / 2
  const w2hi = 0.5 * (1 + d / r);
  return { lo: m - r, hi: m + r, w2lo: 1 - w2hi, w2hi };
}

export interface BandModel {
  id: string;
  label: string;
  lattice: CubicLattice;
  a: number;
  /** One band (a metal) or a valence and a conduction band mixed by V. */
  bands: Band[];
  /** Electrons per cell per spin: 0.5 for a half-filled band, 1 for a filled valence band. */
  filling: number;
}

/** Hoppings and energies chosen for teaching (eV); not a fit to any material. */
export const MODELS: BandModel[] = [
  {
    id: 'fcc-metal',
    label: 'fcc metal (one s band, half filled)',
    lattice: 'fcc',
    a: 3.61,
    bands: [{ lattice: 'fcc', a: 3.61, e0: 0, t1: 0.5 }],
    filling: 0.5,
  },
  {
    id: 'bcc-metal',
    label: 'bcc metal (one s band, half filled)',
    lattice: 'bcc',
    a: 2.87,
    bands: [{ lattice: 'bcc', a: 2.87, e0: 0, t1: 0.5 }],
    filling: 0.5,
  },
  {
    id: 'sc-metal',
    label: 'sc metal (one s band, half filled)',
    lattice: 'sc',
    a: 3.35,
    bands: [{ lattice: 'sc', a: 3.35, e0: 0, t1: 0.5 }],
    filling: 0.5,
  },
  {
    id: 'fcc-direct',
    label: 'fcc insulator, direct gap at Gamma',
    lattice: 'fcc',
    a: 5.43,
    // valence: maximum 0 eV at Gamma; conduction: minimum 1.5 eV at Gamma
    bands: [
      { lattice: 'fcc', a: 5.43, e0: -12 * 0.3, t1: -0.3 },
      { lattice: 'fcc', a: 5.43, e0: 1.5 + 12 * 0.4, t1: 0.4 },
    ],
    filling: 1,
  },
  {
    id: 'fcc-indirect',
    label: 'fcc insulator, indirect gap Gamma to L',
    lattice: 'fcc',
    a: 5.43,
    // valence as above; conduction from second-neighbour hopping only: minimum 1.2 eV at L, 3.6 eV at Gamma
    bands: [
      { lattice: 'fcc', a: 5.43, e0: -12 * 0.3, t1: -0.3 },
      { lattice: 'fcc', a: 5.43, e0: 1.2 + 3 * 0.4, t1: 0, t2: -0.2 },
    ],
    filling: 1,
  },
];

export const modelById = (id: string): BandModel => MODELS.find((m) => m.id === id) ?? MODELS[0]!;

/** Eigenvalues (ascending) at k, and the weight of orbital 2 in each, for a model with mixing V (eV). */
export function modelBands(m: BandModel, k: readonly number[], v = 0): { e: number[]; w2: number[] } {
  if (m.bands.length === 1) return { e: [bandEnergy(m.bands[0]!, k)], w2: [0] };
  const r = twoBand(bandEnergy(m.bands[0]!, k), bandEnergy(m.bands[1]!, k), v);
  return { e: [r.lo, r.hi], w2: [r.w2lo, r.w2hi] };
}

/** Eigenvalues on the full Gamma-centred N x N x N mesh of the primitive reciprocal cell, one array per band. */
export function meshEigenvalues(m: BandModel, n: number, v = 0): Float64Array[] {
  const rec = reciprocalRows(primitiveLattice(m.lattice, m.a));
  const nb = m.bands.length;
  const out = Array.from({ length: nb }, () => new Float64Array(n * n * n));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < n; l++) {
        const k: K3 = [0, 0, 0];
        for (let c = 0; c < 3; c++) k[c] = (i * rec[0]![c]! + j * rec[1]![c]! + l * rec[2]![c]!) / n;
        const { e } = modelBands(m, k, v);
        const idx = i + n * (j + n * l);
        for (let b = 0; b < nb; b++) out[b]![idx] = e[b]!;
      }
  return out;
}

/** Energy grid of NEDOS points from emin to emax (VASP's spacing (EMAX - EMIN) / (NEDOS - 1), S-019). */
export function energyGrid(emin: number, emax: number, nedos: number): number[] {
  if (!(nedos >= 2)) throw new RangeError('NEDOS must be at least 2');
  return Array.from({ length: nedos }, (_, i) => emin + ((emax - emin) * i) / (nedos - 1));
}

/**
 * Gaussian-broadened DOS (states per eV per cell per spin) of equally weighted eigenvalues, delta(x) = exp(-x^2)/sqrt(pi)
 * with x = (E - e) / sigma, the ISMEAR = 0 form (S-019). Repeated eigenvalues are grouped first.
 */
export function gaussianDos(
  eigs: readonly ArrayLike<number>[],
  grid: readonly number[],
  sigma: number,
): number[] {
  if (!(sigma > 0)) throw new RangeError('sigma must be positive');
  const counts = new Map<number, number>();
  for (const band of eigs)
    for (let i = 0; i < band.length; i++) {
      const key = Math.round(band[i]! * 1e9) / 1e9;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const total = eigs.length ? eigs[0]!.length : 1;
  const out = new Array<number>(grid.length).fill(0);
  const e0 = grid[0]!;
  const de = grid.length > 1 ? grid[1]! - e0 : 1;
  const reach = 6 * sigma;
  const norm = 1 / (sigma * Math.sqrt(Math.PI) * total);
  for (const [e, c] of counts) {
    const i0 = Math.max(0, Math.ceil((e - reach - e0) / de));
    const i1 = Math.min(grid.length - 1, Math.floor((e + reach - e0) / de));
    for (let i = i0; i <= i1; i++) {
      const x = (grid[i]! - e) / sigma;
      out[i] = out[i]! + c * norm * Math.exp(-x * x);
    }
  }
  return out;
}

/** Linear-tetrahedron DOS and number of states of one tetrahedron with corner energies e (any order), unit volume. */
export function tetraDos(e: readonly number[], E: number): { g: number; n: number } {
  const [e1, e2, e3, e4] = [...e].sort((x, y) => x - y) as [number, number, number, number];
  const eps = 1e-14;
  const d = (x: number) => (Math.abs(x) < eps ? (x < 0 ? -eps : eps) : x);
  if (E <= e1) return { g: 0, n: 0 };
  if (E >= e4) return { g: 0, n: 1 };
  const e21 = d(e2 - e1);
  const e31 = d(e3 - e1);
  const e41 = d(e4 - e1);
  const e32 = d(e3 - e2);
  const e42 = d(e4 - e2);
  const e43 = d(e4 - e3);
  if (E < e2) {
    const x = E - e1;
    return { g: (3 * x * x) / (e21 * e31 * e41), n: (x * x * x) / (e21 * e31 * e41) };
  }
  if (E < e3) {
    const x = E - e2;
    const g = (3 * e21 + 6 * x - (3 * (e31 + e42) * x * x) / (e32 * e42)) / (e31 * e41);
    const n = (e21 * e21 + 3 * e21 * x + 3 * x * x - ((e31 + e42) * x * x * x) / (e32 * e42)) / (e31 * e41);
    return { g, n };
  }
  const x = e4 - E;
  return { g: (3 * x * x) / (e41 * e42 * e43), n: 1 - (x * x * x) / (e41 * e42 * e43) };
}

/** The six tetrahedra of a cube that share its main diagonal (corner offsets in i, j, l). */
const CUBE: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const TETS: [number, number, number, number][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

/** Linear-tetrahedron DOS (states per eV per cell per spin) from mesh eigenvalues on the periodic N^3 mesh (S-017). */
export function tetrahedronDos(
  eigs: readonly ArrayLike<number>[],
  n: number,
  grid: readonly number[],
): number[] {
  const out = new Array<number>(grid.length).fill(0);
  const e0 = grid[0]!;
  const de = grid.length > 1 ? grid[1]! - e0 : 1;
  const w = 1 / (6 * n * n * n);
  const id = (i: number, j: number, l: number) => (i % n) + n * ((j % n) + n * (l % n));
  for (const band of eigs)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let l = 0; l < n; l++)
          for (const t of TETS) {
            const o0 = CUBE[t[0]]!;
            const o1 = CUBE[t[1]]!;
            const o2 = CUBE[t[2]]!;
            const o3 = CUBE[t[3]]!;
            // sort the four corner energies once (a five-comparison network), then evaluate tetraDos inline
            let e1 = band[id(i + o0[0], j + o0[1], l + o0[2])]!;
            let e2 = band[id(i + o1[0], j + o1[1], l + o1[2])]!;
            let e3 = band[id(i + o2[0], j + o2[1], l + o2[2])]!;
            let e4 = band[id(i + o3[0], j + o3[1], l + o3[2])]!;
            let tmp: number;
            if (e1 > e2) {
              tmp = e1;
              e1 = e2;
              e2 = tmp;
            }
            if (e3 > e4) {
              tmp = e3;
              e3 = e4;
              e4 = tmp;
            }
            if (e1 > e3) {
              tmp = e1;
              e1 = e3;
              e3 = tmp;
            }
            if (e2 > e4) {
              tmp = e2;
              e2 = e4;
              e4 = tmp;
            }
            if (e2 > e3) {
              tmp = e2;
              e2 = e3;
              e3 = tmp;
            }
            const i0 = Math.max(0, Math.ceil((e1 - e0) / de));
            const i1 = Math.min(grid.length - 1, Math.floor((e4 - e0) / de));
            if (i1 < i0) continue;
            const e21 = Math.max(e2 - e1, 1e-14);
            const e31 = Math.max(e3 - e1, 1e-14);
            const e41 = Math.max(e4 - e1, 1e-14);
            const e32 = Math.max(e3 - e2, 1e-14);
            const e42 = Math.max(e4 - e2, 1e-14);
            const e43 = Math.max(e4 - e3, 1e-14);
            const a1 = (3 * w) / (e21 * e31 * e41);
            const b0 = w / (e31 * e41);
            const b2 = (3 * (e31 + e42)) / (e32 * e42);
            const a3 = (3 * w) / (e41 * e42 * e43);
            for (let k = i0; k <= i1; k++) {
              const E = grid[k]!;
              let g: number;
              if (E <= e1 || E >= e4) g = 0;
              else if (E < e2) g = a1 * (E - e1) * (E - e1);
              else if (E < e3) {
                const x = E - e2;
                g = b0 * (3 * e21 + 6 * x - b2 * x * x);
              } else g = a3 * (e4 - E) * (e4 - E);
              out[k] = out[k]! + g;
            }
          }
  return out;
}

/** Trapezoid integral of a sampled function on a grid. */
export function trapz(y: readonly number[], x: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < x.length; i++) s += 0.5 * (y[i]! + y[i - 1]!) * (x[i]! - x[i - 1]!);
  return s;
}

/** The Fermi level of a metal at the given filling (states per cell per spin) from mesh eigenvalues: a sorted count. */
export function fermiLevel(eigs: readonly ArrayLike<number>[], filling: number): number {
  const all: number[] = [];
  for (const b of eigs) for (let i = 0; i < b.length; i++) all.push(b[i]!);
  all.sort((x, y) => x - y);
  const perBand = eigs.length ? eigs[0]!.length : 1;
  const idx = filling * perBand;
  const lo = Math.max(0, Math.floor(idx) - 1);
  const hi = Math.min(all.length - 1, Math.ceil(idx));
  return 0.5 * (all[lo]! + all[hi]!);
}

/** True when k (Cartesian) lies in the first Brillouin zone: k . G <= |G|^2 / 2 for the short reciprocal vectors. */
export function inFirstZone(rec: readonly K3[], k: readonly number[], tol = 1e-9): boolean {
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let l = -2; l <= 2; l++) {
        if (!i && !j && !l) continue;
        const g = [0, 1, 2].map((c) => i * rec[0]![c]! + j * rec[1]![c]! + l * rec[2]![c]!);
        const gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
        if (k[0]! * g[0]! + k[1]! * g[1]! + k[2]! * g[2]! > gg / 2 + tol) return false;
      }
  return true;
}

/**
 * The polygon where the plane kz = 0 cuts the first zone, counter-clockwise, by clipping a large square with the
 * half-planes k . G <= |G|^2 / 2 (Sutherland-Hodgman).
 */
export function zoneSliceKz0(rec: readonly K3[]): [number, number][] {
  const big = 50;
  let poly: [number, number][] = [
    [-big, -big],
    [big, -big],
    [big, big],
    [-big, big],
  ];
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let l = -2; l <= 2; l++) {
        if (!i && !j && !l) continue;
        const g = [0, 1, 2].map((c) => i * rec[0]![c]! + j * rec[1]![c]! + l * rec[2]![c]!);
        const gg = (g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!) / 2;
        const [gx, gy] = [g[0]!, g[1]!];
        if (Math.hypot(gx, gy) < 1e-12) continue;
        const f = (p: [number, number]) => p[0] * gx + p[1] * gy - gg;
        const next: [number, number][] = [];
        for (let q = 0; q < poly.length; q++) {
          const A = poly[q]!;
          const B = poly[(q + 1) % poly.length]!;
          const fa = f(A);
          const fb = f(B);
          if (fa <= 0) next.push(A);
          if (fa * fb < 0) {
            const t = fa / (fa - fb);
            next.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
          }
        }
        poly = next;
      }
  // drop repeated vertices (a clip line through a vertex can add it twice) and vertices on a straight edge
  const out: [number, number][] = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p);
  }
  while (
    out.length > 1 &&
    Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) <= 1e-9
  )
    out.pop();
  return out.filter((p, i) => {
    const a = out[(i + out.length - 1) % out.length]!;
    const b = out[(i + 1) % out.length]!;
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9;
  });
}
