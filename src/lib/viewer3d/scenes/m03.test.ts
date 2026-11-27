// Physics of the module 3 scenes against the libraries and closed forms (the generic rules are in scenes.test.ts).
import { describe, expect, it } from 'vitest';
import { binomial, formatBig } from '../../physics/combinatorics';
import { runScf } from '../../physics/scf1d';
import { withDefaults, type Params } from '../types';
import { densityAtNucleus, modelEnergy, occupations, productState, scenes, shellDensity } from './m03';
import { GRID, model } from './toy1d';

const build = (id: string, p: Params = {}) => {
  const d = scenes[id]!;
  return d.build(withDefaults(d, p));
};
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;

describe('m03-two-electron', () => {
  it('reads out the exact model energy; with the repulsion off it equals the repulsion-free energy', () => {
    const f = build('m03-two-electron', { Z: '2', lambda: 1 });
    expect(readout(f, 'Energy')).toContain(model(2, 1).energy.toFixed(3));
    const f0 = build('m03-two-electron', { Z: '2', lambda: 0 });
    expect(readout(f0, 'Energy')).toBe(readout(f0, 'Without repulsion'));
    expect(readout(f0, 'Meeting at the centre')).toMatch(/^100 %/);
  });
  it('repulsion makes the electrons avoid each other: the meeting ratio falls below 100 %', () => {
    const pct = (l: number) =>
      parseFloat(readout(build('m03-two-electron', { Z: '1', lambda: l }), 'Meeting at the centre'));
    expect(pct(1)).toBeLessThan(pct(0.5));
    expect(pct(0.5)).toBeLessThan(100);
  });
  it('says when the second electron is no longer bound (Z = 1, strong repulsion)', () => {
    const s = model(1, 2);
    expect(s.energy).toBeGreaterThan(s.oneElectron[0]);
    expect(build('m03-two-electron', { Z: '1', lambda: 2 }).describe).toMatch(/not bound/);
    expect(build('m03-two-electron', { Z: '2', lambda: 1 }).describe).not.toMatch(/not bound/);
  });
});

describe('m03-exponential-wall (S-048, exact integers)', () => {
  it('counts C(40, 20) = 137 846 528 820 determinants, 1.1 TB at 8 bytes each (the topic text)', () => {
    const f = build('m03-exponential-wall', { count: 'determinants', electrons: 20, orbitals: 40 });
    expect(readout(f, 'Determinants')).toBe(formatBig(binomial(40, 20)));
    expect(readout(f, 'Memory at 8 bytes')).toBe('1.1 TB');
  });
  it('grid mode: 10 electrons on 10 points per axis need 10^30 values', () => {
    const f = build('m03-exponential-wall', { count: 'grid', electrons: 10, points: 10 });
    expect(readout(f, 'Grid values')).toBe('1.000 x 10^30');
    expect(readout(f, 'log10 count')).toBe('30.00');
  });
  it('the surface is log10 C(M, N) at every node', () => {
    const f = build('m03-exponential-wall', { count: 'determinants' });
    const mesh = f.layers.find((l) => l.group === 'surface')!;
    if (mesh.kind !== 'mesh') throw new Error('surface is not a mesh');
    // node (N = 5, M = 12): i = 4, j = 10, x fastest with 20 nodes per row
    const v = mesh.values![4 + 20 * 10]!;
    expect(v).toBeCloseTo(Math.log10(Number(binomial(12, 5))), 12);
  });
});

describe('m03-density (hydrogen orbitals, S-047)', () => {
  it('fills two electrons per orbital', () => {
    expect(occupations(1)).toEqual([1, 0, 0, 0, 0]);
    expect(occupations(5)).toEqual([2, 2, 1, 0, 0]);
    expect(occupations(10)).toEqual([2, 2, 2, 2, 2]);
  });
  it('the grid holds the electron count within 3 % (coarse 40-point grid)', () => {
    for (const e of [1, 2, 4, 7, 10]) expect(Math.abs(shellDensity(e).sum - e) / e).toBeLessThan(0.03);
  });
  it('density at the nucleus: 1/pi per 1s electron and 1/(8 pi) per 2s electron', () => {
    expect(densityAtNucleus(2)).toBeCloseTo(2 / Math.PI, 14);
    expect(densityAtNucleus(10)).toBeCloseTo(2 / Math.PI + 2 / (8 * Math.PI), 14);
  });
  it('a full n = 2 shell is spherical, a single 2p_z electron makes it longer along z', () => {
    const n = 40;
    const c = 8; // a point off the centre along one axis line (grid index 20 is next to the centre)
    const at = (d: { values: Float64Array }, i: number, j: number, k: number) =>
      d.values[i + n * (j + n * k)]!;
    const full = shellDensity(10);
    expect(at(full, c, 20, 20)).toBeCloseTo(at(full, 20, 20, c), 12);
    expect(at(full, c, 20, 20)).toBeCloseTo(at(full, 20, c, 20), 12);
    const pz = shellDensity(5);
    expect(at(pz, 20, 20, c)).toBeGreaterThan(at(pz, c, 20, 20));
  });
});

describe('m03-projection', () => {
  it('the full projection collects exactly 2 electrons, and adding up x2 only gains', () => {
    const got = (sweep: number) =>
      parseFloat(readout(build('m03-projection', { sweep }), 'Electrons collected'));
    expect(got(1)).toBeCloseTo(2, 3);
    expect(got(0)).toBeLessThan(0.01);
    expect(got(0.3)).toBeLessThan(got(0.6));
    expect(got(0.5)).toBeCloseTo(1, 1); // half of a symmetric density
  });
});

describe('m03-approximations (variational principle, S-048)', () => {
  it('the Hartree-Fock product phi(x1) phi(x2) has exactly the scf1d energy on the same grid (1e-8)', () => {
    for (const Z of [1, 2]) {
      const r = runScf({ Z, L: GRID.L, M: GRID.M });
      expect(Math.abs(modelEnergy(Z, productState(r.density, GRID.M)) - r.energy)).toBeLessThan(1e-8);
    }
  });
  it('both approximations lie above the exact energy, Hartree-Fock closer than independent electrons', () => {
    for (const Z of ['1', '2']) {
      const err = (approx: string) =>
        parseFloat(readout(build('m03-approximations', { Z, approx }), 'Energy error'));
      expect(err('hartree-fock')).toBeGreaterThan(0);
      expect(err('independent')).toBeGreaterThan(err('hartree-fock'));
    }
  });
});
