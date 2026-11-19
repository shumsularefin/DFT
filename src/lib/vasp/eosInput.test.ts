import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fitEos } from '../physics/eos';
import { eosPointsFromRows, eosResultCsv, eosRowFromFile, ingestEosCsv, ingestEosFiles } from './eosInput';
import { parseOutcar } from './outcar';

const fx = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
// Inline OUTCAR excerpt in the format S-042 greps ("volume of cell :" then the last field is the volume).
const outcar = (v: string, e: string, done = true) =>
  [
    '   number of dos      NEDOS =    301   number of ions     NIONS =      2',
    `  volume of cell :      ${(Number(v) * 1.02).toFixed(2)}`,
    '  free  energy   TOTEN  =       -10.1 eV',
    `  energy  without entropy=      -10.0  energy(sigma->0) =      ${e}`,
    `  volume of cell :      ${v}`,
    '  free  energy   TOTEN  =       -10.2 eV',
    `  energy  without entropy=      -10.1  energy(sigma->0) =      ${e}`,
    done ? ' reached required accuracy - stopping structural energy minimisation' : '',
  ].join('\n');

describe('OUTCAR volume (S-042)', () => {
  it('reads the last "volume of cell" value', () => {
    expect(parseOutcar(outcar('40.92', '-10.5')).volume).toEqual({ value: 40.92, line: 5 });
    expect(parseOutcar(fx('outcar-v54.txt')).volume).toBeUndefined();
  });
});

describe('E(V) rows from files', () => {
  it('OUTCAR gives label (folder), volume, energy(sigma->0) and NIONS', () => {
    const r = eosRowFromFile('vol_0.980/OUTCAR', outcar('40.08', '-10.55'));
    expect(r.row).toEqual({ label: 'vol_0.980', volume: '40.08', energy: '-10.55', natoms: '2' });
    expect(r.warning).toBeUndefined();
  });
  it('warns on an unconverged relaxation and on a missing volume', () => {
    expect(eosRowFromFile('a/OUTCAR', outcar('40', '-1', false)).warning).toMatch(
      /reached required accuracy/,
    );
    expect(eosRowFromFile('b/OUTCAR', fx('outcar-v54.txt')).warning).toMatch(/volume of cell/);
  });
  it('OSZICAR gives the energy only, and the OUTCAR of the same folder wins', () => {
    const osz =
      '       N       E                     dE             d eps       ncg     rms          rms(c)\nDAV:   1    -0.1E+02   -0.1E+02   -0.1E+02  100   0.1E+01\n   1 F= -.10500000E+02 E0= -.10450000E+02  d E =-.1E+02\n';
    const z = eosRowFromFile('vol_1.000/OSZICAR', osz);
    expect(z.row).toMatchObject({ label: 'vol_1.000', volume: '', energy: '-10.45' });
    expect(z.warning).toMatch(/no cell volume/);
    const both = ingestEosFiles([
      { name: 'vol_1.000/OUTCAR', text: outcar('40.9', '-10.6') },
      { name: 'vol_1.000/OSZICAR', text: osz },
      { name: 'vol_1.020/OSZICAR', text: osz },
    ]);
    expect(both.rows.map((r) => [r.label, r.volume])).toEqual([
      ['vol_1.000', '40.9'],
      ['vol_1.020', ''],
    ]);
    expect(both.warnings).toHaveLength(1);
  });
});

describe('E(V) CSV', () => {
  it('reads headerless volume,energy[,natoms] and the collect.sh header', () => {
    expect(ingestEosCsv('11.2, -3.70\n11.9 -3.72 2\n').rows).toEqual([
      { label: 'row 1', volume: '11.2', energy: '-3.70', natoms: '' },
      { label: 'row 2', volume: '11.9', energy: '-3.72', natoms: '2' },
    ]);
    const c = ingestEosCsv('label,volume_A3,E_sigma0,nions\nvol_1.000,11.95,-3.72,1\n');
    expect(c.rows[0]).toEqual({ label: 'vol_1.000', volume: '11.95', energy: '-3.72', natoms: '1' });
    expect(ingestEosCsv('a,b\n1,2').warnings[0]).toMatch(/volume column/);
  });
  it('drops unusable rows and reports a mixed atom count', () => {
    const rows = ingestEosCsv('V,E,natoms\n10,-1,2\n0,-1,2\nx,-1,2\n11,-1.1,4\n').rows.map((r, id) => ({
      ...r,
      id,
    }));
    const p = eosPointsFromRows(rows);
    expect(p.points).toHaveLength(2);
    expect(p.skipped).toEqual([2, 3]);
    expect(p.natoms).toBeUndefined();
    expect(p.natomsMismatch).toBe(true);
  });
});

describe('result CSV', () => {
  it('states every parameter with its unit and round-trips through the E(V) reader', () => {
    const ref = JSON.parse(readFileSync('tests/reference/eos_reference.json', 'utf8')) as {
      cases: { name: string; volumes: number[]; energies: number[] }[];
    };
    const c = ref.cases.find((x) => x.name === 'set_b_birch_murnaghan_noisy')!;
    const f = fitEos(c.volumes.map((volume, k) => ({ volume, energy: c.energies[k]!, label: `p${k}` })));
    const csv = eosResultCsv(f);
    for (const u of [
      /E0 = .* eV$/m,
      /V0 = .* A\^3$/m,
      /B0 = .* eV\/A\^3 = .* GPa$/m,
      /B0' = .*\(dimensionless\)$/m,
      /meV per cell$/m,
    ])
      expect(csv).toMatch(u);
    const back = eosPointsFromRows(ingestEosCsv(csv).rows.map((r, id) => ({ ...r, id })));
    expect(back.points.map((p) => p.volume)).toEqual(c.volumes);
    expect(back.points.map((p) => p.energy)).toEqual(c.energies);
  });
});
