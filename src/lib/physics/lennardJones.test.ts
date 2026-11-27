import { describe, expect, it } from 'vitest';
import {
  ACCEL,
  ARGON,
  MDRun,
  buildPairs,
  energyForces,
  fccEnergyPerAtom,
  fccLatticeConstant,
  fccPositions,
  kineticEnergy,
  ljPair,
  maxwellVelocities,
  mulberry32,
  relaxSteepest,
  temperature,
  type LJSystem,
} from './lennardJones';

const { sigma, epsilon } = ARGON;

describe('Lennard-Jones pair (S-125)', () => {
  it('has its minimum -eps at 2^(1/6) sigma and zero energy at sigma (cutoff far away)', () => {
    const rc = 50 * sigma;
    const r0 = 2 ** (1 / 6) * sigma;
    expect(ljPair(r0 * r0, sigma, epsilon, rc).e).toBeCloseTo(-epsilon, 9);
    expect(ljPair(r0 * r0, sigma, epsilon, rc).fOverR).toBeCloseTo(0, 9);
    expect(ljPair(sigma * sigma, sigma, epsilon, rc).e).toBeCloseTo(0, 9);
  });

  it('is shifted to zero at the cutoff and its force is minus the derivative of its energy', () => {
    const rc = 2.5 * sigma;
    expect(ljPair(rc * rc * (1 - 1e-12), sigma, epsilon, rc).e).toBeCloseTo(0, 12);
    expect(ljPair(rc * rc, sigma, epsilon, rc).e).toBe(0);
    for (const r of [0.95, 1.1, 1.4, 2.0].map((x) => x * sigma)) {
      const h = 1e-6;
      const dE =
        (ljPair((r + h) ** 2, sigma, epsilon, rc).e - ljPair((r - h) ** 2, sigma, epsilon, rc).e) / (2 * h);
      expect(ljPair(r * r, sigma, epsilon, rc).fOverR * r).toBeCloseTo(-dE, 7);
    }
  });

  it('converts eV / angstrom / u to angstrom / fs^2 (CODATA 2018, S-031)', () => {
    // 1 eV/(u angstrom) = 9.648533e17 m/s^2 = 9.648533e-3 angstrom/fs^2
    expect(ACCEL).toBeCloseTo(9.648533e-3, 9);
  });
});

describe('fcc Lennard-Jones crystal against the lattice sums (Ashcroft and Mermin table 20.4, S-036)', () => {
  const A12 = 12.13188;
  const A6 = 14.45392;
  // The truncated and shifted sum misses the attractive tail and adds the shift, each about (8 pi / 3) rho sigma^3 eps
  // (sigma / r_c)^3 (Frenkel and Smit, S-125): 0.007 eps at r_c = 14 sigma, inside the tolerance.
  it('matches E/N = 2 eps (A12 (sigma/r)^12 - A6 (sigma/r)^6) with a long cutoff', () => {
    for (const rnn of [1.05, 1.09, 1.15]) {
      const a = rnn * sigma * Math.SQRT2;
      const ref = 2 * epsilon * (A12 / rnn ** 12 - A6 / rnn ** 6);
      expect(Math.abs(fccEnergyPerAtom(a, ARGON, 14 * sigma) - ref) / epsilon).toBeLessThan(0.01);
    }
  });
  it('has its zero-temperature nearest-neighbour distance at (2 A12 / A6)^(1/6) sigma = 1.0902 sigma', () => {
    const a = fccLatticeConstant(ARGON, 14 * sigma);
    expect(a / Math.SQRT2 / sigma).toBeCloseTo(((2 * A12) / A6) ** (1 / 6), 2);
    expect(fccEnergyPerAtom(a, ARGON, 14 * sigma) / epsilon).toBeCloseTo(-(A6 * A6) / (2 * A12), 1);
  });
});

describe('periodic images', () => {
  it('gives the same energy per atom for 1, 2 and 3 cubes per edge (image enumeration and minimum image agree)', () => {
    const a = fccLatticeConstant();
    const e = [1, 2, 3].map((n) => {
      const pos = fccPositions(n, a);
      const sys: LJSystem = {
        box: n * a,
        types: Array(4 * n ** 3).fill(0),
        species: [ARGON],
        rc: 2.25 * sigma,
      };
      const list = buildPairs(pos, sys, 0);
      if (n === 3) expect(list.minimumImage).toBe(true);
      else expect(list.minimumImage).toBe(false);
      return energyForces(pos, sys, list).energy / (4 * n ** 3);
    });
    expect(e[1]!).toBeCloseTo(e[0]!, 12);
    expect(e[2]!).toBeCloseTo(e[0]!, 12);
  });

  it('forces are minus the gradient of the energy in a distorted small cell', () => {
    const a = fccLatticeConstant();
    const pos = fccPositions(1, a);
    const r = mulberry32(3);
    for (let k = 0; k < pos.length; k++) pos[k] = pos[k]! + 0.2 * (r() - 0.5);
    const sys: LJSystem = { box: a, types: [0, 0, 0, 0], species: [ARGON], rc: 2.25 * sigma };
    const list = buildPairs(pos, sys, 0.5);
    const { forces } = energyForces(pos, sys, list);
    for (const q of [0, 4, 11]) {
      const h = 1e-5;
      const p1 = Float64Array.from(pos);
      const p2 = Float64Array.from(pos);
      p1[q] = p1[q]! + h;
      p2[q] = p2[q]! - h;
      const d = (energyForces(p1, sys, list).energy - energyForces(p2, sys, list).energy) / (2 * h);
      expect(forces[q]!).toBeCloseTo(-d, 7);
    }
  });
});

describe('relaxation', () => {
  it('never raises the energy', () => {
    const a = fccLatticeConstant();
    const pos = fccPositions(2, a);
    const r = mulberry32(5);
    for (let k = 0; k < pos.length; k++) pos[k] = pos[k]! + 0.15 * (r() - 0.5);
    const sys: LJSystem = { box: 2 * a, types: Array(32).fill(0), species: [ARGON], rc: 2.25 * sigma };
    const frames = relaxSteepest(pos, sys, 30);
    for (let k = 1; k < frames.length; k++)
      expect(frames[k]!.energy).toBeLessThanOrEqual(frames[k - 1]!.energy + 1e-12);
    expect(frames[30]!.maxForce).toBeLessThan(frames[0]!.maxForce / 5);
  });
});

describe('molecular dynamics (velocity Verlet, S-125; Andersen thermostat, S-126)', () => {
  const a = fccLatticeConstant();
  const sys: LJSystem = { box: 3 * a, types: Array(108).fill(0), species: [ARGON], rc: 2.25 * sigma };

  it('starts at the requested temperature with zero total momentum', () => {
    const v = maxwellVelocities(sys, 80, mulberry32(1));
    expect(temperature(v, sys)).toBeCloseTo(80, 9);
    for (let d = 0; d < 3; d++) {
      let p = 0;
      for (let i = 0; i < 108; i++) p += v[3 * i + d]!;
      expect(Math.abs(p)).toBeLessThan(1e-12);
    }
    expect(kineticEnergy(v, sys)).toBeGreaterThan(0);
  });

  it('follows a dimer oscillation as a fine Runge-Kutta reference does', () => {
    const box = 40;
    const d0 = 1.2 * sigma;
    const two: LJSystem = { box, types: [0, 0], species: [ARGON], rc: 3 * sigma };
    const pos = Float64Array.from([0, 0, 0, d0, 0, 0]);
    const run = new MDRun(two, pos, { dt: 1, temperature: 0, thermostat: 'nve' }, 1);
    // reference: relative coordinate r'' = -2 V'(r) / m (reduced mass m/2), RK4 with dt 0.01 fs
    let r = d0;
    let v = 0;
    const acc = (x: number) => (2 * ljPair(x * x, sigma, epsilon, 3 * sigma).fOverR * x * ACCEL) / ARGON.mass;
    const h = 0.01;
    for (let s = 0; s < 400 * 100; s++) {
      const k1 = [v, acc(r)];
      const k2 = [v + (h / 2) * k1[1]!, acc(r + (h / 2) * k1[0]!)];
      const k3 = [v + (h / 2) * k2[1]!, acc(r + (h / 2) * k2[0]!)];
      const k4 = [v + h * k3[1]!, acc(r + h * k3[0]!)];
      r += (h / 6) * (k1[0]! + 2 * k2[0]! + 2 * k3[0]! + k4[0]!);
      v += (h / 6) * (k1[1]! + 2 * k2[1]! + 2 * k3[1]! + k4[1]!);
    }
    const f = run.frame(400);
    expect(Math.abs(f.pos[3]! - f.pos[0]! - r)).toBeLessThan(2e-3);
    expect(Math.abs(r - d0)).toBeGreaterThan(0.1); // it really moved
  });

  it('conserves the total energy without a thermostat at a short time step, and drifts more at a long one', () => {
    const drift = (dt: number) => {
      const run = new MDRun(sys, fccPositions(3, a), { dt, temperature: 60, thermostat: 'nve', seed: 2 }, 5);
      const f0 = run.frame(0);
      const e0 = f0.potential + f0.kinetic;
      let worst = 0;
      for (let k = 1; k <= 40; k++) {
        const f = run.frame(k);
        worst = Math.max(worst, Math.abs(f.potential + f.kinetic - e0) / 108);
      }
      return worst;
    };
    const short = drift(2);
    expect(short).toBeLessThan(5e-5); // eV per atom
    expect(drift(40)).toBeGreaterThan(5 * short);
  });

  it('holds the mean temperature near the target with the Andersen thermostat', () => {
    const run = new MDRun(
      sys,
      fccPositions(3, a),
      { dt: 5, temperature: 100, thermostat: 'andersen', seed: 4 },
      5,
    );
    let sum = 0;
    let n = 0;
    for (let k = 30; k <= 120; k++) {
      sum += run.frame(k).temperature;
      n++;
    }
    expect(Math.abs(sum / n - 100)).toBeLessThan(15);
  });

  it('stops and says so when a time step is far too long', () => {
    const run = new MDRun(sys, fccPositions(3, a), { dt: 80, temperature: 300, thermostat: 'nve' }, 5);
    run.frame(50);
    expect(run.blewUpAt).not.toBeNull();
    for (const f of run.frames) expect(f.pos.every(Number.isFinite)).toBe(true);
  });
});
