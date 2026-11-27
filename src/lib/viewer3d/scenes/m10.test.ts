// Physics of the module 10 scenes, checked against the tested libraries and closed forms they are built from, and the
// rule of D-101: the inputs are the ones the topic pages write, and no state shows a result of the worked example.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { irreducibleCount } from '../../crystal/kmesh';
import { reciprocalLattice } from '../../crystal/lattice';
import { loadMoyoNode } from '../../crystal/moyo-node';
import { latticePointGroup } from '../../crystal/pointgroup';
import { setyawanPath } from '../../crystal/kpath/setyawan';
import { analyzeWith } from '../../crystal/symmetry';
import { namedOrdering, netMoment } from '../../magnetism/orderings';
import { realYlm } from '../../physics/hydrogen';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { familySweep } from '../../perovskite/maps';
import { expandRepeats } from '../../vasp/incar';
import { meshFromKspacing } from '../../vasp/kpoints';
import { fmt } from '../kit';
import { cross, dot, norm, sub } from '../math';
import {
  withDefaults,
  type ArrowsLayer,
  type Layer,
  type Params,
  type SceneFrame,
  type Vec3,
} from '../types';
import {
  A_CUBIC,
  CUBIC,
  cubicIrreducible,
  CUBIC_PATH,
  DOUBLED,
  DOUBLED_STARTS,
  KPOINTS_MESH,
  LANTHANIDES,
  LDAU,
  MAGMOM_SCALE,
  POSCAR_TEXT,
  R_CU,
  R_O,
  STARTS,
  STATIONS,
  cuOCuAngle,
  examplePlaneWaves,
  oxygenSeed,
  pathSegments,
  scenes,
  seedTiltDeg,
  tiltedBlock,
} from './m10';

const build = (id: string, over: Params = {}): SceneFrame =>
  scenes[id]!.build(withDefaults(scenes[id]!, over));
const read = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)?.value;
const inGroup = (f: SceneFrame, g: string): Layer[] => f.layers.filter((l) => l.group === g);
const page = (name: string) => readFileSync(`src/content/handbook/10-worked-example/${name}.mdx`, 'utf8');
const golden = JSON.parse(
  readFileSync('tests/reference/perovskite_reference.json', 'utf8'),
).rcuo3_family_sweep;
const B = [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS' as const, fraction: 1 }];
const X = [{ el: 'O', ox: -2, cn: 6, fraction: 1 }];

describe('m10-tolerance: R in the cavity and the tolerance factor', () => {
  it('shows for every lanthanide and policy the t of the tested library and of the golden sweep', () => {
    const keys = { cn12: 'CN12_only_missing_is_null', cn9: 'CN9_all', cn8: 'CN8_all' } as const;
    for (const policy of ['cn12', 'cn9', 'cn8'] as const) {
      const rows = familySweep(B, X, policy);
      const gold = golden.policies[keys[policy]] as { R: string; t: number | null; rA: number | null }[];
      for (const el of LANTHANIDES) {
        const f = build('m10-tolerance', { r: el, policy });
        const row = rows.find((r) => r.el === el)!;
        const g = gold.find((x) => x.R === el)!;
        if (g.t === null) {
          expect(row.ok).toBe(false);
          expect(read(f, 'Tolerance factor t')).toBe('no radius');
        } else {
          expect(row.t).toBeCloseTo(g.t, 6);
          expect(read(f, 'Tolerance factor t')).toBe(fmt(row.t!, 3));
          expect(Math.abs(Number(read(f, 'Tolerance factor t')) - g.t)).toBeLessThanOrEqual(0.0005 + 1e-9);
          expect(f.describe).toContain(`tolerance factor is ${fmt(row.t!, 3)}`);
        }
      }
    }
    // the radii of the B and X sites are Shannon's Cu3+ LS CN 6 and O2- CN 6
    expect(R_CU).toBe(golden.rB);
    expect(R_O).toBe(golden.rX);
    expect(read(build('m10-tolerance'), 'Octahedral factor mu')).toContain(fmt(golden.rB / golden.rX, 3));
  });

  it('t falls from La to Lu under every uniform policy (the lanthanide contraction)', () => {
    for (const policy of ['cn9', 'cn8'] as const) {
      const ts = LANTHANIDES.map((el) =>
        Number(read(build('m10-tolerance', { r: el, policy }), 'Tolerance factor t')),
      );
      for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeLessThanOrEqual(ts[i - 1]!);
    }
  });

  it('builds rigid corner-sharing octahedra: every Cu-O bond is d and every shared oxygen is shared exactly', () => {
    const d = R_CU + R_O;
    for (const phi of [0, 4, 10, 15]) {
      const b = tiltedBlock(d, phi);
      // 8 octahedra x 6 oxygens, 12 shared along the edges of the 2 x 2 x 2 block
      expect(b.oxygen.length).toBe(36);
      b.octahedra.forEach((six, i) => six.forEach((o) => expect(norm(sub(o, b.cu[i]!))).toBeCloseTo(d, 12)));
      // the Cu-O-Cu angle through a shared oxygen equals the closed form
      const o = b.octahedra[0]![0]!; // +x oxygen of the Cu at the origin, shared with the Cu at a1
      const ang = (Math.acos(dot(sub(b.cu[0]!, o), sub(b.cu[4]!, o)) / (d * d)) * 180) / Math.PI;
      expect(norm(sub(b.cu[4]!, b.lattice[0]))).toBeLessThan(1e-12);
      expect(ang).toBeCloseTo(cuOCuAngle(phi), 9);
    }
    expect(cuOCuAngle(0)).toBeCloseTo(180, 9);
    // untilted: the cubic cell 2d, and the room for R makes t exactly 1
    const b0 = tiltedBlock(d, 0);
    expect(norm(b0.lattice[0])).toBeCloseTo(2 * d, 12);
    const room = Math.min(...b0.oxygen.map((o) => norm(sub(o, b0.rSite)))) - R_O;
    expect(room).toBeCloseTo(Math.SQRT2 * d - R_O, 12);
    expect((room + R_O) / (Math.SQRT2 * (R_CU + R_O))).toBeCloseTo(1, 12);
  });

  it('tilting closes the cavity and bends the bond, and says the angle is not a prediction', () => {
    const f0 = build('m10-tolerance', { r: 'Sm', policy: 'cn9', tilt: 0 });
    const f1 = build('m10-tolerance', { r: 'Sm', policy: 'cn9', tilt: 10 });
    expect(read(f1, 'Cu-O-Cu angle (picture)')).toBe(`${fmt(cuOCuAngle(10), 1)}°`);
    expect(Number(read(f1, 'Cu-O-Cu angle (picture)')!.replace('°', ''))).toBeLessThan(180);
    expect(f1.describe).toContain('not a prediction');
    expect(inGroup(f0, 'axis')).toHaveLength(0);
    expect(inGroup(f1, 'axis')).toHaveLength(1);
  });
});

describe('m10-inputs: the input files of the structure page', () => {
  const text = page('structure-and-inputs');
  it('is built from the POSCAR the page writes, with a = 2 (r_Cu + r_O)', () => {
    expect(text).toContain(POSCAR_TEXT);
    expect(CUBIC.species).toEqual(['La', 'Cu', 'O', 'O', 'O']);
    expect(A_CUBIC).toBeCloseTo(2 * (R_CU + R_O), 12);
    expect(text).toContain(`${KPOINTS_MESH.join(' ')}\n0 0 0`);
    expect(text).toContain(`LDAUL     = ${LDAU.LDAUL}`);
    expect(text).toContain(`LDAUU     = ${LDAU.LDAUU}`);
  });

  it('draws the MAGMOM lines of the page, one value per atom, the moment on Cu only', () => {
    for (const [key, s] of Object.entries(STARTS)) {
      const f = build('m10-inputs', { input: 'magmom', start: key });
      const spins = inGroup(f, 'spins') as ArrowsLayer[];
      if (!s.magmom) {
        expect(spins).toHaveLength(0);
        continue;
      }
      expect(text).toContain(`MAGMOM = ${s.magmom}`);
      const v = expandRepeats(s.magmom);
      expect(v).toHaveLength(CUBIC.species.length);
      expect(v.filter((m, i) => m !== 0 && CUBIC.species[i] !== 'Cu')).toEqual([]);
      expect(spins[0]!.vectors).toEqual([[0, 0, v[1]! * MAGMOM_SCALE]]);
      expect(spins[0]!.from[0]).toEqual([A_CUBIC / 2, A_CUBIC / 2, A_CUBIC / 2]);
    }
  });

  it('the KPOINTS mesh has the irreducible count of the tested library under the lattice point group', () => {
    const f = build('m10-inputs', { input: 'kpoints' });
    const red = irreducibleCount(KPOINTS_MESH, 'gamma', latticePointGroup(CUBIC.lattice));
    expect(read(f, 'Irreducible (cubic, 48 operations)')).toBe(String(red.irreducible));
    expect(read(f, 'k-points in the zone')).toBe('512');
    // the O(n^3) classification of the scene equals the tested library for every mesh the stage can show
    for (let n = 1; n <= 17; n++) {
      const lib = irreducibleCount([n, n, n], 'gamma', latticePointGroup(CUBIC.lattice));
      const mine = cubicIrreducible(n);
      expect(mine.irreducible).toBe(lib.irreducible);
      const reps = new Set(lib.representatives.map((r) => r.index));
      mine.rep.forEach((isRep, i) => expect(isRep).toBe(reps.has(i)));
    }
  });

  it('the full d shell where U acts is spherical (Unsold: sum over m of Y_2m^2 = 5 / 4 pi)', () => {
    for (const [x, y, z] of [
      [1, 0, 0],
      [0.3, -0.5, 0.81],
      [-0.6, 0.2, -0.7],
    ] as Vec3[]) {
      const r = Math.hypot(x, y, z);
      let s = 0;
      for (let m = -2; m <= 2; m++) s += realYlm(2, m, x / r, y / r, z / r) ** 2;
      expect(s).toBeCloseTo(5 / (4 * Math.PI), 12);
    }
    const f = build('m10-inputs', { input: 'ldau' });
    expect(inGroup(f, 'dshell')).toHaveLength(1);
    expect(read(f, 'LDAUL (La, Cu, O)')).toBe('-1 2 -1');
  });
});

describe('m10-convergence: cutoff sphere and k-mesh of the example cell', () => {
  it('counts the plane waves of gVectorsWithin and draws the sphere of cutoffRadius', () => {
    for (const encut of [400, 520, 700]) {
      const f = build('m10-convergence', { view: 'basis', encut });
      expect(read(f, 'Plane waves at Gamma')).toBe(String(gVectorsWithin(CUBIC.lattice, encut).count));
      expect(read(f, 'Cutoff radius')).toBe(`${fmt(cutoffRadius(encut), 2)} 1/Å`);
      const [sphere] = inGroup(f, 'sphere');
      if (sphere?.kind !== 'mesh') throw new Error('no sphere');
      expect(Math.hypot(sphere.positions[0]!, sphere.positions[1]!, sphere.positions[2]!)).toBeCloseTo(
        cutoffRadius(encut),
        9,
      );
    }
    // more cutoff, more plane waves, close to the continuum estimate V k^3 / 6 pi^2
    const a = examplePlaneWaves(400);
    const b = examplePlaneWaves(700);
    expect(b.count).toBeGreaterThan(a.count);
    expect(b.count / b.continuum).toBeGreaterThan(0.95);
    expect(b.count / b.continuum).toBeLessThan(1.05);
  });

  it('turns KSPACING into the mesh N = ceil(2 pi / (a KSPACING)) of the tested library', () => {
    for (const ks of [0.1, 0.2, 0.23, 0.4, 0.5]) {
      const f = build('m10-convergence', { view: 'mesh', kspacing: ks });
      const n = Math.max(1, Math.ceil((2 * Math.PI) / A_CUBIC / ks));
      expect(meshFromKspacing(CUBIC.lattice, ks).mesh).toEqual([n, n, n]);
      expect(read(f, 'Mesh (ceil rule)')).toBe(`${n} x ${n} x ${n}`);
      const red = irreducibleCount([n, n, n], 'gamma', latticePointGroup(CUBIC.lattice));
      expect(read(f, 'k-points')).toBe(`${n ** 3} (irreducible ${red.irreducible})`);
    }
  });

  it('the energy curve is an awaiting-results state: planned settings on the floor, no energies', () => {
    const f = build('m10-convergence', { view: 'series' });
    expect(read(f, 'Energies')).toBe('awaiting results');
    for (const g of ['series1', 'series2'])
      for (const l of inGroup(f, g))
        if (l.kind === 'points') l.positions.forEach((p) => expect(p[2]).toBe(0));
    expect(f.layers.some((l) => l.kind === 'curve')).toBe(false);
    expect(f.describe).toContain('awaiting results');
  });
});

describe('m10-relaxation: the doubled cell, the seed and the spin starts', () => {
  const text = page('relaxation');
  it('builds the ten-atom cell of the page in the order La La Cu Cu O x 6, with G-type Cu of opposite sign', () => {
    expect(DOUBLED.det).toBe(2);
    expect(DOUBLED.species).toEqual(['La', 'La', 'Cu', 'Cu', 'O', 'O', 'O', 'O', 'O', 'O']);
    const cuSigns = DOUBLED.gSign.filter((_, i) => DOUBLED.species[i] === 'Cu');
    expect(cuSigns).toEqual([1, -1]);
    // the tested ordering library agrees: G-type needs the doubled cell and has zero net moment
    const g = namedOrdering(CUBIC, { kind: 'G' }, { elements: ['Cu'] });
    expect(g.structure.frac.length).toBe(10);
    expect(netMoment(g)).toBe(0);
    for (const [key, s] of Object.entries(DOUBLED_STARTS)) {
      if (!s.magmom) continue;
      expect(text).toContain(s.magmom);
      const v = expandRepeats(s.magmom);
      expect(v).toHaveLength(10);
      const f = build('m10-relaxation', { cell: 'doubled', start: key });
      const [spins] = inGroup(f, 'spins') as ArrowsLayer[];
      expect(spins!.vectors.map((x) => Math.sign(x[2]))).toEqual(key === 'g' ? [1, -1] : [1, 1]);
      expect(spins!.head).toEqual(key === 'g' ? ['solid', 'open'] : ['solid', 'solid']);
    }
  });

  it('the seed is the first-order motion of a rigid a-a-a- tilt: perpendicular to each bond, alternating by Cu', () => {
    const amp = 0.02;
    DOUBLED.cart.forEach((x, i) => {
      if (DOUBLED.species[i] !== 'Cu') return;
      const sign = DOUBLED.gSign[i]!;
      for (const k of [0, 1, 2])
        for (const sg of [1, -1]) {
          const e: Vec3 = [0, 0, 0];
          e[k] = sg;
          const o: Vec3 = [
            x[0] + (e[0] * A_CUBIC) / 2,
            x[1] + (e[1] * A_CUBIC) / 2,
            x[2] + (e[2] * A_CUBIC) / 2,
          ];
          const dlt = oxygenSeed(o, amp);
          expect(norm(dlt)).toBeCloseTo(amp * A_CUBIC, 12);
          expect(dot(dlt, e)).toBeCloseTo(0, 12);
          // the same sense of rotation n x e for all six oxygens of one Cu, opposite on the other Cu
          const n: Vec3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
          const c = dot(dlt, cross(n, e));
          expect(Math.sign(c)).toBe(sign);
        }
    });
    // seed size and the equivalent rigid tilt: |delta| = (a/2) sin(phi) sqrt(2/3)
    expect(Math.sin((seedTiltDeg(amp) * Math.PI) / 180) * (A_CUBIC / 2) * Math.sqrt(2 / 3)).toBeCloseTo(
      amp * A_CUBIC,
      12,
    );
    expect(inGroup(build('m10-relaxation', { cell: 'doubled', seed: 0 }), 'seed')).toHaveLength(0);
  });

  it('ISIF decides what may move: nothing in the cubic cell except a under ISIF 3', () => {
    const handles = (o: Params) => inGroup(build('m10-relaxation', o), 'handles').length;
    expect(handles({ cell: 'cubic', isif: '2' })).toBe(0);
    expect(handles({ cell: 'cubic', isif: '4' })).toBe(0);
    expect(handles({ cell: 'cubic', isif: '3' })).toBe(1);
    expect(handles({ cell: 'doubled', isif: '2' })).toBe(0);
    expect(handles({ cell: 'doubled', isif: '4' })).toBe(1);
    expect(handles({ cell: 'doubled', isif: '3' })).toBe(2);
    expect(inGroup(build('m10-relaxation', { cell: 'cubic' }), 'seed')).toHaveLength(0);
  });
});

describe('m10-electronic: the zone and the band path of the page', () => {
  it('uses the Setyawan-Curtarolo cubic path that the tested library finds for the example cell', async () => {
    const api = await loadMoyoNode();
    const r = setyawanPath(analyzeWith(api, CUBIC, { symprec: 1e-3, setting: 'Spglib' }));
    const lab = (l: string) => (l === '\\Gamma' ? 'G' : l);
    const pairs = CUBIC_PATH.path.flatMap((c) => c.slice(1).map((to, i) => [c[i]!, to]));
    expect(r.path.map((c) => c.map(lab))).toEqual(pairs);
    expect(r.pathSegments.map((c) => c.map(lab))).toEqual(CUBIC_PATH.path);
    expect(r.spacegroupNumber).toBe(221);
    for (const [k, q] of Object.entries(r.pointCoords)) expect([...q]).toEqual(CUBIC_PATH.points[lab(k)]);
    expect(page('electronic-structure')).toContain(
      'Setyawan-Curtarolo path is $\\Gamma$-X-M-$\\Gamma$-R-X, then M-R',
    );
  });

  it('the path length is b (3/2 + sqrt 2 + sqrt 3 / 2), b = 2 pi / a', () => {
    const b = norm(reciprocalLattice(CUBIC.lattice)[0] as Vec3);
    expect(b).toBeCloseTo((2 * Math.PI) / A_CUBIC, 12);
    const total = pathSegments().reduce((s, x) => s + x.length, 0);
    expect(total).toBeCloseTo(b * (1.5 + Math.SQRT2 + Math.sqrt(3) / 2), 12);
    expect(read(build('m10-electronic', { panel: 'bands' }), 'Path length')).toBe(`${fmt(total, 3)} 1/Å`);
  });

  it('the bands panel draws no bands and the orbitals carry no computed numbers', () => {
    const f = build('m10-electronic', { panel: 'bands' });
    expect(f.layers.some((l) => l.kind === 'curve')).toBe(false);
    expect(read(f, 'Bands')).toBe('awaiting results');
    const o = build('m10-electronic', { panel: 'orbitals' });
    expect(read(o, 'Computed characters')).toBe('awaiting results');
  });
});

describe('m10-pipeline and D-101: no result of the worked example on any stage', () => {
  it('names a check at each station and never a result number', () => {
    expect(STATIONS).toHaveLength(5);
    const seen = new Set<string>();
    for (let s = 0; s < STATIONS.length; s++) {
      const f = build('m10-pipeline', { station: s });
      seen.add(f.describe);
      for (const r of f.readouts!) expect(r.value).not.toMatch(/\d\s*(eV|Å|mu_B|GPa)/);
      expect(f.describe).toContain('ongoing research');
    }
    expect(seen.size).toBe(5);
  });

  it('no state of any module 10 scene reports an energy, a relaxed length, a moment or a gap as a result', () => {
    const resultWords =
      /\b(relaxed (lattice|edge|volume) (is|of)|band gap (is|of)|moment (is|of) \d|energy (is|of) -?\d)/i;
    for (const def of Object.values(scenes))
      for (const p of def.params) {
        const vals =
          p.kind === 'select'
            ? p.options.map((o) => o.value)
            : p.kind === 'toggle'
              ? [true, false]
              : [p.value];
        for (const v of vals) {
          const f = def.build(withDefaults(def, { [p.id]: v }));
          expect(f.describe).not.toMatch(resultWords);
          for (const r of f.readouts ?? []) expect(r.value).not.toMatch(/mu_B per|band gap|gap of/i);
        }
      }
  });
});
