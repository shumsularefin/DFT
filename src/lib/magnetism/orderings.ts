// Collinear magnetic orderings on a magnetic sublattice (M13.1, D-056, D-059).
// @source S-058 (Wollan-Koehler names: A-type ferromagnetic planes stacked antiferromagnetically; C-type
//   antiferromagnetic planes with ferromagnetic chains along the axis; G-type every nearest neighbour antiparallel)
// @source S-034 (golden data built with pymatgen and spglib, tests/reference/magnetic_reference.json)
// Rock-salt type II (MnO/NiO type): ferromagnetic (111) planes of the fcc cation sublattice stacked
// antiferromagnetically; checked against the same golden file.
import type { SymmetryOperation } from '../crystal/symmetry';
import type { IntMat3 } from '../crystal/reduction';
import {
  IDENTITY,
  buildSupercell,
  commensurateFor,
  determinant,
  diagonalCommensurate,
  minimalCommonSupercell,
  type SupercellResult,
} from '../crystal/supercell';
import { norm, sub, vecMat } from '../crystal/linalg';
import type { Structure, Vec3 } from '../crystal/types';
import {
  MagneticError,
  fccGrid,
  magneticNeighbours,
  pseudocubicGrid,
  selectMagneticSites,
  type Int3,
  type NeighbourOptions,
  type SiteGrid,
} from './sublattice';

export type Sign = 1 | -1 | 0;
export type NamedKind = 'FM' | 'A' | 'C' | 'G' | 'RS2';
export const NAMED_LABEL: Record<NamedKind, string> = {
  FM: 'Ferromagnetic',
  A: 'A-type antiferromagnetic',
  C: 'C-type antiferromagnetic',
  G: 'G-type antiferromagnetic',
  RS2: 'Rock-salt type II antiferromagnetic',
};

/** Which cell the ordering is built in. */
export type CellChoice = 'minimal' | 'diagonal' | 'as-given' | IntMat3;

export interface SiteChoice {
  /** Magnetic sites as indices into the input structure; wins over `elements`. */
  sites?: readonly number[];
  /** Magnetic elements; default every d- or f-block site. */
  elements?: readonly string[];
}

export type OrderingRequest = { kind: NamedKind; axis?: 0 | 1 | 2; diagonal?: Int3 } | { kind: 'k'; k: Vec3 };

export interface MagneticConfiguration {
  kind: NamedKind | 'k' | 'custom';
  label: string;
  /** The cell the ordering lives in (the input structure, or a supercell of it). */
  structure: Structure;
  /** Supercell matrix relative to the input structure (rows: new vectors in the old basis). */
  matrix: IntMat3;
  /** Indices into `structure` of the magnetic sites. */
  magneticSites: number[];
  /** One sign per site of `structure`; 0 for non-magnetic sites. */
  signs: Sign[];
  /** Optional per-site magnitudes (custom orderings). */
  magnitudes?: number[];
  /** Wave vector of the pattern in reduced coordinates of the input cell (components 0 or 1/2). */
  k: Vec3;
  /** Stacking or chain axis for A and C (index into the grid axes, its Cartesian vector) and why it was chosen. */
  axis?: { index: 0 | 1 | 2; vector: Vec3; reason: string };
  grid?: SiteGrid['kind'];
  notes: string[];
}

const HALF_TOL = 1e-8;
const fold = (x: number) => {
  const y = x - Math.floor(x + HALF_TOL);
  return Math.abs(y) < HALF_TOL ? 0 : Math.abs(y - 0.5) < HALF_TOL ? 0.5 : y;
};
const fmtK = (k: Vec3) => `(${k.map((x) => (x === 0 ? '0' : x === 0.5 ? '1/2' : x.toFixed(4))).join(', ')})`;
const isIntegerK = (k: Vec3) => k.every((x) => x === 0);

const sitesOf = (s: Structure, c: SiteChoice): number[] => {
  if (c.sites) {
    if (c.sites.length === 0 || c.sites.some((i) => !Number.isInteger(i) || i < 0 || i >= s.species.length))
      throw new MagneticError(
        'bad-input',
        'The magnetic site list is empty or names a site that does not exist.',
      );
    return [...c.sites];
  }
  return selectMagneticSites(s, c.elements);
};

/** Parity form of a named ordering on its grid: phase(c) = (w . c) / den, sign = (-1)^phase. */
interface Phase {
  grid?: SiteGrid;
  w: Int3;
  den: number;
  axis?: MagneticConfiguration['axis'];
}

function phaseFor(
  s: Structure,
  sites: number[],
  req: Extract<OrderingRequest, { kind: NamedKind }>,
  nopts?: NeighbourOptions,
): Phase {
  if (req.kind === 'FM') return { w: [0, 0, 0], den: 1 };
  if (req.kind === 'RS2') {
    const grid = fccGrid(s, sites, nopts);
    const d = req.diagonal ?? [1, 1, 1];
    if (d.some((x) => Math.abs(x) !== 1))
      throw new MagneticError('bad-input', 'The (111) diagonal must have entries +1 or -1.');
    return { grid, w: d, den: 2 };
  }
  const grid = pseudocubicGrid(s, sites, nopts);
  const ax = req.axis ?? grid.defaultAxis;
  const w: Int3 =
    req.kind === 'G'
      ? [1, 1, 1]
      : req.kind === 'A'
        ? ([0, 1, 2].map((i) => (i === ax ? 1 : 0)) as unknown as Int3)
        : ([0, 1, 2].map((i) => (i === ax ? 0 : 1)) as unknown as Int3);
  const reason = req.axis === undefined ? `default: ${grid.defaultAxisReason}` : 'chosen by the user';
  return {
    grid,
    w,
    den: 1,
    ...(req.kind !== 'G' ? { axis: { index: ax, vector: grid.axes[ax]!, reason } } : {}),
  };
}

const dotI = (a: Int3, b: Int3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const phaseValue = (p: Phase, c: Int3): number => {
  const v = dotI(p.w, c);
  if (v % p.den !== 0) throw new Error('internal: grid point off the sublattice');
  return v / p.den;
};
const signOfPhase = (n: number): 1 | -1 => (((n % 2) + 2) % 2 === 0 ? 1 : -1);

/** Wave vector of a named ordering relative to the input cell: k_i = phase(row i) / 2, folded into {0, 1/2}. */
function kOfPhase(p: Phase): Vec3 {
  if (!p.grid) return [0, 0, 0];
  return p.grid.latticeCoords.map((c) => fold(phaseValue(p, c) / 2)) as unknown as Vec3;
}

function checkCollinearK(k: Vec3): Vec3 {
  const f = k.map(fold) as unknown as Vec3;
  if (f.some((x) => x !== 0 && x !== 0.5))
    throw new MagneticError(
      'k-not-collinear',
      `k = (${k.join(', ')}) has a component that is not 0 or 1/2, so cos(2 pi k . R) is not always +1 or -1. That describes a spiral or a modulated moment, which this collinear tool does not build.`,
    );
  return f;
}

function chooseMatrix(s: Structure, ks: readonly Vec3[], cell: CellChoice, maxDet?: number): IntMat3 {
  if (cell === 'as-given') {
    if (!ks.every(isIntegerK)) {
      const prop = minimalCommonSupercell(s, ks, { maxDet: maxDet ?? 16 });
      throw new MagneticError(
        'does-not-fit',
        `This ordering needs k = ${ks.map(fmtK).join(', ')} and does not fit the current cell. The smallest cell that holds it has ${determinant(prop.matrix)} copies of the current one (matrix ${JSON.stringify(prop.matrix)}).`,
      );
    }
    return IDENTITY;
  }
  if (cell === 'minimal') return minimalCommonSupercell(s, ks, { maxDet: maxDet ?? 16 }).matrix;
  if (cell === 'diagonal') {
    const n = diagonalCommensurate(ks);
    return [
      [n[0], 0, 0],
      [0, n[1], 0],
      [0, 0, n[2]],
    ];
  }
  if (!ks.every((k) => commensurateFor(cell, k)))
    throw new MagneticError(
      'does-not-fit',
      `The chosen supercell does not hold k = ${ks.map(fmtK).join(', ')}.`,
    );
  return cell;
}

export interface BuildOptions extends SiteChoice {
  cell?: CellChoice;
  /** Largest supercell determinant searched (default 16). */
  maxDet?: number;
  neighbour?: NeighbourOptions;
}

function assemble(
  sites: number[],
  sc: SupercellResult,
  signOf: (siteIdx: number, T: Int3) => 1 | -1,
): { magneticSites: number[]; signs: Sign[] } {
  const pos = new Map(sites.map((p, i) => [p, i]));
  const signs: Sign[] = [];
  const magneticSites: number[] = [];
  sc.parentIndex.forEach((p, j) => {
    const i = pos.get(p);
    if (i === undefined) signs.push(0);
    else {
      magneticSites.push(j);
      signs.push(signOf(i, sc.translations[j]!));
    }
  });
  // global-flip convention (D-059): the first magnetic site of the cell is up
  if (magneticSites.length > 0 && signs[magneticSites[0]!] === -1)
    for (const j of magneticSites) signs[j] = -signs[j]! as Sign;
  return { magneticSites, signs };
}

/** A named ordering (FM, A, C, G, rock-salt type II), built in the requested cell (default the minimal one). */
export function namedOrdering(
  s: Structure,
  req: Extract<OrderingRequest, { kind: NamedKind }>,
  opts: BuildOptions = {},
): MagneticConfiguration {
  const sites = sitesOf(s, opts);
  const p = phaseFor(s, sites, req, opts.neighbour);
  const k = kOfPhase(p);
  const M = chooseMatrix(s, [k], opts.cell ?? 'minimal', opts.maxDet);
  const sc = buildSupercell(s, M);
  const g = p.grid;
  const { magneticSites, signs } = assemble(sites, sc, (i, T) => {
    if (!g) return 1;
    const c = [0, 1, 2].map(
      (a) =>
        g.coords[i]![a]! +
        T[0] * g.latticeCoords[0][a]! +
        T[1] * g.latticeCoords[1][a]! +
        T[2] * g.latticeCoords[2][a]!,
    ) as unknown as Int3;
    return signOfPhase(phaseValue(p, c));
  });
  const notes: string[] = [];
  if (determinant(M) > 1)
    notes.push(`Built in a supercell of ${determinant(M)} copies of the input cell (k = ${fmtK(k)}).`);
  if (g && g.maxResidual > 0.05)
    notes.push(
      `The magnetic sublattice is distorted (largest offset ${g.maxResidual.toFixed(2)} grid units); the names follow the nearest ideal grid.`,
    );
  return {
    kind: req.kind,
    label: NAMED_LABEL[req.kind],
    structure: sc.structure,
    matrix: M,
    magneticSites,
    signs,
    k,
    ...(p.axis ? { axis: p.axis } : {}),
    ...(g ? { grid: g.kind } : {}),
    notes,
  };
}

/** Wave vector a request needs, relative to the input cell (no supercell built). */
export function requiredK(
  s: Structure,
  req: OrderingRequest,
  opts: SiteChoice & { neighbour?: NeighbourOptions } = {},
): Vec3 {
  if (req.kind === 'k') return checkCollinearK(req.k);
  return kOfPhase(phaseFor(s, sitesOf(s, opts), req, opts.neighbour));
}

/** Does the request fit the input cell as it is? If not, the smallest supercell that holds it. */
export function fitCheck(
  s: Structure,
  req: OrderingRequest,
  opts: SiteChoice & { neighbour?: NeighbourOptions; maxDet?: number } = {},
): { fits: boolean; k: Vec3; proposal?: IntMat3; message?: string } {
  const k = requiredK(s, req, opts);
  if (isIntegerK(k)) return { fits: true, k };
  const prop = minimalCommonSupercell(s, [k], { maxDet: opts.maxDet ?? 16 });
  const n = determinant(prop.matrix);
  return {
    fits: false,
    k,
    proposal: prop.matrix,
    message: `This ordering does not fit the current cell (it needs k = ${fmtK(k)}). Building it here would give a wrong pattern; the smallest cell that holds it has ${n} copies of the current one.`,
  };
}

/** Ordering from a propagation vector: s_j = cos(2 pi k . R_j), R_j the lattice translation of site j. */
export function orderingFromK(s: Structure, kIn: Vec3, opts: BuildOptions = {}): MagneticConfiguration {
  const k = checkCollinearK(kIn);
  const sites = sitesOf(s, opts);
  const M = chooseMatrix(s, [k], opts.cell ?? 'minimal', opts.maxDet);
  const sc = buildSupercell(s, M);
  const { magneticSites, signs } = assemble(sites, sc, (_i, T) =>
    signOfPhase(Math.round(2 * (k[0] * T[0] + k[1] * T[1] + k[2] * T[2]))),
  );
  return {
    kind: 'k',
    label: `Propagation vector k = ${fmtK(k)}`,
    structure: sc.structure,
    matrix: M,
    magneticSites,
    signs,
    k,
    notes: [
      'Every magnetic site of one copy of the input cell gets the same sign; only the lattice translation sets it.',
    ],
  };
}

/** Custom per-site signs (+1, -1 or 0 per site of `s`) and optional magnitudes, in the cell as given. */
export function customOrdering(
  s: Structure,
  signs: readonly number[],
  magnitudes?: readonly number[],
): MagneticConfiguration {
  if (signs.length !== s.species.length || signs.some((x) => x !== 1 && x !== -1 && x !== 0))
    throw new MagneticError('bad-input', `Give one sign (+1, -1 or 0) per site: ${s.species.length} values.`);
  if (
    magnitudes &&
    (magnitudes.length !== s.species.length || magnitudes.some((m) => !Number.isFinite(m) || m < 0))
  )
    throw new MagneticError(
      'bad-input',
      `Give one non-negative magnitude per site: ${s.species.length} values.`,
    );
  return {
    kind: 'custom',
    label: 'Custom',
    structure: s,
    matrix: IDENTITY,
    magneticSites: signs.flatMap((x, i) => (x !== 0 ? [i] : [])),
    signs: signs.map((x) => (x === 0 ? 0 : x) as Sign),
    ...(magnitudes ? { magnitudes: [...magnitudes] } : {}),
    k: [0, 0, 0],
    notes: [],
  };
}

/**
 * The smallest cell that holds every requested ordering at once, and each ordering built in it (same lattice, same
 * atom order). Comparing energies from differently shaped cells mixes in k-point sampling differences (D-058).
 */
export function commonSupercell(
  s: Structure,
  reqs: readonly OrderingRequest[],
  opts: BuildOptions = {},
): { matrix: IntMat3; configurations: MagneticConfiguration[] } {
  if (reqs.length === 0) throw new MagneticError('bad-input', 'Ask for at least one ordering.');
  const ks = reqs.map((r) => requiredK(s, r, opts));
  const matrix = minimalCommonSupercell(s, ks, { maxDet: opts.maxDet ?? 16 }).matrix;
  const configurations = reqs.map((r) =>
    r.kind === 'k'
      ? orderingFromK(s, r.k, { ...opts, cell: matrix })
      : namedOrdering(s, r, { ...opts, cell: matrix }),
  );
  return { matrix, configurations };
}

// ---------- checks ----------

const magnitudeAt = (
  c: MagneticConfiguration,
  j: number,
  byElement?: Readonly<Record<string, number>>,
): number => c.magnitudes?.[j] ?? byElement?.[c.structure.species[j]!] ?? 1;

/** Net moment per cell: sum of sign times magnitude (magnitudes per element, default 1 so the result is in site units). */
export function netMoment(c: MagneticConfiguration, byElement?: Readonly<Record<string, number>>): number {
  return c.signs.reduce<number>((acc, x, j) => acc + x * magnitudeAt(c, j, byElement), 0);
}

export interface SiteBonds {
  site: number;
  /** Per shell (index 0 = nearest), counts of parallel, antiparallel and zero-moment magnetic neighbours. */
  shells: { parallel: number; antiparallel: number; zero: number }[];
}

/** Parallel and antiparallel neighbour counts per magnetic site and shell (periodic images included). */
export function bondStatistics(
  c: MagneticConfiguration,
  opts: NeighbourOptions = {},
): { shells: number[]; sites: SiteBonds[] } {
  const n = opts.shells ?? 1;
  const mags = c.magneticSites;
  const nb = magneticNeighbours(c.structure, mags, { ...opts, shells: n });
  const sites = mags.map((j, i) => {
    const shells = Array.from({ length: n }, () => ({ parallel: 0, antiparallel: 0, zero: 0 }));
    for (const x of nb.neighbours[i]!) {
      const t = shells[x.shell - 1]!;
      const a = c.signs[j]!;
      const b = c.signs[x.site]!;
      if (a === 0 || b === 0) t.zero++;
      else if (a === b) t.parallel++;
      else t.antiparallel++;
    }
    return { site: j, shells };
  });
  return { shells: nb.shells, sites };
}

/** Zero net moment, at least one non-zero moment, and at least one antiparallel nearest-neighbour bond. */
export function isTrulyAntiferro(
  c: MagneticConfiguration,
  byElement?: Readonly<Record<string, number>>,
): boolean {
  if (Math.abs(netMoment(c, byElement)) > 1e-9) return false;
  if (!c.signs.some((x, j) => x !== 0 && magnitudeAt(c, j, byElement) > 0)) return false;
  return bondStatistics(c).sites.some((s) => s.shells[0]!.antiparallel > 0);
}

// ---------- enumeration ----------

export interface ConfigurationClass {
  /** Representative signs on the magnetic sites (in the order given), with the most up spins. */
  signs: (1 | -1)[];
  /** Number of assignments (up to a global flip) in this class. */
  multiplicity: number;
  /** Net moment in site units (|up - down|). */
  netUnits: number;
}

/**
 * Site permutations of the magnetic sites under symmetry operations x' = R x + t (fractional, column convention, as
 * moyo returns them). Operations that do not map the magnetic sites onto themselves are skipped.
 */
export function sitePermutations(
  s: Structure,
  sites: readonly number[],
  ops: readonly SymmetryOperation[],
  tolA = 0.01,
): number[][] {
  const out = new Map<string, number[]>();
  for (const { rotation: R, translation: t } of ops) {
    const perm: number[] = [];
    for (const i of sites) {
      const f = s.frac[i]!;
      const x: Vec3 = [0, 1, 2].map(
        (r) => R[r]![0]! * f[0] + R[r]![1]! * f[1] + R[r]![2]! * f[2] + t[r]!,
      ) as unknown as Vec3;
      const hit = sites.findIndex((j) => {
        if (s.species[j] !== s.species[i]) return false;
        const d = sub(x, s.frac[j]!);
        return (
          norm(
            vecMat([d[0] - Math.round(d[0]), d[1] - Math.round(d[1]), d[2] - Math.round(d[2])], s.lattice),
          ) < tolA
        );
      });
      if (hit < 0) break;
      perm.push(hit);
    }
    if (perm.length === sites.length) out.set(perm.join(','), perm);
  }
  return [...out.values()];
}

/**
 * All collinear up/down assignments of the magnetic sites, up to a global flip, grouped into classes that the
 * structure's symmetry operations (moyo, M5.1) map onto each other. Brute force over 2^N, so N <= maxSites.
 */
export function enumerateCollinear(
  s: Structure,
  sites: readonly number[],
  ops: readonly SymmetryOperation[],
  opts: { maxSites?: number; tolerance?: number } = {},
): ConfigurationClass[] {
  const N = sites.length;
  const max = opts.maxSites ?? 12;
  if (N === 0) throw new MagneticError('no-magnetic-sites', 'No magnetic sites given.');
  if (N > max)
    throw new MagneticError(
      'too-many-sites',
      `${N} magnetic sites give 2^${N} assignments; the limit is ${max} sites. Use a smaller cell.`,
    );
  const perms = sitePermutations(s, sites, ops, opts.tolerance);
  if (perms.length === 0) perms.push([...Array(N).keys()]);
  const full = (1 << N) - 1;
  const seen = new Uint8Array(1 << N);
  const apply = (m: number, p: number[]) => {
    let r = 0;
    for (let a = 0; a < N; a++) if (m & (1 << a)) r |= 1 << p[a]!;
    return r;
  };
  const pop = (m: number) => {
    let c = 0;
    for (let a = 0; a < N; a++) if (m & (1 << a)) c++;
    return c;
  };
  const classes: { rep: number; size: number }[] = [];
  for (let m = 0; m <= full; m++) {
    if (seen[m]) continue;
    const orbit = new Set<number>();
    for (const p of perms) {
      const x = apply(m, p);
      orbit.add(x).add(full ^ x);
    }
    let rep = -1;
    for (const x of orbit) {
      seen[x] = 1;
      // most up spins first, then up spins on the earliest sites (largest reversed-bit order)
      if (rep < 0 || pop(x) > pop(rep) || (pop(x) === pop(rep) && bitRev(x, N) > bitRev(rep, N))) rep = x;
    }
    classes.push({ rep, size: orbit.size / 2 });
  }
  return classes
    .map(({ rep, size }) => {
      const signs = Array.from({ length: N }, (_, a) => ((rep & (1 << a)) !== 0 ? 1 : -1) as 1 | -1);
      return { signs, multiplicity: size, netUnits: Math.abs(signs.reduce<number>((x, y) => x + y, 0)) };
    })
    .sort((x, y) => y.netUnits - x.netUnits || x.multiplicity - y.multiplicity || cmpSigns(y.signs, x.signs));
}

function bitRev(m: number, n: number): number {
  let r = 0;
  for (let a = 0; a < n; a++) if (m & (1 << a)) r |= 1 << (n - 1 - a);
  return r;
}
const cmpSigns = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};

/** A configuration from one enumerated class, in the cell it was enumerated in. */
export function configurationFromClass(
  s: Structure,
  sites: readonly number[],
  cls: ConfigurationClass,
  index: number,
): MagneticConfiguration {
  const signs: number[] = s.species.map(() => 0);
  sites.forEach((j, a) => (signs[j] = cls.signs[a]!));
  const c = customOrdering(s, signs);
  return {
    ...c,
    label: `Configuration ${String(index + 1).padStart(2, '0')}`,
    notes: [`${cls.multiplicity} equivalent assignment(s) up to a global flip.`],
  };
}
