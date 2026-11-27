// Physics of the module 8 scenes against the libraries and closed forms they are built from.
import { describe, expect, it } from 'vitest';
import { meshIsSymmetric } from '../../crystal/kmesh';
import { latticePointGroup } from '../../crystal/pointgroup';
import { meshEnergy } from '../../physics/kp1dmesh';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { gain, stableAmix } from '../../physics/sloshing1d';
import { energyPerSite, referenceEnergy } from '../../physics/tightbinding2d';
import { lookupStructure } from '../../scene/library';
import { withDefaults, type MeshLayer, type PointsLayer, type SceneFrame } from '../types';
import {
  CUTS,
  ENCUT_GRID,
  FILLING,
  MESHES,
  SURFACE_REF,
  TB_REFERENCE_MESH,
  TOY,
  brokenMeshPoints,
  cheapestSafe,
  convSurface,
  copperSlab,
  hcpMesh,
  ironSupercell,
  nearestContact,
  scaled,
  scenes,
  siliconPrimitive,
  sloshRun,
  toyEncutErrors,
} from './m08';

const build = (id: string, over: Record<string, number | string | boolean> = {}): SceneFrame => {
  const def = scenes[id]!;
  return def.build(withDefaults(def, over));
};
const readout = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;

describe('m08-convergence-surface (kp1d toy on a mesh)', () => {
  it('the reference is converged to better than the 0.1 meV floor of the drawing', () => {
    for (const filling of [FILLING.insulator, FILLING.metal]) {
      const ref = meshEnergy({ ...TOY, ...SURFACE_REF, filling }).energy!;
      const far = meshEnergy({ ...TOY, encutEv: 2000, nk: 300, filling }).energy!;
      expect(Math.abs(ref - far)).toBeLessThan(4e-5);
    }
  });
  it('every drawn error is |E(ENCUT, N) - E_ref| from meshEnergy', () => {
    const s = convSurface('metal');
    for (const [i, j] of [
      [0, 0],
      [4, 9],
      [19, 23],
    ] as const) {
      const e = meshEnergy({ ...TOY, encutEv: CUTS[i]!, nk: MESHES[j]!, filling: FILLING.metal }).energy!;
      expect(s.err[i]![j]!).toBeCloseTo(Math.abs(e - s.ref), 12);
    }
  });
  it('the cheapest safe setting really has every finer setting within tolerance', () => {
    const s = convSurface('insulator');
    const tol = 1e-3;
    const b = cheapestSafe(s, tol)!;
    for (let i = b.i; i < CUTS.length; i++)
      for (let j = b.j; j < MESHES.length; j++) expect(s.err[i]![j]!).toBeLessThan(tol);
  });
  it('the metal needs far more k-points than the insulator for the same tolerance', () => {
    const ins = cheapestSafe(convSurface('insulator'), 5e-3)!;
    const met = cheapestSafe(convSurface('metal'), 5e-3)!;
    expect(MESHES[met.j]!).toBeGreaterThan(MESHES[ins.j]!);
  });
  it('the readout of the test point is the error at that grid point', () => {
    const f = build('m08-convergence-surface', { encut: 300, kmesh: 10 });
    const s = convSurface('insulator');
    const e = s.err[CUTS.indexOf(300)]![9]! * 1000;
    expect(Number.parseFloat(readout(f, 'Energy error'))).toBeCloseTo(e, 3);
  });
});

describe('m08-cutoff-sphere (planewaves.ts)', () => {
  it('the sphere has the radius cutoffRadius(ENCUT) and holds exactly the counted G-vectors', () => {
    const f = build('m08-cutoff-sphere', { encut: 400 });
    const sphere = f.layers.find((l) => l.group === 'sphere') as MeshLayer;
    const r = Math.hypot(sphere.positions[3]!, sphere.positions[4]!, sphere.positions[5]!);
    expect(r).toBeCloseTo(cutoffRadius(400), 10);
    const basis = f.layers.find((l) => l.group === 'basis') as PointsLayer;
    const pw = gVectorsWithin(siliconPrimitive(0), 400);
    expect(basis.positions).toHaveLength(pw.count);
    for (const p of basis.positions)
      expect(Math.hypot(...p)).toBeLessThanOrEqual(cutoffRadius(400) * (1 + 1e-9));
  });
  it('straining the cell changes the count at fixed ENCUT, in jumps around the continuum (1 + s)^3 law', () => {
    const p0 = gVectorsWithin(siliconPrimitive(0), 500);
    const p1 = gVectorsWithin(siliconPrimitive(0.05), 500);
    const [n0, n1] = [p0.count, p1.count];
    expect(n1).toBeGreaterThan(n0);
    expect(p1.continuum / p0.continuum).toBeCloseTo(1.05 ** 3, 10);
    // whole shells of G-vectors enter at once, so the count jumps around the smooth estimate
    for (const p of [p0, p1]) expect(Math.abs(p.ratio - 1)).toBeLessThan(0.15);
    expect(readout(build('m08-cutoff-sphere', { encut: 500, strain: 5 }), 'Plane waves')).toBe(
      `${n1} (unstrained ${n0})`,
    );
  });
  it('the toy energy error falls overall with the cutoff (variational toy)', () => {
    const e = toyEncutErrors();
    expect(e).toHaveLength(ENCUT_GRID.length);
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeLessThanOrEqual(e[i - 1]! + 1e-12);
  });
});

describe('m08-kmesh-error (tightbinding2d.ts, kmesh.ts)', () => {
  it('the 300-point reference equals the library default 600-point one for every smearing offered', () => {
    for (const d of [0, 1])
      for (const sigma of [0, 0.1, 0.25, 0.4])
        expect(referenceEnergy(d, sigma, TB_REFERENCE_MESH)).toBeCloseTo(referenceEnergy(d, sigma), 9);
  });
  it('draws N x N mesh points and reports |E_N - E_ref|', () => {
    for (const N of [3, 8, 16]) {
      const f = build('m08-kmesh-error', { mesh: N });
      const n = f.layers
        .filter((l) => l.group === 'mesh')
        .reduce((s, l) => s + (l as PointsLayer).positions.length, 0);
      expect(n).toBe(N * N);
      const err = Math.abs(energyPerSite(N, 0, 0) - referenceEnergy(0, 0));
      expect(f.describe).toContain(`${N} x ${N}`);
      const shown = Number.parseFloat(readout(f, 'Energy error'));
      expect(Math.abs(shown - err) / err).toBeLessThan(0.06);
    }
  });
  it('fills exactly half the points of an even mesh of the half-filled metal without smearing', () => {
    // states on the Fermi line count one half each, so the total is N^2 / 2
    for (const N of [4, 6, 10])
      expect(Number(readout(build('m08-kmesh-error', { mesh: N }), 'Filled points'))).toBe((N * N) / 2);
  });
  it('the band surface is periodic across the zone', () => {
    const band = build('m08-kmesh-error').layers.find((l) => l.group === 'band') as MeshLayer;
    const n = 37; // 36 + 1 vertices a row
    for (let j = 0; j < n; j += 6) {
      const left = band.positions[3 * (j * n) + 2]!;
      const right = band.positions[3 * (j * n + n - 1) + 2]!;
      expect(left).toBeCloseTo(right, 12);
    }
  });
});

describe('m08-charge-sloshing (sloshing1d.ts)', () => {
  it('reports the closed-form factor of the longest wave and the stable AMIX limit', () => {
    const f = build('m08-charge-sloshing', { amix: 0.2, bmix: 0, length: 30 });
    const g = gain((2 * Math.PI) / 30, 1.5, 0.2, 0);
    expect(readout(f, 'Longest wave per step')).toBe(`x ${g.toFixed(2)}`);
    expect(Number.parseFloat(readout(f, 'Stable AMIX limit'))).toBeCloseTo(stableAmix(30, 1.5, 0), 3);
  });
  it('plain mixing of the default long cell runs away, Kerker and Pulay settle it', () => {
    expect(sloshRun('linear', 0.4, 0, 40).diverged).toBe(true);
    expect(sloshRun('linear', 0.4, 1, 40).residuals.at(-1)!).toBeLessThan(1e-10);
    expect(sloshRun('pulay', 0.1, 0, 40).residuals.at(-1)!).toBeLessThan(1e-8);
  });
});

describe('m08-relaxation-landscape (landscape2d.ts)', () => {
  it('conjugate gradient puts the ball on the valley minimum after two steps', () => {
    const f = build('m08-relaxation-landscape', { method: 'cg', step: 2 });
    expect(Number.parseFloat(readout(f, 'Force'))).toBeLessThan(1e-3);
    expect(readout(f, 'Status')).toBe('converged at step 2');
  });
  it('a too-large fixed step runs away, the symmetric double well traps the relaxation on its saddle', () => {
    expect(readout(build('m08-relaxation-landscape', { potim: 0.18, step: 30 }), 'Status')).toBe('runs away');
    const f = build('m08-relaxation-landscape', { landscape: 'double-well', method: 'cg', step: 30 });
    expect(readout(f, 'Status')).toBe('stuck on the saddle');
    expect(Number.parseFloat(readout(f, 'Energy'))).toBeCloseTo(1, 3);
    const g = build('m08-relaxation-landscape', {
      landscape: 'double-well',
      method: 'cg',
      rattle: true,
      step: 30,
    });
    expect(Number.parseFloat(readout(g, 'Energy'))).toBeLessThan(1e-3);
  });
});

describe('m08-error-causes (crystal libraries)', () => {
  const diamond = lookupStructure('diamond')!;
  it('diamond silicon has its nearest neighbours at a sqrt(3) / 4, scaled by the POSCAR factor', () => {
    for (const f of [1, 0.6, 0.45]) {
      const c = nearestContact(scaled(diamond, f));
      expect(c.distance).toBeCloseTo((5.43 * f * Math.sqrt(3)) / 4, 6);
      expect(c.ratio).toBeCloseTo(c.distance / (2 * 1.11), 9);
    }
    expect(nearestContact(scaled(diamond, 1)).rule).toBeNull();
    expect(nearestContact(scaled(diamond, 0.6)).rule).toBe('B002');
    expect(nearestContact(scaled(diamond, 0.45)).rule).toBe('B001');
  });
  it('the off-mesh points agree with the library mesh-symmetry test: even Monkhorst-Pack n fails on hcp', () => {
    const rots = latticePointGroup(lookupStructure('hcp')!.lattice);
    for (let n = 2; n <= 9; n++) {
      const div = hcpMesh(n);
      const { failing } = brokenMeshPoints(div, rots);
      expect(failing === 0).toBe(meshIsSymmetric(div, 'monkhorst-pack', rots));
      expect(failing === 0).toBe(n % 2 === 1);
    }
  });
  it('the MAGMOM cell has eight atoms and the slab gap equals the vacuum asked for', () => {
    expect(ironSupercell().frac).toHaveLength(8);
    expect(readout(build('m08-error-causes', { case: 'magmom', magmom: 8 }), 'Matches')).toBe('yes');
    for (const v of [2, 7.5, 15]) {
      const s = copperSlab(v);
      const z = s.frac.map((f) => f[2] * s.lattice[2][2]);
      const top = Math.max(...z);
      const bottomImage = Math.min(...z) + s.lattice[2][2];
      expect(bottomImage - top).toBeCloseTo(v, 10);
    }
  });
});
