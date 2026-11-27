// Physics of the module 6 scenes: closed forms, the tested libraries and the golden k-mesh counts.
import { describe, expect, it } from 'vitest';
import ref from '../../../../tests/reference/pw_kmesh_reference.json';
import { reciprocalLattice } from '../../crystal/lattice';
import type { Mat3 } from '../../crystal/types';
import { allElectronLike, pseudo } from '../../physics/paw';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { norm, sub } from '../math';
import {
  withDefaults,
  type ArrowsLayer,
  type AtomsLayer,
  type MeshLayer,
  type PointsLayer,
  type Vec3,
} from '../types';
import {
  foldToZone,
  KPOINT_LATTICES,
  magmomLine,
  meshFor,
  outputsOf,
  POSCAR_FILES,
  poscarPositions,
  scenes,
  shortestDistance,
  speciesLines,
} from './m06';

const def = (id: string) => scenes[id]!;
const build = (id: string, over: Record<string, string | number | boolean> = {}) =>
  def(id).build(withDefaults(def(id), over));
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;
const layer = <T>(f: ReturnType<typeof build>, group: string) => f.layers.find((l) => l.group === group) as T;

describe('m06-poscar', () => {
  it('the topic example: Si primitive cell volume a^3 / 4 (about 40.0 cubic Angstrom) and Si-Si 2.35 Angstrom', () => {
    const f = build('m06-poscar', { file: 'si' });
    expect(Number(readout(f, 'Cell volume').split(' ')[0])).toBeCloseTo(5.43 ** 3 / 4, 2);
    expect(Number(readout(f, 'Shortest distance').split(' ')[0])).toBeCloseTo((5.43 * Math.sqrt(3)) / 4, 2);
  });

  it('the scaling factor scales every length, and the volume by its cube', () => {
    const f0 = build('m06-poscar', { file: 'mg', scale: 1 });
    const f1 = build('m06-poscar', { file: 'mg', scale: 1.1 });
    const v = (f: typeof f0) => Number(readout(f, 'Cell volume').split(' ')[0]);
    expect(v(f1) / v(f0)).toBeCloseTo(1.1 ** 3, 2);
    f1.lattice!.forEach((r, i) => expect(norm(r) / norm(f0.lattice![i]!)).toBeCloseTo(1.1, 9));
  });

  it('the last atom line lands at r = f1 a1 + f2 a2 + f3 a3 (Si: a/4 (1, 1, 1))', () => {
    const pos = poscarPositions(POSCAR_FILES.si!, 1, 'direct');
    pos[1]!.forEach((x) => expect(x).toBeCloseTo(5.43 / 4, 10));
    const f = build('m06-poscar', { file: 'si', line: 'positions' });
    const atomsL = layer<AtomsLayer>(f, 'atoms');
    expect(atomsL.highlight).toEqual([1]);
    expect(readout(f, 'Line 10')).toBe('0.2500  0.2500  0.2500');
  });

  it('Cartesian numbers are the positions divided by the scaling factor, and read back to the same sites', () => {
    const f = POSCAR_FILES.mg!;
    const d = poscarPositions(f, 1, 'direct');
    const c = poscarPositions(f, 1, 'cartesian');
    d.forEach((p, i) => p.forEach((x, k) => expect(x).toBeCloseTo(c[i]![k]!, 12)));
  });

  it('Direct numbers read as Cartesian put NaCl atoms 0.5 Angstrom apart instead of a/2 = 2.82', () => {
    const f = POSCAR_FILES.nacl!;
    const lat = f.rows as unknown as Mat3;
    expect(shortestDistance(lat, poscarPositions(f, 1, 'misread'))).toBeCloseTo(0.5, 9);
    expect(shortestDistance(lat, poscarPositions(f, 1, 'direct'))).toBeCloseTo(5.64 / 2, 9);
    const built = build('m06-poscar', { file: 'nacl', reading: 'misread' });
    expect(built.describe).toContain('0.50 Angstrom');
  });

  it('lines 6 and 7: elements in order of first appearance with their counts', () => {
    expect(speciesLines(POSCAR_FILES.nacl!.species)).toEqual({ names: ['Na', 'Cl'], counts: [4, 4] });
    expect(speciesLines(POSCAR_FILES.srtio3!.species)).toEqual({
      names: ['Sr', 'Ti', 'O'],
      counts: [1, 1, 3],
    });
  });
});

describe('m06-kpoints', () => {
  it('mesh divisions follow N_i |a_i| about constant: hcp Mg 8 gives 8 x 8 x 5', () => {
    expect(meshFor(KPOINT_LATTICES.hcp!.lattice, 8)).toEqual([8, 8, 5]);
    expect(meshFor(KPOINT_LATTICES.si!.lattice, 6)).toEqual([6, 6, 6]);
  });

  it('irreducible counts of the fcc Si mesh equal the golden spglib counts for fcc', () => {
    for (const r of ref.irreducible_counts_spglib) {
      const n = r.mesh[0]!;
      if (n > 10) continue;
      const g = build('m06-kpoints', { lattice: 'si', n, centering: 'gamma' });
      expect(Number(readout(g, 'Irreducible'))).toBe(r.gamma_centred_irreducible);
      const s = build('m06-kpoints', { lattice: 'si', n, centering: 'monkhorst-pack' });
      expect(Number(readout(s, 'Irreducible'))).toBe(r.shifted_irreducible);
      expect(Number(readout(g, 'Points'))).toBe(n ** 3);
    }
  });

  it('an even Monkhorst-Pack mesh on hcp (4 x 4 x 2) breaks the symmetry; the Gamma mesh keeps it (Q-017)', () => {
    const mp4 = build('m06-kpoints', { lattice: 'hcp', n: 4, centering: 'monkhorst-pack' });
    expect(readout(mp4, 'Symmetric').startsWith('no')).toBe(true);
    const g4 = build('m06-kpoints', { lattice: 'hcp', n: 4, centering: 'gamma' });
    expect(readout(g4, 'Symmetric')).toBe('yes');
  });

  it('folded points lie in the first zone: no reciprocal lattice vector brings one closer to Gamma', () => {
    for (const id of Object.keys(KPOINT_LATTICES)) {
      const rec = reciprocalLattice(KPOINT_LATTICES[id]!.lattice).map((r) => [r[0], r[1], r[2]] as Vec3);
      const f = build('m06-kpoints', { lattice: id, n: 5, centering: 'monkhorst-pack', fold: true });
      const pts = layer<PointsLayer>(f, 'mesh').positions;
      for (const k of pts)
        for (let i = -2; i <= 2; i++)
          for (let j = -2; j <= 2; j++)
            for (let l = -2; l <= 2; l++) {
              const G: Vec3 = [0, 1, 2].map(
                (c) => i * rec[0]![c]! + j * rec[1]![c]! + l * rec[2]![c]!,
              ) as Vec3;
              expect(norm(k)).toBeLessThanOrEqual(norm(sub(k, G)) + 1e-9);
            }
      expect(foldToZone([0, 0, 0], rec)).toEqual([0, 0, 0]);
    }
  });
});

describe('m06-incar', () => {
  it('ENCUT: the dots are exactly the plane waves of gVectorsWithin, inside a sphere of radius cutoffRadius', () => {
    const f = build('m06-incar', { tag: 'encut', encut: 400 });
    const pts = layer<PointsLayer>(f, 'gvectors').positions;
    const g = gVectorsWithin(KPOINT_LATTICES.si!.lattice, 400);
    expect(pts.length).toBe(g.count);
    const kc = cutoffRadius(400);
    for (const p of pts) expect(norm(p)).toBeLessThanOrEqual(kc * (1 + 1e-9));
    expect(readout(f, 'Sphere radius')).toBe(`${kc.toFixed(2)} 1/A`);
  });

  it('ENCUT: the count follows the continuum law ENCUT^(3/2) within 5 percent', () => {
    const n = (e: number) =>
      Number(readout(build('m06-incar', { tag: 'encut', encut: e }), 'Plane waves at Gamma'));
    expect(n(600) / n(300)).toBeGreaterThan(2 ** 1.5 * 0.95);
    expect(n(600) / n(300)).toBeLessThan(2 ** 1.5 * 1.05);
  });

  it('ISMEAR: Gaussian and Fermi occupations stay in [0, 1]; Methfessel-Paxton overshoots', () => {
    for (const s of ['gaussian', 'fermi']) {
      const f = build('m06-incar', { tag: 'ismear', ismear: s, sigma: 0.2 });
      expect(Number(readout(f, 'Largest occupation'))).toBeLessThanOrEqual(1);
      expect(Number(readout(f, 'Smallest occupation'))).toBeGreaterThanOrEqual(0);
    }
    const mp = build('m06-incar', { tag: 'ismear', ismear: 'mp1', sigma: 0.2 });
    expect(Number(readout(mp, 'Largest occupation'))).toBeGreaterThan(1);
    expect(readout(mp, 'ISMEAR')).toBe('1');
  });

  it('ISPIN: antiferromagnetic MAGMOM has zero net moment, ferromagnetic 2 m per cell; ISPIN = 1 draws no spins', () => {
    expect(magmomLine(3, 'antiferro').moments.reduce((a, b) => a + b, 0)).toBe(0);
    expect(magmomLine(2.5, 'ferro')).toEqual({ text: 'MAGMOM = 2*2.5', moments: [2.5, 2.5] });
    const afm = build('m06-incar', { tag: 'ispin', ispin: '2', magmom: 3, order: 'antiferro' });
    const spins = layer<ArrowsLayer>(afm, 'spins');
    expect(spins.vectors).toHaveLength(16);
    expect(spins.vectors.reduce((a, v) => a + v[2], 0)).toBeCloseTo(0, 12);
    expect((spins.head as string[]).filter((h) => h === 'open')).toHaveLength(8);
    const none = build('m06-incar', { tag: 'ispin', ispin: '1' });
    expect(none.layers.some((l) => l.group === 'spins')).toBe(false);
  });
});

describe('m06-potcar', () => {
  it('the two functions agree outside rc and differ inside, with nodes only in the all-electron-like one', () => {
    for (const rc of [1, 1.8, 3]) {
      const f = build('m06-potcar', { rc });
      expect(readout(f, 'Difference beyond rc')).toBe('0.0000');
      expect(Math.abs(allElectronLike(rc / 3, rc) - pseudo(rc / 3))).toBeGreaterThan(1e-3);
      expect(readout(f, 'Nodes inside rc')).toMatch(/^[1-9]\d* all-electron, 0 smooth$/);
    }
  });

  it('the revolved surface is the radial function of the distance from the nucleus', () => {
    const f = build('m06-potcar', { show: 'pseudo', cut: false, rc: 1.8 });
    const m = layer<MeshLayer>(f, 'pseudo');
    for (let v = 0; v < m.positions.length / 3; v += 37) {
      const [x, y, z] = m.positions.slice(3 * v, 3 * v + 3) as [number, number, number];
      expect(z).toBeCloseTo(3 * pseudo(Math.min(Math.hypot(x, y), 6)), 9);
    }
  });
});

describe('m06-outputs', () => {
  it('LWAVE, LCHARG and LORBIT decide which files exist (output-files.mdx)', () => {
    const on = outputsOf({ nsw: 3, nelm: 3, lwave: true, lcharg: true, lorbit: true });
    expect(on.every((f) => f.written)).toBe(true);
    const off = outputsOf({ nsw: 3, nelm: 3, lwave: false, lcharg: false, lorbit: false });
    expect(off.filter((f) => !f.written).map((f) => f.name)).toEqual(['WAVECAR', 'CHGCAR', 'PROCAR']);
  });

  it('XDATCAR holds one frame per ionic step and CONTCAR only the latest geometry', () => {
    const o = outputsOf({ nsw: 7, nelm: 3, lwave: true, lcharg: true, lorbit: false });
    expect(o.find((f) => f.name === 'XDATCAR')!.records).toBe(7);
    expect(o.find((f) => f.name === 'CONTCAR')!.records).toBe(1);
    expect(o.find((f) => f.name === 'OSZICAR')!.records).toBe(7 * 4);
  });

  it('without WAVECAR and CHGCAR the next run can only read CONTCAR', () => {
    const f = build('m06-outputs', { lwave: false, lcharg: false });
    expect(f.describe).toContain('The next run can read CONTCAR as POSCAR.');
  });
});
