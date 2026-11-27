// A small Lennard-Jones toy (M16.13, M16.14): pair energies and forces in a cubic periodic box, a steepest-descent
// relaxation (for the defect stage) and velocity Verlet molecular dynamics with an optional Andersen thermostat (for
// the MD stage). Units: angstrom, femtosecond, eV, atomic mass units (dalton).
// The potential is V(r) = 4 eps [(sigma/r)^12 - (sigma/r)^6], truncated at r_c and shifted to zero there; unlike pairs
// use the Lorentz-Berthelot rule sigma_ij = (sigma_i + sigma_j)/2, eps_ij = sqrt(eps_i eps_j) (S-125).
// Argon parameters sigma = 3.405 angstrom, eps / k_B = 119.8 K and mass 39.948 u are those of Verlet's 1967 study of
// Lennard-Jones argon (S-125). The fcc lattice sums used in the tests are from Ashcroft and Mermin, table 20.4 (S-036).
// Velocity Verlet and the Andersen thermostat follow Frenkel and Smit (S-125) and Andersen (S-126).
// @source S-125 S-126 S-036 S-031
import { BOLTZMANN_EV_K, DALTON_KG, ELEMENTARY_CHARGE_C } from './constants';

export interface LJSpecies {
  /** angstrom */
  sigma: number;
  /** eV */
  epsilon: number;
  /** atomic mass units */
  mass: number;
}

/** Lennard-Jones argon (Verlet 1967, S-125). */
export const ARGON: LJSpecies = { sigma: 3.405, epsilon: 119.8 * BOLTZMANN_EV_K, mass: 39.948 };

/** Default cutoff in units of sigma of argon. Short enough that a 3 x 3 x 3 fcc box still obeys minimum image. */
export const DEFAULT_CUTOFF_SIGMA = 2.25;

/** (eV / angstrom) / u in angstrom / fs^2: a = F / m * ACCEL. */
export const ACCEL = (ELEMENTARY_CHARGE_C / (1e-10 * DALTON_KG)) * 1e-20;

export interface LJSystem {
  /** Edge of the cubic periodic box, angstrom. */
  box: number;
  /** Species index of each atom. */
  types: number[];
  species: LJSpecies[];
  /** Cutoff distance, angstrom (one for all pairs). */
  rc: number;
}

/** Truncated and shifted pair energy and the scalar -dV/dr / r (so that F_i = -fr * d with d = r_j - r_i). */
export function ljPair(r2: number, sigma: number, eps: number, rc: number): { e: number; fOverR: number } {
  if (r2 >= rc * rc) return { e: 0, fOverR: 0 };
  const s2 = (sigma * sigma) / r2;
  const s6 = s2 * s2 * s2;
  const c2 = (sigma * sigma) / (rc * rc);
  const c6 = c2 * c2 * c2;
  const e = 4 * eps * (s6 * s6 - s6) - 4 * eps * (c6 * c6 - c6);
  // -dV/dr = 24 eps (2 s^12 - s^6) / r ; divided by r
  const fOverR = (24 * eps * (2 * s6 * s6 - s6)) / r2;
  return { e, fOverR };
}

export interface PairList {
  i: Int32Array;
  j: Int32Array;
  /** Image shift of j, in angstrom (x, y, z per pair). */
  shift: Float64Array;
  /** Positions the list was built at (for the skin test). */
  ref: Float64Array;
  skin: number;
  /** The box is at least twice the cutoff: every pair is taken at its nearest image and the lists are empty. */
  minimumImage?: boolean;
}

/** Every unordered pair (including an atom with its own periodic images) closer than rc + skin. */
export function buildPairs(pos: Float64Array, sys: LJSystem, skin = 0.5): PairList {
  const n = sys.types.length;
  const L = sys.box;
  const cut = sys.rc + skin;
  const cut2 = cut * cut;
  const m = Math.ceil(cut / L);
  const I: number[] = [];
  const J: number[] = [];
  const S: number[] = [];
  if (2 * sys.rc <= L) {
    // minimum image holds: no list, energyForces visits every pair with its nearest image
    return {
      i: new Int32Array(0),
      j: new Int32Array(0),
      shift: new Float64Array(0),
      ref: Float64Array.from(pos),
      skin,
      minimumImage: true,
    };
  }
  for (let a = -m; a <= m; a++)
    for (let b = -m; b <= m; b++)
      for (let c = -m; c <= m; c++) {
        const zero = a === 0 && b === 0 && c === 0;
        // for i === j keep one of each pair of opposite shifts
        const positiveHalf = a > 0 || (a === 0 && (b > 0 || (b === 0 && c > 0)));
        const sx = a * L;
        const sy = b * L;
        const sz = c * L;
        for (let i = 0; i < n; i++)
          for (let j = i; j < n; j++) {
            if (i === j && (zero || !positiveHalf)) continue;
            const dx = pos[3 * j]! + sx - pos[3 * i]!;
            const dy = pos[3 * j + 1]! + sy - pos[3 * i + 1]!;
            const dz = pos[3 * j + 2]! + sz - pos[3 * i + 2]!;
            if (dx * dx + dy * dy + dz * dz < cut2) {
              I.push(i);
              J.push(j);
              S.push(sx, sy, sz);
            }
          }
      }
  return {
    i: Int32Array.from(I),
    j: Int32Array.from(J),
    shift: Float64Array.from(S),
    ref: Float64Array.from(pos),
    skin,
    minimumImage: false,
  };
}

/** True when some atom moved more than half the skin since the list was built (the list must be rebuilt). */
export function pairsStale(list: PairList, pos: Float64Array): boolean {
  if (list.minimumImage) return false;
  const lim = (list.skin / 2) ** 2;
  for (let k = 0; k < pos.length; k += 3) {
    const dx = pos[k]! - list.ref[k]!;
    const dy = pos[k + 1]! - list.ref[k + 1]!;
    const dz = pos[k + 2]! - list.ref[k + 2]!;
    if (dx * dx + dy * dy + dz * dz > lim) return true;
  }
  return false;
}

/** Total potential energy (eV) and forces (eV / angstrom, flat xyz) from a pair list. */
export function energyForces(
  pos: Float64Array,
  sys: LJSystem,
  list: PairList,
): { energy: number; forces: Float64Array } {
  const f = new Float64Array(pos.length);
  let energy = 0;
  const { species, types, rc } = sys;
  // per species pair: sigma^2, eps and the energy shift at the cutoff (same formula as ljPair, inlined for speed)
  const ns = species.length;
  const sig2 = new Float64Array(ns * ns);
  const eps = new Float64Array(ns * ns);
  const shift = new Float64Array(ns * ns);
  for (let a = 0; a < ns; a++)
    for (let b = 0; b < ns; b++) {
      const s = (species[a]!.sigma + species[b]!.sigma) / 2;
      const e = Math.sqrt(species[a]!.epsilon * species[b]!.epsilon);
      const c6 = (s / rc) ** 6;
      sig2[a * ns + b] = s * s;
      eps[a * ns + b] = e;
      shift[a * ns + b] = 4 * e * (c6 * c6 - c6);
    }
  const rc2 = rc * rc;
  const L = sys.box;
  const pair = (i: number, j: number, dx: number, dy: number, dz: number): void => {
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 >= rc2) return;
    const t = types[i]! * ns + types[j]!;
    const s2 = sig2[t]! / r2;
    const s6 = s2 * s2 * s2;
    const e4 = 4 * eps[t]!;
    energy += e4 * (s6 * s6 - s6) - shift[t]!;
    const fOverR = (6 * e4 * (2 * s6 * s6 - s6)) / r2;
    f[3 * i] = f[3 * i]! - fOverR * dx;
    f[3 * i + 1] = f[3 * i + 1]! - fOverR * dy;
    f[3 * i + 2] = f[3 * i + 2]! - fOverR * dz;
    f[3 * j] = f[3 * j]! + fOverR * dx;
    f[3 * j + 1] = f[3 * j + 1]! + fOverR * dy;
    f[3 * j + 2] = f[3 * j + 2]! + fOverR * dz;
  };
  if (list.minimumImage) {
    const n = types.length;
    const H = L / 2;
    for (let i = 0; i < n; i++) {
      const xi = pos[3 * i]!;
      const yi = pos[3 * i + 1]!;
      const zi = pos[3 * i + 2]!;
      for (let j = i + 1; j < n; j++) {
        let dx = pos[3 * j]! - xi;
        let dy = pos[3 * j + 1]! - yi;
        let dz = pos[3 * j + 2]! - zi;
        while (dx > H) dx -= L;
        while (dx < -H) dx += L;
        while (dy > H) dy -= L;
        while (dy < -H) dy += L;
        while (dz > H) dz -= L;
        while (dz < -H) dz += L;
        pair(i, j, dx, dy, dz);
      }
    }
  } else {
    const { i: I, j: J, shift: S } = list;
    for (let p = 0; p < I.length; p++) {
      const i = I[p]!;
      const j = J[p]!;
      pair(
        i,
        j,
        pos[3 * j]! + S[3 * p]! - pos[3 * i]!,
        pos[3 * j + 1]! + S[3 * p + 1]! - pos[3 * i + 1]!,
        pos[3 * j + 2]! + S[3 * p + 2]! - pos[3 * i + 2]!,
      );
    }
  }
  return { energy, forces: f };
}

/** Conventional fcc positions of an n x n x n block of cubes of edge a (4 n^3 atoms), flat xyz. */
export function fccPositions(n: number, a: number): Float64Array {
  const basis = [
    [0, 0, 0],
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ];
  const out: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        for (const b of basis) out.push((i + b[0]!) * a, (j + b[1]!) * a, (k + b[2]!) * a);
  return Float64Array.from(out);
}

/** Energy per atom of a perfect fcc crystal of one species with cubic edge a, eV. */
export function fccEnergyPerAtom(
  a: number,
  sp: LJSpecies = ARGON,
  rc = DEFAULT_CUTOFF_SIGMA * sp.sigma,
): number {
  const pos = fccPositions(1, a);
  const sys: LJSystem = { box: a, types: [0, 0, 0, 0], species: [sp], rc };
  return energyForces(pos, sys, buildPairs(pos, sys, 0)).energy / 4;
}

const latticeCache = new Map<string, number>();
/** Cubic edge of the zero-temperature fcc crystal (minimum of the energy per atom), angstrom. Golden-section search. */
export function fccLatticeConstant(sp: LJSpecies = ARGON, rc = DEFAULT_CUTOFF_SIGMA * sp.sigma): number {
  const key = `${sp.sigma}|${sp.epsilon}|${rc}`;
  const hit = latticeCache.get(key);
  if (hit !== undefined) return hit;
  let lo = 1.45 * sp.sigma;
  let hi = 1.7 * sp.sigma;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = fccEnergyPerAtom(x1, sp, rc);
  let f2 = fccEnergyPerAtom(x2, sp, rc);
  for (let it = 0; it < 80; it++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = fccEnergyPerAtom(x1, sp, rc);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = fccEnergyPerAtom(x2, sp, rc);
    }
  }
  const a = (lo + hi) / 2;
  latticeCache.set(key, a);
  return a;
}

export interface RelaxFrame {
  pos: Float64Array;
  energy: number;
  maxForce: number;
}

/**
 * Steepest descent with a step that grows after a downhill move and halves after an uphill one; no atom moves more
 * than `maxStep` angstrom in one step. Frame 0 is the input. The pair list is rebuilt when an atom leaves the skin.
 */
export function relaxSteepest(
  pos0: Float64Array,
  sys: LJSystem,
  steps: number,
  o: { maxStep?: number; alpha?: number } = {},
): RelaxFrame[] {
  const maxStep = o.maxStep ?? 0.05;
  let alpha = o.alpha ?? 2; // angstrom^2 / eV
  let pos = Float64Array.from(pos0);
  let list = buildPairs(pos, sys);
  let cur = energyForces(pos, sys, list);
  const maxF = (f: Float64Array) => {
    let m = 0;
    for (let k = 0; k < f.length; k += 3) m = Math.max(m, Math.hypot(f[k]!, f[k + 1]!, f[k + 2]!));
    return m;
  };
  const frames: RelaxFrame[] = [
    { pos: Float64Array.from(pos), energy: cur.energy, maxForce: maxF(cur.forces) },
  ];
  for (let s = 0; s < steps; s++) {
    for (let tries = 0; tries < 20; tries++) {
      const fm = maxF(cur.forces);
      const scaleF = fm * alpha > maxStep ? maxStep / fm : alpha;
      const trial = new Float64Array(pos.length);
      for (let k = 0; k < pos.length; k++) trial[k] = pos[k]! + scaleF * cur.forces[k]!;
      if (pairsStale(list, trial)) list = buildPairs(trial, sys);
      const next = energyForces(trial, sys, list);
      if (next.energy <= cur.energy + 1e-12) {
        pos = trial;
        cur = next;
        alpha *= 1.2;
        break;
      }
      alpha /= 2;
    }
    frames.push({ pos: Float64Array.from(pos), energy: cur.energy, maxForce: maxF(cur.forces) });
  }
  return frames;
}

/** Seeded uniform random numbers in [0, 1) (mulberry32), so every run of the stage is the same. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal numbers from a uniform generator (Box-Muller). */
export function gaussian(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = Math.max(rand(), 1e-300);
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** Kinetic energy in eV of velocities in angstrom / fs. */
export function kineticEnergy(vel: Float64Array, sys: LJSystem): number {
  let k = 0;
  for (let a = 0; a < sys.types.length; a++) {
    const m = sys.species[sys.types[a]!]!.mass;
    k += 0.5 * m * (vel[3 * a]! ** 2 + vel[3 * a + 1]! ** 2 + vel[3 * a + 2]! ** 2);
  }
  return k / ACCEL;
}

/** Instantaneous temperature, K, with the 3 degrees of freedom of the centre of mass removed. */
export const temperature = (vel: Float64Array, sys: LJSystem): number =>
  (2 * kineticEnergy(vel, sys)) / ((3 * sys.types.length - 3) * BOLTZMANN_EV_K);

/** Maxwell-Boltzmann velocities at temperature T (K), zero total momentum, rescaled to exactly T. */
export function maxwellVelocities(sys: LJSystem, T: number, rand: () => number): Float64Array {
  const n = sys.types.length;
  const g = gaussian(rand);
  const v = new Float64Array(3 * n);
  let px = 0;
  let py = 0;
  let pz = 0;
  let mt = 0;
  for (let a = 0; a < n; a++) {
    const m = sys.species[sys.types[a]!]!.mass;
    const s = Math.sqrt((BOLTZMANN_EV_K * T * ACCEL) / m);
    v[3 * a] = s * g();
    v[3 * a + 1] = s * g();
    v[3 * a + 2] = s * g();
    px += m * v[3 * a]!;
    py += m * v[3 * a + 1]!;
    pz += m * v[3 * a + 2]!;
    mt += m;
  }
  for (let a = 0; a < n; a++) {
    v[3 * a] = v[3 * a]! - px / mt;
    v[3 * a + 1] = v[3 * a + 1]! - py / mt;
    v[3 * a + 2] = v[3 * a + 2]! - pz / mt;
  }
  const t0 = temperature(v, sys);
  const f = t0 > 0 ? Math.sqrt(T / t0) : 0;
  for (let k = 0; k < v.length; k++) v[k] = v[k]! * f;
  return v;
}

/** Verlet-list skin of the MD runs, angstrom (small enough that a 3 x 3 x 3 argon box uses minimum image). */
export const MD_SKIN = 0.25;

export interface MDOptions {
  /** Time step, fs. */
  dt: number;
  /** Target temperature for the thermostat and the start, K. */
  temperature: number;
  thermostat: 'nve' | 'andersen';
  /** Andersen collision frequency per atom, 1/fs. */
  collisionRate?: number;
  seed?: number;
}

export interface MDFrame {
  /** Unwrapped positions, angstrom. */
  pos: Float64Array;
  time: number;
  potential: number;
  kinetic: number;
  temperature: number;
}

/**
 * A molecular dynamics run that is advanced on demand and remembers every frame (the stage asks for frame k). Velocity
 * Verlet; with the Andersen thermostat each atom gets a fresh Maxwell-Boltzmann velocity with probability nu dt per
 * step (S-126). A run that blows up (non-finite numbers, or an atom jumping more than 2 angstrom in one step) stops
 * and keeps its last good frame, with `blewUpAt` set.
 */
export class MDRun {
  readonly frames: MDFrame[] = [];
  blewUpAt: number | null = null;
  private pos: Float64Array;
  private vel: Float64Array;
  private forces: Float64Array;
  private potential: number;
  private list: PairList;
  private rand: () => number;
  private gauss: () => number;
  private step = 0;

  constructor(
    readonly sys: LJSystem,
    pos0: Float64Array,
    readonly opts: MDOptions,
    readonly stepsPerFrame = 1,
  ) {
    this.rand = mulberry32(opts.seed ?? 7);
    this.gauss = gaussian(mulberry32((opts.seed ?? 7) + 101));
    this.pos = Float64Array.from(pos0);
    this.vel = maxwellVelocities(sys, opts.temperature, this.rand);
    this.list = buildPairs(this.pos, sys, MD_SKIN);
    const ef = energyForces(this.pos, sys, this.list);
    this.forces = ef.forces;
    this.potential = ef.energy;
    this.record();
  }

  private record(): void {
    this.frames.push({
      pos: Float64Array.from(this.pos),
      time: this.step * this.opts.dt,
      potential: this.potential,
      kinetic: kineticEnergy(this.vel, this.sys),
      temperature: temperature(this.vel, this.sys),
    });
  }

  /** One velocity Verlet step (plus the thermostat). Returns false when the run blew up. */
  private once(): boolean {
    const { dt } = this.opts;
    const { sys } = this;
    const n = sys.types.length;
    const next = new Float64Array(this.pos.length);
    for (let a = 0; a < n; a++) {
      const k = ACCEL / sys.species[sys.types[a]!]!.mass;
      for (let d = 0; d < 3; d++) {
        const q = 3 * a + d;
        this.vel[q] = this.vel[q]! + 0.5 * dt * k * this.forces[q]!;
        const dx = dt * this.vel[q]!;
        if (!Number.isFinite(dx) || Math.abs(dx) > 2) return false;
        next[q] = this.pos[q]! + dx;
      }
    }
    if (pairsStale(this.list, next)) this.list = buildPairs(next, sys, MD_SKIN);
    const ef = energyForces(next, sys, this.list);
    if (!Number.isFinite(ef.energy)) return false;
    for (let a = 0; a < n; a++) {
      const k = ACCEL / sys.species[sys.types[a]!]!.mass;
      for (let d = 0; d < 3; d++)
        this.vel[3 * a + d] = this.vel[3 * a + d]! + 0.5 * dt * k * ef.forces[3 * a + d]!;
    }
    if (this.opts.thermostat === 'andersen') {
      const p = (this.opts.collisionRate ?? 0.005) * dt;
      for (let a = 0; a < n; a++) {
        if (this.rand() >= p) continue;
        const s = Math.sqrt(
          (BOLTZMANN_EV_K * this.opts.temperature * ACCEL) / sys.species[sys.types[a]!]!.mass,
        );
        for (let d = 0; d < 3; d++) this.vel[3 * a + d] = s * this.gauss();
      }
    }
    this.pos = next;
    this.forces = ef.forces;
    this.potential = ef.energy;
    this.step++;
    return true;
  }

  /** Advance until frame k exists (or the run blew up). Returns the frame to show. */
  frame(k: number): MDFrame {
    while (this.frames.length <= k && this.blewUpAt === null) {
      for (let s = 0; s < this.stepsPerFrame; s++) {
        if (!this.once()) {
          this.blewUpAt = this.step;
          break;
        }
      }
      if (this.blewUpAt !== null) break;
      this.record();
    }
    return this.frames[Math.min(k, this.frames.length - 1)]!;
  }
}
