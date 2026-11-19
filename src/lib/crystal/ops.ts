// Crystal clean-up and conversion operations. Each returns the new structure and a description of what changed,
// so the UI never changes a structure silently. The input is never modified.
// @source S-032 (moyo standardization: x_input = P x_std + p, metric G_std = P^T G_input P), S-036 (lattices, cells)
// Conventions verified on moyo-wasm 0.21.0 in ops.test.ts (a rotated, sheared, shifted NaCl cell).
import { contacts } from '../chem/geometry';
import { covalentRadius } from '../chem/elements';
import { THRESHOLDS } from '../chem/rules';
import { cartToFrac, cellVolume, fracToCart, latticeParameters, wrapFrac } from './lattice';
import { inv3, mul, norm, sub, transpose, vecMat } from './linalg';
import type { IntMat3 } from './pointgroup';
import { describeStandardization } from './standardize';
import { deleteSites as deleteAtoms } from './structure';
import { buildSupercell, determinant } from './supercell';
import { analyzeWith, type MoyoApi, type SymmetryResult } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

export { supercell, buildSupercell } from './supercell';

export interface OpResult {
  structure: Structure;
  /** One sentence for the UI and the undo stack. */
  description: string;
  changed: boolean;
  /** Further plain-language notes (what was dropped, what to check). */
  notes: string[];
}

const f4 = (x: number) => String(Number(x.toFixed(4)));
const matVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const metric = (L: Mat3): Mat3 => mul(L, transpose(L));
const minImage = (d: Vec3): Vec3 => [
  d[0] - Math.round(d[0]),
  d[1] - Math.round(d[1]),
  d[2] - Math.round(d[2]),
];

/** Eigen-decomposition of a symmetric 3x3 matrix (cyclic Jacobi): returns f(A) = V f(lambda) V^T. */
function symmetricFunction(A: Mat3, f: (x: number) => number): Mat3 {
  const a = A.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0]![1]! ** 2 + a[0]![2]! ** 2 + a[1]![2]! ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = a[p]![q]!;
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k]![p]!;
        const akq = a[k]![q]!;
        a[k]![p] = c * akp - s * akq;
        a[k]![q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p]![k]!;
        const aqk = a[q]![k]!;
        a[p]![k] = c * apk - s * aqk;
        a[q]![k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k]![p]!;
        const vkq = v[k]![q]!;
        v[k]![p] = c * vkp - s * vkq;
        v[k]![q] = s * vkp + c * vkq;
      }
    }
  }
  const lam = [f(a[0]![0]!), f(a[1]![1]!), f(a[2]![2]!)];
  const out = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => lam.reduce((acc, l, k) => acc + v[i]![k]! * l * v[j]![k]!, 0)),
  );
  return out as unknown as Mat3;
}

/**
 * The lattice whose metric is `target`, reached from L by a pure (symmetric) strain, so the user's orientation is kept:
 * L' = L E with E symmetric and L E^2 L^T = target.
 */
function strainToMetric(L: Mat3, target: Mat3): Mat3 {
  const Li = inv3(L);
  const E2 = mul(mul(Li, target), transpose(Li));
  return mul(L, symmetricFunction(E2, Math.sqrt));
}

/** Ideal metric of the input basis implied by moyo's standardized cell: G_in = P^-T G_std P^-1. */
function idealMetric(r: SymmetryResult): Mat3 {
  const Pi = inv3(r.stdLinear);
  return mul(mul(transpose(Pi), metric(r.stdCell.lattice)), Pi);
}

/**
 * Idealized fractional positions in the input basis: every atom of moyo's standardized cell mapped back with
 * x_in = P x_std + p, then each input atom takes the nearest mapped site of its species, keeping its own image.
 */
function idealPositions(s: Structure, r: SymmetryResult, L: Mat3): Vec3[] {
  const P = r.stdLinear;
  const p = r.stdOriginShift;
  const mapped = r.stdCell.frac.map((x, k) => {
    const y = matVec(P, x);
    return { el: r.stdCell.species[k]!, y: wrapFrac([y[0] + p[0], y[1] + p[1], y[2] + p[2]]) };
  });
  return s.frac.map((f, i) => {
    let best: Vec3 | undefined;
    let bestD = Infinity;
    for (const m of mapped) {
      if (m.el !== s.species[i]) continue;
      const d = minImage(sub(m.y, f));
      const dist = norm(vecMat(d, L));
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (!best) throw new Error(`No symmetric site found for atom ${i + 1} (${s.species[i]}).`);
    return [f[0] + best[0], f[1] + best[1], f[2] + best[2]];
  });
}

const maxShift = (a: Structure, b: Structure): number =>
  Math.max(0, ...a.frac.map((f, i) => norm(vecMat(sub(b.frac[i]!, f), b.lattice))));

/** Symmetrize in the user's setting: lattice strained to the ideal metric (orientation kept), atoms snapped to their sites. */
export function symmetrize(api: MoyoApi, s: Structure, symprec = 0.01): OpResult {
  const r = analyzeWith(api, s, { symprec });
  const L = strainToMetric(s.lattice, idealMetric(r));
  const out: Structure = { ...s, lattice: L, frac: idealPositions(s, r, L) };
  const shift = maxShift(s, out);
  const before = latticeParameters(s.lattice);
  const after = latticeParameters(L);
  const dl = Math.max(
    ...(['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const).map((k) => Math.abs(after[k] - before[k])),
  );
  return {
    structure: out,
    description: `Symmetrized to ${r.hmSymbol} (${r.number}) with tolerance ${symprec} Angstrom: atoms moved by at most ${f4(shift)} Angstrom.`,
    changed: shift > 1e-12 || dl > 1e-12,
    notes: [
      `Cell parameters changed by at most ${f4(dl)} (Angstrom or degrees); the cell keeps your orientation and setting.`,
      'Symmetrizing removes small distortions. If the distortion is real (a tilt, a Jahn-Teller shift), lower the tolerance instead.',
    ],
  };
}

/** Snap atoms to their ideal Wyckoff positions; the cell is not changed. */
export function snapToWyckoff(api: MoyoApi, s: Structure, symprec = 0.01): OpResult {
  const r = analyzeWith(api, s, { symprec });
  const out: Structure = { ...s, frac: idealPositions(s, r, s.lattice) };
  const shift = maxShift(s, out);
  return {
    structure: out,
    description: `Snapped atoms to the Wyckoff positions of ${r.hmSymbol} (${r.number}): largest move ${f4(shift)} Angstrom; the cell is unchanged.`,
    changed: shift > 1e-12,
    notes: [`Wyckoff letters in order: ${r.wyckoffs.join(' ')}.`],
  };
}

const dropped = (s: Structure): string[] =>
  [
    s.labels ? 'POSCAR labels (such as Ti_pv) were dropped; atoms are named by element.' : '',
    s.selective ? 'Selective-dynamics flags were dropped because atoms were renumbered.' : '',
  ].filter(Boolean);

export function standardizePrimitive(api: MoyoApi, s: Structure, symprec = 1e-4): OpResult {
  const r = analyzeWith(api, s, { symprec });
  const rep = describeStandardization(s, r);
  return {
    structure: r.primStdCell,
    description: rep.headline,
    changed: rep.changed,
    notes: [...rep.details, ...dropped(s)],
  };
}

export function standardizeConventional(api: MoyoApi, s: Structure, symprec = 1e-4): OpResult {
  const r = analyzeWith(api, s, { symprec });
  const n0 = s.species.length;
  const n1 = r.stdCell.species.length;
  return {
    structure: r.stdCell,
    description: `Rewritten as the standard conventional cell of ${r.hmSymbol} (${r.number}): ${n0} atoms became ${n1}.`,
    changed: true,
    notes: [
      'The conventional cell shows the symmetry plainly (cubic axes for a cubic crystal) but may hold more atoms than needed; the primitive cell is cheaper for DFT.',
      ...dropped(s),
    ],
  };
}

export function wrap(s: Structure): OpResult {
  const frac = s.frac.map(wrapFrac);
  const moved = frac.filter((f, i) => f.some((x, k) => x !== s.frac[i]![k])).length;
  return {
    structure: { ...s, frac },
    description: moved
      ? `Wrapped ${moved} atom(s) into the cell (0 to 1); no atom moved physically.`
      : 'All atoms were already inside the cell.',
    changed: moved > 0,
    notes: [],
  };
}

/** Delete same-species atoms within `tol` Angstrom (periodic images included) of an earlier atom; the earlier one is kept. */
export function mergeDuplicates(s: Structure, tol: number = THRESHOLDS.mergeDistance): OpResult {
  const drop = new Set<number>();
  for (const c of contacts(s, tol))
    if (c.i !== c.j && s.species[c.i] === s.species[c.j] && !drop.has(c.i)) drop.add(c.j);
  const removed = [...drop].sort((a, b) => a - b);
  return {
    structure: deleteAtoms(s, removed),
    description: removed.length
      ? `Merged duplicates: removed ${removed.map((i) => `${s.species[i]}${i + 1}`).join(', ')} (within ${tol} Angstrom of an identical atom).`
      : `No identical atoms within ${tol} Angstrom.`,
    changed: removed.length > 0,
    notes: [],
  };
}

export function supercellOp(s: Structure, M: IntMat3): OpResult {
  const r = buildSupercell(s, M);
  const det = Math.abs(determinant(M));
  return {
    structure: r.structure,
    description: `Built a supercell with matrix [${M.map((row) => row.join(' ')).join('; ')}]: ${det} copies, ${s.species.length} atoms became ${r.structure.species.length}.`,
    changed: det !== 1 || M.some((row, i) => row.some((x, j) => x !== (i === j ? 1 : 0))),
    notes: [],
  };
}

/**
 * Replace the lattice. `keep: 'fractional'` scales the atoms with the cell (a strain); `keep: 'cartesian'` leaves every
 * atom where it is in space, so fractional coordinates change.
 */
export function setLattice(s: Structure, L: Mat3, keep: 'fractional' | 'cartesian' = 'fractional'): OpResult {
  const v = cellVolume(L);
  if (!(v > 1e-9)) throw new RangeError('The new lattice vectors are linearly dependent (zero volume).');
  const frac = keep === 'fractional' ? s.frac : s.frac.map((f) => cartToFrac(fracToCart(f, s.lattice), L));
  const v0 = cellVolume(s.lattice);
  return {
    structure: { ...s, lattice: L, frac },
    description: `Set new lattice vectors (volume ${f4(v0)} to ${f4(v)} Angstrom^3), keeping ${keep === 'fractional' ? 'fractional coordinates: atoms move with the cell' : 'Cartesian positions: atoms stay where they are'}.`,
    changed: true,
    notes: [],
  };
}

export interface RelaxOptions {
  maxSteps?: number;
  /** Largest move of any atom in one step, Angstrom. */
  maxStep?: number;
}

/**
 * Geometric clean-up, not a physical relaxation: pushes apart atoms closer than 0.75 of their covalent-radius sum
 * (the B001 and B002 contacts) with a soft pair repulsion. Only atoms in such contacts move, frozen
 * selective-dynamics directions are respected, each step moves an atom by at most 0.05 Angstrom, there are at most
 * 200 steps, and the cell never changes.
 */
export function gentleRelax(s: Structure, opts: RelaxOptions = {}): OpResult {
  const maxSteps = Math.min(opts.maxSteps ?? 200, 200);
  const maxStep = Math.min(opts.maxStep ?? 0.05, 0.05);
  const target = (a: string, b: string) => {
    const ra = covalentRadius(a);
    const rb = covalentRadius(b);
    return ra === null || rb === null ? 0 : THRESHOLDS.shortContactFactor * (ra + rb);
  };
  let rMax = 0;
  for (const el of new Set(s.species)) rMax = Math.max(rMax, covalentRadius(el) ?? 0);
  const cutoff = Math.max(0.2, 2 * THRESHOLDS.shortContactFactor * rMax);
  const short = (x: Structure) =>
    contacts(x, cutoff).filter(
      (c) => c.i !== c.j && c.distance < target(x.species[c.i]!, x.species[c.j]!) - 1e-9,
    );
  const first = short(s);
  const movable = new Set(first.flatMap((c) => [c.i, c.j]));
  const coincident = first.filter((c) => c.distance < 1e-6);
  let cur = s;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const list = short(cur).filter((c) => c.distance >= 1e-6);
    if (!list.length) break;
    const disp = new Map<number, Vec3>();
    const addTo = (k: number, v: Vec3) => {
      const d = disp.get(k) ?? [0, 0, 0];
      disp.set(k, [d[0] + v[0], d[1] + v[1], d[2] + v[2]]);
    };
    for (const c of list) {
      // Aim 1 % past the threshold so the iteration ends instead of creeping towards it
      const gap = target(cur.species[c.i]!, cur.species[c.j]!) * 1.01 - c.distance;
      const u = c.vector.map((x) => x / c.distance) as unknown as Vec3;
      addTo(c.j, [(u[0] * gap) / 2, (u[1] * gap) / 2, (u[2] * gap) / 2]);
      addTo(c.i, [(-u[0] * gap) / 2, (-u[1] * gap) / 2, (-u[2] * gap) / 2]);
    }
    let moved = false;
    const frac = cur.frac.map((f, k) => {
      const d = disp.get(k);
      if (!d || !movable.has(k)) return f;
      const free = s.selective?.[k] ?? [true, true, true];
      let df = cartToFrac(d, cur.lattice);
      df = [free[0] ? df[0] : 0, free[1] ? df[1] : 0, free[2] ? df[2] : 0];
      const len = norm(vecMat(df, cur.lattice));
      if (len < 1e-12) return f;
      const k2 = len > maxStep ? maxStep / len : 1;
      moved = true;
      return [f[0] + df[0] * k2, f[1] + df[1] * k2, f[2] + df[2] * k2] as Vec3;
    });
    if (!moved) break;
    cur = { ...cur, frac };
  }
  const left = short(cur);
  const shift = maxShift(s, cur);
  const notes = [
    'Geometric clean-up, not a physical relaxation: run a real relaxation (IBRION, NSW) in VASP afterwards.',
  ];
  if (coincident.length)
    notes.push(
      `${coincident.length} pair(s) sit on top of each other and cannot be pushed apart (no direction); merge or delete them.`,
    );
  if (left.length) notes.push(`${left.length} short contact(s) remain after ${steps} steps.`);
  return {
    structure: cur,
    description: first.length
      ? `Geometric clean-up: moved ${movable.size} atom(s) in short contacts by up to ${f4(shift)} Angstrom in ${steps} step(s); ${left.length} short contact(s) remain.`
      : 'No short contacts: nothing to clean up.',
    changed: shift > 0,
    notes,
  };
}
