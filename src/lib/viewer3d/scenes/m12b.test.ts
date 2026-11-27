// Physics of the module 12 new-topic scenes: the numbers each stage shows, against the tested libraries and closed forms.
import { describe, expect, it } from 'vitest';
import { cubicMoyo } from '../../crystal/cubicSymmetry';
import { shortestLatticeVector } from '../../crystal/defects';
import { buildSlab } from '../../crystal/slab';
import { decompose, hullFacets } from '../../physics/hull';
import { fccLatticeConstant } from '../../physics/lennardJones';
import { mullerBrown, MB_MINIMA, MB_SADDLES, refineStationary } from '../../physics/neb';
import { lookupStructure } from '../../scene/library';
import { withDefaults } from '../types';
import {
  DEFECT_STEPS,
  HULL_SAMPLE,
  HULL_Z,
  NEB_ITERS,
  defectFormationEnergy,
  defectModel,
  exactBarrier,
  hullPoint,
  mdRun,
  nebFrames,
  scenes,
  slabModel,
} from './m12b';

describe('m12b-slab', () => {
  it('holds whole bulk repeats as cut, and one more layer for a symmetric termination', () => {
    for (const crystal of ['perovskite', 'rocksalt', 'fcc'])
      for (const hkl of [
        [1, 0, 0],
        [1, 1, 1],
      ] as const) {
        const cut = slabModel(crystal, hkl, 3, 12, 'cut', false);
        const ref = buildSlab(cubicMoyo, lookupStructure(crystal)!, hkl, { layers: 3 });
        expect(cut.species.length).toBe(3 * ref.plan.atomsPerPeriod);
        expect(cut.c).toBeCloseTo(cut.thickness + 12, 9);
        const both = slabModel(crystal, hkl, 3, 12, 'bottom', false);
        expect(both.species.length).toBe(cut.species.length + cut.layers[0]!.atoms.length);
        expect(both.layers.length).toBe(cut.layers.length + 1);
      }
  });

  it('has the dipole of the tested polarity heuristic for the as-cut slab (S-063)', () => {
    for (const [crystal, hkl] of [
      ['rocksalt', [1, 1, 1]],
      ['perovskite', [1, 1, 0]],
      ['perovskite', [1, 0, 0]],
    ] as const) {
      const m = slabModel(crystal, hkl, 2, 10, 'cut', false);
      expect(m.dipolePerArea).toBeCloseTo(m.slab.polarity.dipolePerArea!, 9);
    }
  });

  it('a polar slab: a field across the vacuum without the correction, flat vacuum and a step with it', () => {
    const off = slabModel('rocksalt', [1, 1, 1], 3, 14, 'cut', false);
    const on = slabModel('rocksalt', [1, 1, 1], 3, 14, 'cut', true);
    expect(off.slab.polarity.tasker).toBe(3);
    expect(Math.abs(off.vacuumSlope)).toBeGreaterThan(0.02);
    expect(Math.abs(on.vacuumSlope)).toBeLessThan(1e-3);
    expect(Math.abs(on.vacuumTop - on.vacuumBottom)).toBeGreaterThan(0.5);
    // the polar catastrophe: the step grows with thickness
    const thick = slabModel('rocksalt', [1, 1, 1], 6, 14, 'cut', true);
    expect(Math.abs(thick.vacuumTop - thick.vacuumBottom)).toBeGreaterThan(
      1.8 * Math.abs(on.vacuumTop - on.vacuumBottom),
    );
  });

  it('a non-polar or symmetric slab: equal vacuum levels with or without the correction', () => {
    for (const [crystal, hkl, term] of [
      ['perovskite', [1, 0, 0], 'cut'],
      ['perovskite', [1, 0, 0], 'bottom'],
      ['rocksalt', [1, 0, 0], 'cut'],
      ['fcc', [1, 1, 1], 'cut'],
    ] as const) {
      for (const corr of [false, true]) {
        const m = slabModel(crystal, hkl, 3, 12, term, corr);
        expect(Math.abs(m.dipolePerArea)).toBeLessThan(1e-9);
        expect(Math.abs(m.vacuumTop - m.vacuumBottom)).toBeLessThan(1e-6);
      }
    }
    expect(slabModel('perovskite', [1, 0, 0], 3, 12, 'bottom', false).symmetricFaces).toBe(true);
    expect(slabModel('perovskite', [1, 0, 0], 3, 12, 'cut', false).symmetricFaces).toBe(false);
  });
});

describe('m12b-defect', () => {
  const a0 = fccLatticeConstant();

  it('the image distance is the shortest lattice vector of the supercell, n a0', () => {
    for (const n of [1, 2, 3, 4]) {
      const m = defectModel('vacancy', n);
      expect(m.imageDistance).toBeCloseTo(n * a0, 9);
      expect(
        shortestLatticeVector([
          [m.box, 0, 0],
          [0, m.box, 0],
          [0, 0, m.box],
        ]),
      ).toBeCloseTo(m.imageDistance, 9);
    }
  });

  it('an unrelaxed vacancy in a pair-potential crystal costs minus the energy per atom (closed form)', () => {
    for (const n of [2, 3, 4]) {
      const m = defectModel('vacancy', n);
      expect(defectFormationEnergy(m, 0)).toBeCloseTo(-m.ePerAtom, 9);
      expect(m.types.length).toBe(4 * n ** 3 - 1);
    }
    // in the 1 x 1 x 1 cell the vacancy is closer to its images than the cutoff: they interact and the closed form fails
    const small = defectModel('vacancy', 1);
    expect(small.imageDistance).toBeLessThan(2.25 * 3.405);
    expect(Math.abs(defectFormationEnergy(small, 0) + small.ePerAtom)).toBeGreaterThan(1e-3);
  });

  it('relaxation lowers the energy step by step and moves the neighbours', () => {
    for (const kind of ['vacancy', 'interstitial', 'substitution']) {
      const m = defectModel(kind, 2);
      for (let k = 1; k <= DEFECT_STEPS; k++)
        expect(m.frames[k]!.energy).toBeLessThanOrEqual(m.frames[k - 1]!.energy + 1e-12);
      expect(m.frames[DEFECT_STEPS]!.energy).toBeLessThan(m.frames[0]!.energy);
      expect(m.neighbours.length).toBe(kind === 'interstitial' ? 6 : 12);
    }
  });

  it('the vacancy formation energy converges with supercell size', () => {
    const e = [2, 3, 4].map((n) => defectFormationEnergy(defectModel('vacancy', n), DEFECT_STEPS));
    expect(Math.abs(e[2]! - e[1]!)).toBeLessThan(Math.abs(e[1]! - e[0]!) + 1e-4);
    expect(Math.abs(e[2]! - e[1]!)).toBeLessThan(0.002);
  });
});

describe('m12b-hull', () => {
  it('the facets drawn are the lower hull of the sample, and the readout is the energy above it', () => {
    const def = scenes['m12b-hull']!;
    const facets = hullFacets(HULL_SAMPLE);
    for (const h of HULL_SAMPLE.slice(3)) {
      const f = def.build(withDefaults(def, { phase: h.name }));
      const d = decompose(HULL_SAMPLE, facets, h.counts, h.energy);
      const above = f.readouts!.find((r) => r.label === 'Energy above hull')!.value;
      expect(above).toBe(`${(d.aboveHull * 1000).toFixed(0)} meV/atom`);
      const mesh = f.layers.find((l) => l.kind === 'mesh' && l.group === 'hull');
      expect(mesh && mesh.kind === 'mesh' ? mesh.indices!.length / 3 : 0).toBe(facets.length);
    }
  });

  it('places each phase at its composition and energy, the elements at the corners at zero', () => {
    expect(hullPoint([1, 0, 0], 0)).toEqual([0, 0, 0]);
    expect(hullPoint([0, 1, 0], 0)).toEqual([10, 0, 0]);
    const c = hullPoint([0, 0, 1], 0);
    expect(Math.hypot(c[0] - 10, c[1])).toBeCloseTo(10, 12);
    expect(hullPoint([1, 1, 0], -0.5)).toEqual([5, 0, -0.5 * HULL_Z]);
  });

  it('a shift below the hull makes a phase stable', () => {
    const def = scenes['m12b-hull']!;
    const f0 = def.build(withDefaults(def, { phase: 'B2C' }));
    const f1 = def.build(withDefaults(def, { phase: 'B2C', shift: -50 }));
    expect(f0.readouts![1]!.value).toBe('20 meV/atom');
    expect(f1.readouts![1]!.value).toBe('0 meV/atom');
  });
});

describe('m12b-neb', () => {
  it('the exact barrier is the higher Muller-Brown saddle above minimum A (S-164)', () => {
    const A = refineStationary(MB_MINIMA[0]!);
    const S = refineStationary(MB_SADDLES[0]!);
    expect(exactBarrier()).toBeCloseTo(mullerBrown(...S) - mullerBrown(...A), 9);
    expect(exactBarrier()).toBeCloseTo(106.03, 1);
  });

  it('the climbing image reaches the barrier by the last iteration; the plain band stays below it', () => {
    for (const images of [3, 7, 13]) {
      const ci = nebFrames(images, true)[NEB_ITERS]!;
      expect(ci.energies[ci.climbing]! - ci.energies[0]!).toBeCloseTo(exactBarrier(), 2);
      const plain = nebFrames(images, false)[NEB_ITERS]!;
      expect(Math.max(...plain.energies.slice(1, -1)) - plain.energies[0]!).toBeLessThan(exactBarrier());
    }
  });
});

describe('m12b-md', () => {
  it('conserves energy in NVE at 5 fs, and blows up at 60 fs and 300 K', () => {
    const ok = mdRun(120, 5, 'nve');
    const f0 = ok.frame(0);
    const f = ok.frame(60);
    expect(ok.blewUpAt).toBeNull();
    expect(Math.abs(f.potential + f.kinetic - f0.potential - f0.kinetic) / 108).toBeLessThan(2e-4);
    const bad = mdRun(300, 60, 'nve');
    bad.frame(60);
    expect(bad.blewUpAt).not.toBeNull();
  });

  it('the Andersen thermostat holds the temperature near its target', () => {
    const run = mdRun(200, 5, 'andersen');
    let s = 0;
    for (let k = 20; k <= 60; k++) s += run.frame(k).temperature;
    expect(Math.abs(s / 41 - 200)).toBeLessThan(40);
  });

  it('the scene readout shows the run it describes', () => {
    const def = scenes['m12b-md']!;
    const f = def.build(withDefaults(def, { frame: 60, temp: 120, dt: 5, thermostat: 'nve' }));
    expect(f.readouts![0]!.value).toBe('1.50 ps');
    expect(f.describe).toMatch(/NVE, no thermostat/);
  });
});
