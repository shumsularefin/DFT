// Rough 3D geometry for a molecule graph (M10.3). No RDKit: the MinimalLib build has no 3D embedding and no force
// field (D-004), so this is a small valence-geometry model, labelled as a starting geometry only:
//   * bonds: harmonic, target = sum of Cordero single-bond covalent radii (S-021) for every bond order (no
//     bond-order correction is sourced, so double and triple bonds come out too long; the result says so);
//   * angles: (cos theta - cos theta0)^2 at every atom, theta0 from the steric number (neighbours + lone pairs):
//     2 -> 180, 3 -> 120, 4 -> 109.47 degrees; lone pairs from the valence electrons left after bonding;
//     steric numbers above 4 get no angle term; a linear centre uses k (1 + cos theta) so the bend is quadratic;
//   * an out-of-plane term k V^2 (V = a . (b x c) of the three bond vectors) at trigonal centres keeps them flat, and the same
//     term on a-j-k-b across a double or aromatic bond between trigonal centres keeps that unit planar (no other
//     torsion term: rotation about single bonds is set by the start and the repulsion only);
//   * a soft repulsion between atoms more than two bonds apart, below 1.5 times the sum of covalent radii.
// Start: the 2D layout (scaled to the bond targets) plus small seeded out-of-plane offsets; gradient descent with a
// backtracking line search (L-BFGS, analytic gradient); same seed, same coordinates. Force constants are conventions of the model (D-070).
// @source S-021
import type { Vec3 } from '../crystal/types';
import { covalentRadius, elementData } from './elements';
import { expandHydrogens, type MolGraph } from './molgraph';

export const GEOMETRY_LABEL = 'Rough starting geometry for DFT, not a quantum-chemical optimization.';
/** Conventions of the model (D-070), not physical constants. */
export const MODEL = {
  kBond: 10,
  kAngle: 2,
  kOop: 2,
  kRepulsion: 1,
  repulsionFactor: 1.5,
  offsetA: 0.02,
  maxIterations: 5000,
  gradTol: 1e-5,
} as const;
const TETRAHEDRAL = (Math.acos(-1 / 3) * 180) / Math.PI;

export interface Geom3dOptions {
  seed?: number;
  maxIterations?: number;
}
export interface Geom3dResult {
  /** The graph with every hydrogen as its own atom (the order of `positions`). */
  graph: MolGraph;
  species: string[];
  /** Cartesian, angstrom, centred on the origin. */
  positions: Vec3[];
  energy: number;
  iterations: number;
  converged: boolean;
  /** Ideal angle (degrees) used at each atom, or null where no angle term applies. */
  idealAngles: (number | null)[];
  notes: string[];
}

/** Valence electrons of a main-group element (group 1-2: group; 13-18: group - 10; He: 2), else null. */
export function valenceElectrons(el: string): number | null {
  const d = elementData(el);
  if (!d) return null;
  if (el === 'He') return 2;
  if (d.block === 's' && (d.group === 1 || d.group === 2)) return d.group;
  if (d.block === 'p' && d.group !== null && d.group >= 13) return d.group - 10;
  return null;
}

const bondValue = (o: MolGraph['bonds'][number]['order']): number => (o === 'aromatic' ? 1.5 : o);

/** Steric number and ideal angle for every atom of a hydrogen-expanded graph. */
export function idealAngles(g: MolGraph): { steric: (number | null)[]; angle: (number | null)[] } {
  const nb = g.atoms.map(() => 0);
  const used = g.atoms.map((a) => a.hCount);
  for (const b of g.bonds) {
    nb[b.a]!++;
    nb[b.b]!++;
    used[b.a]! += bondValue(b.order);
    used[b.b]! += bondValue(b.order);
  }
  const steric = g.atoms.map((a, i) => {
    const v = valenceElectrons(a.el);
    if (v === null) return null;
    const lp = Math.max(0, Math.floor((v - a.charge - used[i]! + 1e-9) / 2));
    return nb[i]! + a.hCount + lp;
  });
  const angle = steric.map((sn) => (sn === 2 ? 180 : sn === 3 ? 120 : sn === 4 ? TETRAHEDRAL : null));
  return { steric, angle };
}

/** mulberry32, so the offsets are the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build rough 3D coordinates. Hydrogens counted in `hCount` become atoms. */
export function geometry3d(input: MolGraph, opts: Geom3dOptions = {}): Geom3dResult {
  const g = input.atoms.some((a) => a.hCount > 0) ? expandHydrogens(input) : input;
  const n = g.atoms.length;
  if (n === 0) throw new RangeError('The molecule has no atoms.');
  const radius = g.atoms.map((a) => {
    const r = covalentRadius(a.el);
    if (r === null)
      throw new RangeError(`No covalent radius is tabulated for ${a.el} (Cordero 2008 stops at Cm).`);
    return r;
  });
  const random = rng(opts.seed ?? 1);
  const notes = [GEOMETRY_LABEL];

  // Topology: bonds, angles (i-j-k with j central), and 1-2/1-3 exclusions for the repulsion.
  const adj: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    adj[b.a]!.push(b.b);
    adj[b.b]!.push(b.a);
  }
  const bonds = g.bonds.map((b) => ({ i: b.a, j: b.b, r0: radius[b.a]! + radius[b.b]! }));
  const { angle: ideal } = idealAngles(g);
  const angles: { i: number; j: number; k: number; c0: number }[] = [];
  adj.forEach((nbrs, j) => {
    const t = ideal[j];
    if (t === null || t === undefined) return;
    const c0 = Math.cos((t * Math.PI) / 180);
    for (let p = 0; p < nbrs.length; p++)
      for (let q = p + 1; q < nbrs.length; q++) angles.push({ i: nbrs[p]!, j, k: nbrs[q]!, c0 });
  });
  const near = new Set<number>();
  adj.forEach((nbrs, j) => {
    for (const i of nbrs) near.add(Math.min(i, j) * n + Math.max(i, j));
    for (const i of nbrs) for (const k of nbrs) if (i < k) near.add(i * n + k);
  });
  const pairs: { i: number; j: number; d0: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (!near.has(i * n + j)) pairs.push({ i, j, d0: MODEL.repulsionFactor * (radius[i]! + radius[j]!) });
  if (g.bonds.some((b) => b.order !== 1)) {
    notes.push(
      'Bond targets are single-bond covalent radii for every bond order, so double and triple bonds come out too long.',
    );
  }
  if (ideal.some((t, i) => t === null && adj[i]!.length > 1)) {
    notes.push(
      'Some atoms (transition metals, or more than four electron domains) have no angle term; their angles come from the repulsion only.',
    );
  }

  // Start: scaled 2D layout plus seeded out-of-plane offsets, or a seeded cloud when there is no layout.
  const x = new Float64Array(3 * n);
  if (g.coords2d && g.coords2d.length === n) {
    const len2d = bonds.map((b) =>
      Math.hypot(g.coords2d![b.i]![0] - g.coords2d![b.j]![0], g.coords2d![b.i]![1] - g.coords2d![b.j]![1]),
    );
    const scale = bonds.length
      ? bonds.reduce((a, b) => a + b.r0, 0) /
        Math.max(
          1e-9,
          len2d.reduce((a, b) => a + b, 0),
        )
      : 1;
    g.coords2d.forEach(([px, py], i) => {
      x[3 * i] = px * scale;
      x[3 * i + 1] = py * scale;
      x[3 * i + 2] = (2 * random() - 1) * MODEL.offsetA;
    });
  } else {
    notes.push('No 2D layout was given, so the start is a seeded random cloud; the result is rougher.');
    const side = 1.5 * Math.cbrt(n);
    for (let k = 0; k < 3 * n; k++) x[k] = (random() - 0.5) * side;
  }

  // Out-of-plane term at trigonal centres (steric number 3 with three neighbours): E = kOop V^2, V = a . (b x c).
  const oops: { j: number; a: number; b: number; c: number }[] = [];
  adj.forEach((nbrs, j) => {
    if (ideal[j] === 120 && nbrs.length === 3) oops.push({ j, a: nbrs[0]!, b: nbrs[1]!, c: nbrs[2]! });
  });
  // The same triple product keeps a, j, k, b coplanar across a double or aromatic bond j-k between trigonal centres
  // (torsion 0 or 180 degrees). Without it ring puckering and the twist of a double bond are free or quartic.
  for (const bd of g.bonds) {
    if (bd.order !== 2 && bd.order !== 'aromatic') continue;
    const [j, k] = [bd.a, bd.b];
    if (ideal[j] !== 120 || ideal[k] !== 120) continue;
    for (const a of adj[j]!)
      if (a !== k) for (const b of adj[k]!) if (b !== j) oops.push({ j, a, b: k, c: b });
  }

  /** Energy and analytic gradient (written into `gr`). */
  const evaluate = (p: Float64Array, gr: Float64Array): number => {
    gr.fill(0);
    let e = 0;
    const d = [0, 0, 0];
    const dist = (i: number, j: number): number => {
      d[0] = p[3 * i]! - p[3 * j]!;
      d[1] = p[3 * i + 1]! - p[3 * j + 1]!;
      d[2] = p[3 * i + 2]! - p[3 * j + 2]!;
      return Math.hypot(d[0], d[1], d[2]);
    };
    const pairForce = (i: number, j: number, r: number, dEdr: number): void => {
      const f = dEdr / Math.max(r, 1e-12);
      for (let k = 0; k < 3; k++) {
        gr[3 * i + k]! += f * d[k]!;
        gr[3 * j + k]! -= f * d[k]!;
      }
    };
    for (const bd of bonds) {
      const r = dist(bd.i, bd.j);
      e += MODEL.kBond * (r - bd.r0) ** 2;
      pairForce(bd.i, bd.j, r, 2 * MODEL.kBond * (r - bd.r0));
    }
    const u = [0, 0, 0];
    const v = [0, 0, 0];
    for (const an of angles) {
      let uu = 0;
      let vv = 0;
      let uv = 0;
      for (let k = 0; k < 3; k++) {
        u[k] = p[3 * an.i + k]! - p[3 * an.j + k]!;
        v[k] = p[3 * an.k + k]! - p[3 * an.j + k]!;
        uu += u[k]! * u[k]!;
        vv += v[k]! * v[k]!;
        uv += u[k]! * v[k]!;
      }
      const nu = Math.sqrt(uu) + 1e-12;
      const nv = Math.sqrt(vv) + 1e-12;
      const cos = uv / (nu * nv);
      // Linear centres: k (1 + cos), quadratic in the bend; otherwise k (cos - cos0)^2.
      const linear = an.c0 < -0.999999;
      e += linear ? MODEL.kAngle * (1 + cos) : MODEL.kAngle * (cos - an.c0) ** 2;
      const dEdc = linear ? MODEL.kAngle : 2 * MODEL.kAngle * (cos - an.c0);
      for (let k = 0; k < 3; k++) {
        const gu = dEdc * (v[k]! / (nu * nv) - (cos * u[k]!) / (nu * nu));
        const gv = dEdc * (u[k]! / (nu * nv) - (cos * v[k]!) / (nv * nv));
        gr[3 * an.i + k]! += gu;
        gr[3 * an.k + k]! += gv;
        gr[3 * an.j + k]! -= gu + gv;
      }
    }
    const A = [0, 0, 0];
    const B = [0, 0, 0];
    const C = [0, 0, 0];
    const cross = (x: number[], y: number[]): number[] => [
      x[1]! * y[2]! - x[2]! * y[1]!,
      x[2]! * y[0]! - x[0]! * y[2]!,
      x[0]! * y[1]! - x[1]! * y[0]!,
    ];
    for (const o of oops) {
      for (let k = 0; k < 3; k++) {
        A[k] = p[3 * o.a + k]! - p[3 * o.j + k]!;
        B[k] = p[3 * o.b + k]! - p[3 * o.j + k]!;
        C[k] = p[3 * o.c + k]! - p[3 * o.j + k]!;
      }
      const bc = cross(B, C);
      const ca = cross(C, A);
      const ab = cross(A, B);
      const V = A[0]! * bc[0]! + A[1]! * bc[1]! + A[2]! * bc[2]!;
      e += MODEL.kOop * V * V;
      const f = 2 * MODEL.kOop * V;
      for (let k = 0; k < 3; k++) {
        gr[3 * o.a + k]! += f * bc[k]!;
        gr[3 * o.b + k]! += f * ca[k]!;
        gr[3 * o.c + k]! += f * ab[k]!;
        gr[3 * o.j + k]! -= f * (bc[k]! + ca[k]! + ab[k]!);
      }
    }
    for (const q of pairs) {
      const r = dist(q.i, q.j);
      if (r < q.d0) {
        e += MODEL.kRepulsion * (q.d0 - r) ** 2;
        pairForce(q.i, q.j, r, -2 * MODEL.kRepulsion * (q.d0 - r));
      }
    }
    return e;
  };

  // L-BFGS (memory 8) with a backtracking Armijo line search; steepest descent when the direction is not downhill.
  const maxIt = opts.maxIterations ?? MODEL.maxIterations;
  const N = 3 * n;
  const M = 8;
  const S: Float64Array[] = [];
  const Y: Float64Array[] = [];
  const gvec = new Float64Array(N);
  const gnew = new Float64Array(N);
  const dir = new Float64Array(N);
  const trial = new Float64Array(N);
  const dot = (a: Float64Array, b: Float64Array): number => {
    let s = 0;
    for (let k = 0; k < N; k++) s += a[k]! * b[k]!;
    return s;
  };
  let e = evaluate(x, gvec);
  let it = 0;
  let converged = false;
  for (; it < maxIt; it++) {
    let gmax = 0;
    for (const val of gvec) gmax = Math.max(gmax, Math.abs(val));
    if (gmax < MODEL.gradTol) {
      converged = true;
      break;
    }
    // Two-loop recursion.
    dir.set(gvec);
    const alpha: number[] = [];
    for (let m = S.length - 1; m >= 0; m--) {
      const a = dot(S[m]!, dir) / dot(Y[m]!, S[m]!);
      alpha[m] = a;
      for (let k = 0; k < N; k++) dir[k]! -= a * Y[m]![k]!;
    }
    if (S.length) {
      const last = S.length - 1;
      const gamma = dot(S[last]!, Y[last]!) / dot(Y[last]!, Y[last]!);
      for (let k = 0; k < N; k++) dir[k]! *= gamma;
    } else {
      const gn = Math.sqrt(dot(gvec, gvec));
      for (let k = 0; k < N; k++) dir[k]! *= 0.01 / gn;
    }
    for (let m = 0; m < S.length; m++) {
      const bta = dot(Y[m]!, dir) / dot(Y[m]!, S[m]!);
      for (let k = 0; k < N; k++) dir[k]! += S[m]![k]! * (alpha[m]! - bta);
    }
    let slope = -dot(gvec, dir);
    if (!(slope < 0)) {
      S.length = 0;
      Y.length = 0;
      const gn = Math.sqrt(dot(gvec, gvec));
      for (let k = 0; k < N; k++) dir[k] = (0.01 * gvec[k]!) / gn;
      slope = -dot(gvec, dir);
    }
    let t = 1;
    let et: number;
    for (;;) {
      for (let k = 0; k < N; k++) trial[k] = x[k]! - t * dir[k]!;
      et = evaluate(trial, gnew);
      if (et <= e + 1e-4 * t * slope || t < 1e-12) break;
      t /= 2;
    }
    if (t < 1e-12) {
      converged = gmax < 1e-4;
      break;
    }
    const s = new Float64Array(N);
    const y = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      s[k] = trial[k]! - x[k]!;
      y[k] = gnew[k]! - gvec[k]!;
    }
    if (dot(s, y) > 1e-14) {
      S.push(s);
      Y.push(y);
      if (S.length > M) {
        S.shift();
        Y.shift();
      }
    }
    x.set(trial);
    gvec.set(gnew);
    e = et;
  }
  if (!converged)
    notes.push(
      `The optimizer stopped after ${it} steps before the forces were zero; the geometry is rougher.`,
    );

  const c = [0, 1, 2].map((d) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[3 * i + d]!;
    return s / n;
  });
  const positions = g.atoms.map(
    (_, i) => [x[3 * i]! - c[0]!, x[3 * i + 1]! - c[1]!, x[3 * i + 2]! - c[2]!] as Vec3,
  );
  return {
    graph: g,
    species: g.atoms.map((a) => a.el),
    positions,
    energy: e,
    iterations: it,
    converged,
    idealAngles: ideal,
    notes,
  };
}
