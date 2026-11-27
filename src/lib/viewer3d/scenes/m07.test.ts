// Physics of the module 7 scenes: the KPAR and NCORE split, the OSZICAR samples, the restart toy and the k-path tables.
import { describe, expect, it } from 'vitest';
import kp from '../../../../tests/reference/kpaths.json';
import { HARTREE_EV } from '../../physics/scf1d';
import { runRestart } from '../../physics/scfRestart1d';
import { parseOszicar } from '../../vasp/oszicar';
import { OUTPUT_SAMPLES } from '../../vasp/outputSamples';
import { norm, sub } from '../math';
import { withDefaults, type AtomsLayer, type MeshLayer, type PointsLayer } from '../types';
import { KPATHS, LINKS, lineModePoints, loopsOf, scenes, STATIONS } from './m07';

const def = (id: string) => scenes[id]!;
const build = (id: string, over: Record<string, string | number | boolean> = {}) =>
  def(id).build(withDefaults(def(id), over));
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;

describe('m07-parallel', () => {
  it('32 ranks, KPAR = 4, NCORE = 4: four groups of 8 ranks and NPAR = 2 (job-scripts.mdx)', () => {
    const f = build('m07-parallel', { nodes: 2, tpn: '16', kpar: 4, ncore: 4, nkpts: 10 });
    expect(readout(f, 'Ranks')).toBe('32');
    expect(readout(f, 'k-point groups')).toBe('4 x 8 ranks');
    expect(readout(f, 'NPAR (band groups)')).toBe('2');
    expect(readout(f, 'k-point rounds')).toBe('3 (2 idle slots)');
    const cores = f.layers.filter((l) => l.group === 'cores') as MeshLayer[];
    expect(cores).toHaveLength(4);
    expect(cores.reduce((n, l) => n + l.positions.length / 24, 0)).toBe(32);
    const k = f.layers.find((l) => l.group === 'kpoints') as AtomsLayer;
    expect(k.positions).toHaveLength(10);
  });

  it('KPAR that does not divide the ranks draws one grey block of cores and says so', () => {
    const f = build('m07-parallel', { nodes: 2, tpn: '16', kpar: 3 });
    expect(readout(f, 'k-point groups')).toBe('invalid');
    expect(f.layers.filter((l) => l.group === 'cores')).toHaveLength(1);
    expect(f.describe).toContain('does not divide');
  });
});

describe('m07-oszicar', () => {
  it('the loops are the parsed electronic steps of each ionic step of the sample', () => {
    for (const s of OUTPUT_SAMPLES.filter((x) => x.kind === 'OSZICAR')) {
      const r = parseOszicar(s.text);
      const loops = loopsOf(s.id);
      expect(loops).toHaveLength(r.ionic.length);
      expect(loops.flatMap((l) => l.dE)).toEqual(r.electronic.map((e) => e.dE));
      loops.forEach((l, i) => expect(l.f).toBe(r.ionic[i]!.f));
    }
  });

  it('a loop counts as converged when its last |dE| is below EDIFF', () => {
    for (const ediff of [-6, -4, -3, -2, -1]) {
      const f = build('m07-oszicar', { sample: 'oszicar-nospin', ediff, upto: 3 });
      const expected = loopsOf('oszicar-nospin').filter(
        (l) => Math.abs(l.dE[l.dE.length - 1]!) >= 10 ** ediff,
      ).length;
      expect(readout(f, 'Loops above EDIFF')).toBe(String(expected));
    }
    const stuck = build('m07-oszicar', { sample: 'oszicar-stuck', ediff: -4 });
    expect(readout(stuck, 'Loops above EDIFF')).toBe('1');
    expect(readout(stuck, 'Ionic steps read')).toBe('1 of 1');
  });

  it('the EDIFF plane sits at log10(EDIFF) + 7', () => {
    const f = build('m07-oszicar', { ediff: -5 });
    const q = f.layers.find((l) => l.group === 'ediff') as MeshLayer;
    expect(q.positions[2]).toBeCloseTo(2, 12);
  });
});

describe('m07-restarts', () => {
  const fresh = runRestart({ tol: 1e-6 });
  it('ICHARG = 11 with the CHGCAR of this system gives the converged orbital energy', () => {
    const f = build('m07-restarts', { icharg: '11' });
    expect(readout(f, 'Orbital energy')).toBe(readout(f, 'Converged SCF value'));
    expect(readout(f, 'Orbital energy')).toBe(`${(fresh.orbitalEnergy * HARTREE_EV).toFixed(3)} eV`);
  });

  it('ICHARG = 11 with a CHGCAR from other settings gives a wrong eigenvalue; ICHARG = 1 from it recovers', () => {
    const wrong = build('m07-restarts', { icharg: '11-other' });
    const e = (f: typeof wrong, k: string) => Number(readout(f, k).split(' ')[0]);
    expect(Math.abs(e(wrong, 'Orbital energy') - e(wrong, 'Converged SCF value'))).toBeGreaterThan(0.1);
    const back = build('m07-restarts', { icharg: '1-other' });
    expect(Math.abs(e(back, 'Orbital energy') - e(back, 'Converged SCF value'))).toBeLessThan(0.002);
  });

  it('ICHARG = 1 from the converged CHGCAR of this system needs a single iteration', () => {
    expect(readout(build('m07-restarts', { icharg: '1' }), 'Iterations')).toBe('1');
  });
});

describe('m07-workflow', () => {
  it('every link runs from an earlier step to a later one, and a changed ENCUT breaks the links out of step 1', () => {
    for (const [a, b] of LINKS) expect(a).toBeLessThan(b);
    expect(STATIONS).toHaveLength(5);
    const ok = build('m07-workflow', { step: 5 });
    expect(ok.layers.some((l) => l.group === 'broken')).toBe(false);
    const bad = build('m07-workflow', { step: 5, mismatch: true });
    expect(bad.layers.some((l) => l.group === 'broken')).toBe(true);
  });
});

describe('m07-kpath tables against the golden Setyawan-Curtarolo paths (tests/reference/kpaths.json, S-005)', () => {
  const golden = kp.structures as unknown as Record<
    string,
    {
      setyawan_curtarolo: {
        path: string[][];
        point_coords: Record<string, number[]>;
        primitive_lattice_rows: number[][];
      };
    }
  >;
  const cases: [string, string, number][] = [
    ['fcc', 'fcc_Cu', 5.43 / 3.61],
    ['bcc', 'bcc_Fe', 1],
    ['sc', 'sc_Po_like', 1],
    ['hex', 'hcp_Mg', 1],
  ];
  for (const [id, gid, s] of cases) {
    it(`${id}: points, path and primitive cell`, () => {
      const g = golden[gid]!.setyawan_curtarolo;
      const t = KPATHS[id]!;
      const name = (l: string) => (l === '\\Gamma' ? 'G' : l);
      expect(t.path).toEqual(g.path.map((c) => c.map(name)));
      expect(Object.keys(t.points).sort()).toEqual(Object.keys(g.point_coords).map(name).sort());
      for (const [k, v] of Object.entries(g.point_coords))
        t.points[name(k)]!.forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 9));
      t.lattice.forEach((r, i) =>
        r.forEach((x, j) => expect(x).toBeCloseTo(g.primitive_lattice_rows[i]![j]! * s, 6)),
      );
    });
  }

  it('line mode: n points per segment from one high-symmetry point to the next, both ends included', () => {
    const lm = lineModePoints(KPATHS.fcc!, 20);
    expect(lm.segments).toHaveLength(10);
    lm.points.forEach((seg) => expect(seg).toHaveLength(20));
    // Gamma to X in fcc is 2 pi / a long
    expect(norm(sub(lm.points[0]![19]!, lm.points[0]![0]!))).toBeCloseTo((2 * Math.PI) / 5.43, 9);
    const f = build('m07-kpath', { lattice: 'fcc', density: 20, segments: 10 });
    expect((f.layers.find((l) => l.group === 'kpoints') as PointsLayer).positions).toHaveLength(200);
    expect(readout(f, 'k-points')).toBe('200 in the file');
  });
});
