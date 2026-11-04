import { describe, expect, it } from 'vitest';
import { analyzeSeries } from './convergence';
import { energyView, explain, formatMeV, formatTick, niceTicks, toCsv, tooltipText } from './convergenceView';
import { ingestCsv, ingestFiles, pointsFromRows, rowFromFile, type SeriesRow } from './seriesInput';
import { parseSeriesLabel } from './kseries';

// Hand-worked: per-atom energies (1 atom) -3.5150, -3.5200, -3.5205 at 400, 450, 500.
const pts = [
  { x: 400, energy: -3.515, natoms: 1 },
  { x: 450, energy: -3.52, natoms: 1 },
  { x: 500, energy: -3.5205, natoms: 1 },
];

describe('view model', () => {
  const r1 = analyzeSeries(pts, { kind: 'encut' });
  const r6 = analyzeSeries(pts, { kind: 'encut', thresholdEvPerAtom: 0.006 });
  it('finds the hand-worked converged points', () => {
    expect(r1.convergedIndex).toBe(1);
    expect(r6.convergedIndex).toBe(0);
  });
  it('formats meV/atom and ticks', () => {
    expect(formatMeV(0.00123)).toBe('1.23 meV/atom');
    expect(formatMeV(-0.0005, 1)).toBe('-0.5 meV/atom');
    expect(formatTick(0.1 + 0.2)).toBe('0.3');
    expect(niceTicks(0, 20, 5)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(3, 3).length).toBeGreaterThan(1);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
  it('relative view is zero at the last point and the band is the threshold', () => {
    const v = energyView(r1, 0.001, true);
    expect(v.points.at(-1)!.y).toBeCloseTo(0, 9);
    expect(v.points[0]!.y).toBeCloseTo(5.5, 9);
    expect(v.band).toEqual({ lo: -1, hi: 1 });
    const a = energyView(r1, 0.001, false);
    expect(a.points[0]!.y).toBeCloseTo(-3.515, 9);
    expect(a.band.hi - a.band.lo).toBeCloseTo(0.002, 9);
  });
  it('tooltip text for a converged point', () => {
    expect(tooltipText(r1, 1, 0.001)).toBe(
      'x = 450: -3.52000 eV/atom, 0.50 meV/atom from the last point. First converged point.',
    );
    expect(tooltipText(r1, 0, 0.001)).toContain('Not converged.');
    expect(tooltipText(r1, 2, 0.001)).toContain('Converged.');
  });
  it('explanation names the converged setting and the Pulay advice', () => {
    const e = explain(r1, { kind: 'encut', thresholdEvPerAtom: 0.001, enmax: 400, level: 'beginner' });
    expect(e.headline).toBe('Your energy stops changing by more than 1.0 meV per atom from ENCUT = 450 eV.');
    expect(e.advice[0]).toContain('1.3 x ENMAX = 520 eV');
    expect(
      explain(r1, { kind: 'encut', thresholdEvPerAtom: 0.001, level: 'pro' }).details.length,
    ).toBeGreaterThan(e.details.length);
    expect(
      explain(r1, { kind: 'kmesh', thresholdEvPerAtom: 0.001, level: 'beginner' }).advice.join(),
    ).not.toContain('Pulay');
  });
  it('csv export', () => {
    expect(toCsv(r1, 'encut').split('\n')[1]).toBe('400,-3.515000,5.500,,no');
  });
});

describe('series input', () => {
  const osz = (f: number, e0: number) =>
    `   1 F= ${f.toExponential(8).replace('e', 'E')} E0= ${e0.toExponential(8).replace('e', 'E')}  d E =0.0E+00\n`;
  it('labels from file or folder names, including mesh folders', () => {
    expect(parseSeriesLabel('00_conv/kpt_6x6x6/OSZICAR')).toEqual({ kind: 'kmesh', x: 6 });
    expect(parseSeriesLabel('kpt_0.05')).toEqual({ kind: 'kresolution', x: 0.05 });
  });
  it('reads OSZICAR files into rows with both energies', () => {
    const r = ingestFiles([
      { name: 'encut_400_OSZICAR', text: osz(-3.515, -3.515) },
      { name: 'encut_450_OSZICAR', text: osz(-3.52, -3.52) },
      { name: 'junk.txt', text: 'hello' },
    ]);
    expect(r.kind).toBe('encut');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.x).toBe('400');
    expect(r.rows[0]!.energies?.energySigma0).toBeCloseTo(-3.515, 9);
    expect(r.warnings.some((w) => w.includes('junk.txt'))).toBe(true);
  });
  it('flags a name without a setting', () => {
    expect(rowFromFile('run1', osz(-1, -1)).warning).toMatch(/does not say the setting/);
  });
  it('rejects oversized files by message', () => {
    const big = { name: 'encut_1', text: 'x'.repeat(26 * 1024 * 1024) };
    expect(ingestFiles([big]).warnings[0]).toMatch(/25 MB/);
  });
  it('reads the collect.sh CSV and derives x from the label', () => {
    const r = ingestCsv('label,E_sigma0,pressure_kB,nions\nencut_400,-14.5,-1.2,4\nencut_450,-14.6,-0.8,4\n');
    expect(r.kind).toBe('encut');
    expect(r.rows.map((x) => x.x)).toEqual(['400', '450']);
    expect(() => ingestCsv('label,energy\nrun1,-1\n')).toThrow(/does not say the setting/);
  });
  it('builds points with the quantity chosen and a default atom count', () => {
    const rows: SeriesRow[] = [
      {
        id: 1,
        x: '400',
        energy: '',
        energies: { energySigma0: -2, freeEnergyTOTEN: -3 },
        natoms: '',
        pressure: '',
        label: '',
      },
      { id: 2, x: '', energy: '-1', natoms: '2', pressure: '1.5', label: '' },
      { id: 3, x: '450', energy: '-8', natoms: '4', pressure: '', label: '' },
    ];
    const a = pointsFromRows(rows, 'energySigma0', 2);
    expect(a.points).toEqual([
      { x: 400, energy: -2, natoms: 2 },
      { x: 450, energy: -8, natoms: 4 },
    ]);
    expect(a.skipped).toEqual([2]);
    expect(pointsFromRows(rows, 'freeEnergyTOTEN', 2).points[0]!.energy).toBe(-3);
  });
});
