import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParseError } from '../crystal/errors';
import { parseSeriesCsv } from './csv';
import { analyzeSeries, energyPerAtom, pointFromOutcar, type SeriesPoint } from './convergence';
import { orderByCost, parseSeriesLabel } from './kseries';
import { parseOszicar } from './oszicar';
import { parseOutcar } from './outcar';

const fx = (n: string) => readFileSync(`src/lib/vasp/__fixtures__/${n}`, 'utf8');
const gold = (n: string) => readFileSync(`tests/reference/vasp-outputs/${n}`, 'utf8');
interface GoldIonic {
  F: number;
  E0: number;
  dE: number;
  mag: number;
}
const expected = JSON.parse(gold('expected.json')) as {
  OSZICAR_relax_spin: { ionic_steps: GoldIonic[]; n_electronic_steps_per_ionic: number[] };
};

describe('parseOszicar', () => {
  it('matches the pymatgen reading of the golden spin-polarized relaxation', () => {
    const r = parseOszicar(gold('OSZICAR_relax_spin'));
    const e = expected['OSZICAR_relax_spin'];
    expect(r.ionic).toHaveLength(e.ionic_steps.length);
    r.ionic.forEach((s, i) => {
      const g = e.ionic_steps[i]!;
      expect(s.f).toBeCloseTo(g.F, 9);
      expect(s.e0).toBeCloseTo(g.E0, 9);
      expect(s.dE).toBeCloseTo(g.dE, 9);
      expect(s.mag).toBeCloseTo(g.mag, 9);
    });
    expect(r.ionic.map((s) => s.nElectronic)).toEqual(e.n_electronic_steps_per_ionic);
    expect(r.isMD).toBe(false);
  });
  it('reads a non-spin relaxation: no mag, electronic steps counted per ionic step', () => {
    const r = parseOszicar(fx('oszicar-nospin.txt'));
    expect(r.ionic.map((s) => s.f)).toEqual([-8, -8.11, -8.115]);
    expect(r.ionic.map((s) => s.e0)).toEqual([-7.9, -8.09, -8.095]);
    expect(r.ionic.map((s) => s.dE)).toEqual([-8, -0.11, -0.005]);
    expect(r.ionic.every((s) => s.mag === undefined)).toBe(true);
    expect(r.ionic.map((s) => s.nElectronic)).toEqual([3, 2, 1]);
    expect(r.warnings).toEqual([]);
  });
  it('reads electronic lines with and without the charge residual', () => {
    const r = parseOszicar(fx('oszicar-nospin.txt'));
    expect(r.electronic[0]).toMatchObject({
      solver: 'DAV',
      n: 1,
      e: 10,
      dE: 10,
      dEps: -20,
      ncg: 400,
      rms: 3,
      line: 2,
    });
    expect(r.electronic[0]!.rmsC).toBeUndefined();
    expect(r.electronic[2]).toMatchObject({ solver: 'RMM', rmsC: 0.15 });
  });
  it('tolerates numbers glued to "=" (F=-.1E+02) and keeps mag', () => {
    const r = parseOszicar(fx('oszicar-spin.txt'));
    expect(r.ionic.map((s) => s.f)).toEqual([-12, -12.11, -12.115]);
    expect(r.ionic.map((s) => s.mag)).toEqual([4, 3.999, 3.9985]);
  });
  it('flags MD runs and parses T, E, EK', () => {
    const r = parseOszicar(fx('oszicar-md.txt'));
    expect(r.isMD).toBe(true);
    expect(r.ionic[0]).toMatchObject({ t: 300, e: -20.8, ek: 0.2, f: -21, e0: -20.9 });
    expect(r.ionic[0]!.dE).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/molecular dynamics/);
  });
  it('warns, never throws, on junk and empty input', () => {
    expect(parseOszicar('').warnings.join(' ')).toMatch(/No OSZICAR lines/);
    const r = parseOszicar('hello world\n   1 F= -.1E+01\n');
    expect(r.ionic).toEqual([]);
    expect(r.warnings.length).toBe(3); // junk line, skipped ionic line, nothing usable
  });
});

describe('parseOutcar', () => {
  const o = parseOutcar(fx('outcar-v54.txt'));
  it('reads setup items with line numbers', () => {
    expect(o.version).toBe('5.4.4');
    expect(o.nions).toEqual({ value: 2, line: 6 });
    expect(o.encut).toEqual({ value: 520, line: 5 });
    expect(o.enmax).toEqual([
      { value: 400, line: 3 },
      { value: 250, line: 4 },
    ]);
    expect(o.nkpts).toEqual({ value: 10, line: 7 });
    expect(o.nbands).toEqual({ value: 16, line: 7 });
  });
  it('reads the three energies of every ionic step', () => {
    expect(o.ionic).toEqual([
      { line: 9, freeEnergyTOTEN: -10.12345678, energyWithoutEntropy: -10.2, energySigma0: -10.16 },
      { line: 13, freeEnergyTOTEN: -10.5, energyWithoutEntropy: -10.6, energySigma0: -10.55 },
    ]);
  });
  it('reads pressure, forces, drift, Fermi level, accuracy, timing, magnetization', () => {
    expect(o.pressure).toEqual([
      { line: 11, pressureKb: 12.5, pulayKb: 3 },
      { line: 15, pressureKb: -0.4, pulayKb: 0 },
    ]);
    expect(o.forces?.line).toBe(16);
    expect(o.forces?.forces).toEqual([
      [0, 0, 0.03],
      [0, 0, -0.03],
    ]);
    expect(o.forces?.maxForce).toBeCloseTo(0.03, 12);
    expect(o.forces?.drift).toEqual([-1e-6, 0, 2e-6]);
    expect(o.efermi).toEqual({ value: 5.1234, line: 23 });
    expect(o.reachedRequiredAccuracy).toBe(true);
    expect(o.reachedRequiredAccuracyLine).toBe(24);
    expect(o.elapsedSec).toEqual({ value: 12.345, line: 25 });
    expect(o.magnetization).toEqual({ value: 2, line: 22 });
    expect(o.electronicLoops).toEqual([
      { line: 8, reached: true },
      { line: 12, reached: true },
    ]);
    expect(o.warnings).toEqual([]);
  });
  it('reads a VASP 6.3 excerpt and warns about what is missing, without throwing', () => {
    const r = parseOutcar(fx('outcar-v63.txt'));
    expect(r.version).toBe('6.3.2');
    expect(r.nions?.value).toBe(8);
    expect(r.forces).toBeUndefined();
    expect(r.reachedRequiredAccuracy).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/Elapsed time/);
    expect(r.warnings.join(' ')).toMatch(/EDIFF/);
  });
  it('returns warnings only for empty text', () => {
    const r = parseOutcar('');
    expect(r.ionic).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });
  const hasShell = (() => {
    try {
      execSync('grep --version && awk --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  it.skipIf(!hasShell)(
    'agrees with a grep/awk pipeline on the fixture (D-015: $NF of the "energy  without entropy" line)',
    () => {
      const cmd = (field: string) =>
        Number(
          execSync(
            `grep "energy  without entropy" src/lib/vasp/__fixtures__/outcar-v54.txt | tail -1 | awk '{print ${field}}'`,
          ).toString(),
        );
      expect(pointFromOutcar(1, o)!.energy).toBe(cmd('$NF'));
      expect(pointFromOutcar(1, o, 'energyWithoutEntropy')!.energy).toBe(cmd('$4'));
      const toten = Number(
        execSync(
          `grep "TOTEN" src/lib/vasp/__fixtures__/outcar-v54.txt | tail -1 | awk '{print $5}'`,
        ).toString(),
      );
      expect(pointFromOutcar(1, o, 'freeEnergyTOTEN')!.energy).toBe(toten);
    },
  );
  it('pointFromOutcar takes the last step, atoms and pressure', () => {
    expect(pointFromOutcar(450, o, 'energySigma0', 'encut_450')).toEqual({
      x: 450,
      energy: -10.55,
      natoms: 2,
      pressure: -0.4,
      label: 'encut_450',
    });
    expect(pointFromOutcar(1, parseOutcar(''))).toBeNull();
  });
});

// Hand-worked series. Energies are in meV per atom relative to the last point, with one atom per cell.
const series = (mev: number[], extra: Partial<SeriesPoint>[] = []): SeriesPoint[] =>
  mev.map((m, i) => ({ x: 400 + 50 * i, energy: -5 + m / 1000, natoms: 1, ...extra[i] }));

describe('analyzeSeries (D-014)', () => {
  it('work-order series [25, 8, 2.4, 0.9, 0.3, 0] with a 1 meV threshold converges at index 3 (ENCUT 550)', () => {
    // i=0: |8-25|=17 > 1.  i=1: |2.4-8|=5.6 > 1.  i=2: |0.9-2.4|=1.5 > 1.
    // i=3: later points are 0.3 and 0, deviations 0.6 and 0.9, both <= 1, so converged.
    const r = analyzeSeries(series([25, 8, 2.4, 0.9, 0.3, 0]));
    expect(r.convergedIndex).toBe(3);
    expect(r.status).toBe('converged');
    expect(r.points[3]!.x).toBe(550);
    expect(r.monotonic).toBe(true);
    expect(r.diffs.map((d) => Math.round(d * 1e6) / 1e3)).toEqual([25, 8, 2.4, 0.9, 0.3, 0]);
  });
  it('a later point exactly at the threshold counts as converged', () => {
    // [3, 1, 0] meV: i=0 fails (|1-3|=2). i=1: |0-1| = 1 = threshold, so converged.
    const r = analyzeSeries(series([3, 1, 0]));
    expect(r.convergedIndex).toBe(1);
    expect(r.status).toBe('converged');
  });
  it('a non-monotonic series is flagged', () => {
    // [10, 2, 6, 1, 0.5, 0]: i=0 fails, i=1 fails (|6-2|=4), i=2 fails (|1-6|=5), i=3: deviations 0.5 and 1 <= 1.
    const r = analyzeSeries(series([10, 2, 6, 1, 0.5, 0]));
    expect(r.convergedIndex).toBe(3);
    expect(r.monotonic).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/non-monotonic/);
  });
  it('a series that never settles is not-converged and the last point alone is not evidence', () => {
    // [20, 10, 5, 2.5, 1.2, 0]: i=4 fails because |0-1.2| = 1.2 > 1, and every earlier i fails more.
    const r = analyzeSeries(series([20, 10, 5, 2.5, 1.2, 0]));
    expect(r.convergedIndex).toBeNull();
    expect(r.status).toBe('not-converged');
  });
  it('too few points', () => {
    expect(analyzeSeries(series([1])).status).toBe('too-few-points');
    expect(analyzeSeries(series([2, 0])).warnings.join(' ')).toMatch(/Fewer than 4/);
  });
  it('uses the threshold option', () => {
    expect(
      analyzeSeries(series([25, 8, 2.4, 0.9, 0.3, 0]), { thresholdEvPerAtom: 0.01 }).convergedIndex,
    ).toBe(1);
  });
  it('energyPerAtom: -34.0 eV in 8 atoms is -4.25 eV/atom', () => {
    expect(energyPerAtom(-34, 8)).toBe(-4.25);
    expect(
      analyzeSeries([
        { x: 1, energy: -34, natoms: 8 },
        { x: 2, energy: -34, natoms: 8 },
      ]).perAtom,
    ).toEqual([-4.25, -4.25]);
  });
  it('warns when the lowest ENCUT is below ENMAX', () => {
    expect(
      analyzeSeries(series([25, 8, 2.4, 0.9, 0.3, 0]), { kind: 'encut', enmax: 450 }).warnings.join(' '),
    ).toMatch(/below ENMAX/);
    expect(
      analyzeSeries(series([25, 8, 2.4, 0.9, 0.3, 0]), { kind: 'encut', enmax: 400 }).warnings.join(' '),
    ).not.toMatch(/below ENMAX/);
  });
  it('warns when energy converged but pressure did not (heuristic, adjustable)', () => {
    // Pressure [40,30,20,12,8,6] kB, threshold 5: i=3 fails (|6-12|=6), i=4 passes (|6-8|=2), so pressure lags energy (index 3).
    const r = analyzeSeries(
      series(
        [25, 8, 2.4, 0.9, 0.3, 0],
        [40, 30, 20, 12, 8, 6].map((pressure) => ({ pressure })),
      ),
    );
    expect(r.pressure).toEqual({ convergedIndex: 4, status: 'converged' });
    expect(r.warnings.join(' ')).toMatch(/Pulay|1\.3 x ENMAX/);
    const loose = analyzeSeries(
      series(
        [25, 8, 2.4, 0.9, 0.3, 0],
        [40, 30, 20, 12, 8, 6].map((pressure) => ({ pressure })),
      ),
      { pressureThresholdKb: 10 },
    );
    expect(loose.pressure?.convergedIndex).toBe(3);
    expect(loose.warnings.join(' ')).not.toMatch(/pressure has not/);
  });
  it('sorts by cost when a kind is given', () => {
    const r = analyzeSeries(series([0, 0.3, 0.9, 2.4, 8, 25]).reverse(), { kind: 'encut' });
    expect(r.points.map((p) => p.x)).toEqual([400, 450, 500, 550, 600, 650]);
    expect(r.warnings.join(' ')).toMatch(/re-ordered/);
  });
});

describe('kseries', () => {
  it('maps labels to a setting', () => {
    expect(parseSeriesLabel('encut_450')).toEqual({ kind: 'encut', x: 450 });
    expect(parseSeriesLabel('runs/kpt_0.04')).toEqual({ kind: 'kresolution', x: 0.04 });
    expect(parseSeriesLabel('k8x8x8')).toEqual({ kind: 'kmesh', x: 8 });
    expect(parseSeriesLabel('relax')).toBeNull();
  });
  it('orders by cost: ENCUT ascending, resolution descending', () => {
    expect(orderByCost([{ x: 500 }, { x: 400 }, { x: 450 }], 'encut').map((p) => p.x)).toEqual([
      400, 450, 500,
    ]);
    expect(orderByCost([{ x: 0.02 }, { x: 0.06 }, { x: 0.04 }], 'kresolution').map((p) => p.x)).toEqual([
      0.06, 0.04, 0.02,
    ]);
  });
});

describe('parseSeriesCsv', () => {
  const rows = [
    { x: 400, energy: -34.1, natoms: 8 },
    { x: 450, energy: -34.2, natoms: 8 },
  ];
  it('gives identical points for comma, tab, semicolon and space files', () => {
    const body = (d: string) => `encut${d}energy${d}natoms\n400${d}-34.1${d}8\n450${d}-34.2${d}8\n`;
    for (const d of [',', '\t', ';', ' ']) expect(parseSeriesCsv(body(d)).rows).toEqual(rows);
  });
  it('accepts header aliases and a label column', () => {
    const r = parseSeriesCsv('label,kpoints,E0\na,0.06,-1\nb,0.04,-2\n');
    expect(r.rows).toEqual([
      { label: 'a', x: 0.06, energy: -1 },
      { label: 'b', x: 0.04, energy: -2 },
    ]);
    expect(r.xName).toBe('kpoints');
  });
  it('reads a header-less file as x, energy, natoms, pressure', () => {
    expect(parseSeriesCsv('400 -34.1 8 1.5\n450 -34.2 8 0.5\n').rows[0]).toEqual({
      x: 400,
      energy: -34.1,
      natoms: 8,
      pressure: 1.5,
    });
  });
  it('rejects a decimal comma with a clear message', () => {
    expect(() => parseSeriesCsv('encut;energy\n400;-34,1\n')).toThrow(/decimal comma/);
  });
  it('reports the line of a bad row and unknown columns', () => {
    try {
      parseSeriesCsv('encut,energy\n400,-34.1\n450,abc\n');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(3);
    }
    expect(() => parseSeriesCsv('foo,energy\n1,2\n')).toThrow(/unknown column/);
    expect(() => parseSeriesCsv('')).toThrow(/empty/);
  });
});
