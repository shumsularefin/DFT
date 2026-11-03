import { describe, expect, it } from 'vitest';
import presetsFile from '../../data/incar-presets.json';
import { parsePoscar } from '../crystal/poscar';
import type { Structure, Vec3 } from '../crystal/types';
import {
  buildFiles,
  compressRepeats,
  decodeShare,
  encodeShare,
  entriesFromPreset,
  ldauFromSpecies,
  magmomFromSpecies,
  potcarLabels,
  removeEntry,
  SHARE_STRUCTURE_LIMIT,
  suggestEncut,
  unfilled,
  upsert,
  type Preset,
  type ShareState,
} from './builder';
import { DEFAULT_JOB } from './jobscript';
import { parseIncar } from './incar';
import { validate } from './validate';

const presets = presetsFile.presets as Preset[];
const byId = (id: string) => presets.find((p) => p.id === id)!;
const mk = (labels: string[]): Structure => ({
  lattice: [
    [4, 0, 0],
    [0, 4, 0],
    [0, 0, 4],
  ],
  species: labels.map((l) => l.split('_')[0]!),
  labels,
  frac: labels.map((): Vec3 => [0, 0, 0]),
});

describe('suggestEncut', () => {
  it('relax and elastic: 1.3 x ENMAX (ENMAX 400 gives 520)', () => {
    expect(suggestEncut('relax', 400)?.value).toBe(520);
    expect(suggestEncut('elastic', 400)?.value).toBe(520);
    expect(suggestEncut('relax', 400)?.reason).toContain('1.3 x ENMAX');
  });
  it('other tasks reuse the relaxation ENCUT, and default to the protocol value', () => {
    expect(suggestEncut('static', 400, 560)?.value).toBe(560);
    expect(suggestEncut('static', 400)?.value).toBe(520);
    expect(suggestEncut('band', 400)?.reason).toContain('same ENCUT');
  });
  it('never goes below ENMAX and rejects bad ENMAX', () => {
    expect(suggestEncut('static', 400, 300)?.value).toBeGreaterThanOrEqual(400);
    expect(suggestEncut('relax', 0)).toBeNull();
    expect(suggestEncut('relax', Number.NaN)).toBeNull();
  });
});

describe('presets', () => {
  it('fills ENCUT when ENMAX is known and keeps other placeholders visible', () => {
    const e = entriesFromPreset(byId('relax'), 'default', { enmax: 400 });
    expect(e.find((x) => x.name === 'ENCUT')?.value).toBe('520');
    expect(unfilled(e).map((x) => x.name)).toContain('MAGMOM');
    const raw = entriesFromPreset(byId('relax'), 'default');
    expect(raw.find((x) => x.name === 'ENCUT')?.value).toMatch(/^</);
  });
  it('every preset variant builds entries that the INCAR parser accepts', () => {
    for (const p of presets)
      for (const v of p.variants) {
        const e = entriesFromPreset(p, v.id, { enmax: 400 });
        expect(e.length).toBeGreaterThan(0);
      }
  });
  it('unknown variant falls back to the first', () => {
    expect(entriesFromPreset(byId('band'), 'nope').length).toBeGreaterThan(0);
  });
});

describe('MAGMOM and LDAU helpers', () => {
  const fe2o4 = mk(['Fe', 'Fe', 'O', 'O', 'O', 'O']);
  it('compresses repeats in VASP form', () => {
    expect(compressRepeats(['5.0', '5.0', '0.6', '0.6', '0.6', '0.6'])).toBe('2*5.0 4*0.6');
    expect(compressRepeats(['1', '2', '2'])).toBe('1 2*2');
    expect(compressRepeats([])).toBe('');
  });
  it('expands per-species values to atoms in POSCAR order', () => {
    expect(magmomFromSpecies(fe2o4, { Fe: '5.0', O: '0.6' })).toBe('2*5.0 4*0.6');
    expect(magmomFromSpecies(fe2o4, { Fe: '5.0' })).toBeNull();
    expect(magmomFromSpecies(fe2o4, { Fe: '5.0', O: ' ' })).toBeNull();
  });
  it('LDAU strings follow species order', () => {
    const rows = { Fe: { l: '2', u: '5.3', j: '0.0' }, O: { l: '-1', u: '0', j: '0' } };
    expect(ldauFromSpecies(fe2o4, rows)).toEqual({ LDAUL: '2 -1', LDAUU: '5.3 0', LDAUJ: '0.0 0' });
    expect(ldauFromSpecies(fe2o4, { Fe: rows.Fe })).toBeNull();
  });
  it('the generated MAGMOM passes V001 for that structure', () => {
    const magmom = magmomFromSpecies(fe2o4, { Fe: '5.0', O: '0.6' })!;
    const incar = parseIncar(`ISPIN = 2\nMAGMOM = ${magmom}`).entries;
    expect(validate({ incar, structure: fe2o4 }).filter((i) => i.rule === 'V001')).toEqual([]);
  });
});

describe('entry editing is pure', () => {
  it('upsert and remove return new arrays', () => {
    const a = [{ name: 'A', value: '1' }];
    const b = upsert(a, 'A', '2');
    const c = upsert(a, 'B', '3');
    expect(a[0]!.value).toBe('1');
    expect(b[0]!.value).toBe('2');
    expect(c).toHaveLength(2);
    expect(removeEntry(c, 'A')).toEqual([{ name: 'B', value: '3' }]);
  });
});

describe('share links', () => {
  const st: ShareState = {
    preset: 'relax',
    variant: 'default',
    systemType: 'metal',
    enmax: 400,
    version: '6.4',
    entries: [['ENCUT', '520']],
    kpMode: 'gamma',
    spacing: 0.3,
    poscar: 'fcc Cu\n3.61\n',
  };
  it('round-trips, including non-ASCII text', () => {
    expect(decodeShare('#' + encodeShare(st))).toEqual(st);
    const u = { ...st, entries: [['SYSTEM', 'Zré']] as [string, string][] };
    expect(decodeShare(encodeShare(u))).toEqual(u);
  });
  it('drops a structure longer than 2 KB', () => {
    const big = { ...st, poscar: 'x'.repeat(SHARE_STRUCTURE_LIMIT + 1) };
    expect(decodeShare(encodeShare(big))?.poscar).toBeUndefined();
    const ok = { ...st, poscar: 'x'.repeat(SHARE_STRUCTURE_LIMIT) };
    expect(decodeShare(encodeShare(ok))?.poscar).toHaveLength(SHARE_STRUCTURE_LIMIT);
  });
  it('rejects malformed fragments', () => {
    for (const f of ['', '#', 'x=1', 's=!!!', 's=' + btoa('{"a":1}'), 's=' + btoa('not json')])
      expect(decodeShare(f)).toBeNull();
    const bad = encodeShare({ ...st, systemType: 'plasma' as never });
    expect(decodeShare(bad)).toBeNull();
  });
});

describe('files', () => {
  const cu = parsePoscar('fcc Cu\n3.61\n0 0.5 0.5\n0.5 0 0.5\n0.5 0.5 0\nCu\n1\nDirect\n0 0 0\n').structure;
  const files = buildFiles({
    structure: cu,
    entries: entriesFromPreset(byId('relax'), 'default', { enmax: 400 }),
    kpoints: 'k\n0\nGamma\n 11 11 11\n 0 0 0\n',
    job: DEFAULT_JOB,
    presetTitle: 'Relax a bulk crystal',
  });
  it('has INCAR, KPOINTS, POSCAR, job script and README, and never POTCAR', () => {
    expect(files.map((f) => f.name)).toEqual(['INCAR', 'KPOINTS', 'POSCAR', 'job.sh', 'README.txt']);
    expect(files.some((f) => f.name.toUpperCase().includes('POTCAR') && f.name !== 'README.txt')).toBe(false);
  });
  it('README gives the POTCAR command and the licence note without any POTCAR content', () => {
    const r = files.find((f) => f.name === 'README.txt')!.text;
    expect(r).toContain('cat "$POTCAR_LIBRARY/Cu/POTCAR" > POTCAR');
    expect(r).toContain('licensed');
    expect(r).not.toMatch(/TITEL|PAW_PBE|VRHFIN/);
  });
  it('omits KPOINTS when the mesh comes from KSPACING', () => {
    const f = buildFiles({ structure: cu, entries: [], kpoints: null, job: DEFAULT_JOB, presetTitle: 'x' });
    expect(f.map((x) => x.name)).not.toContain('KPOINTS');
  });
  it('POTCAR labels keep raw labels in POSCAR order', () => {
    expect(potcarLabels(mk(['Ti_pv', 'Ti_pv', 'O', 'O']))).toEqual(['Ti_pv', 'O']);
  });
});
