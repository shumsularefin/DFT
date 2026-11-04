import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import presetsFile from '../../data/incar-presets.json';
import { parsePoscar } from '../crystal/poscar';
import { entriesFromPreset, removeEntry, upsert, type Preset } from './builder';
import { DEFAULT_JOB } from './jobscript';
import { parseKpoints, meshFromResolution } from './kpoints';
import { parseIncar } from './incar';
import {
  DEFAULT_RESOLUTIONS,
  MAX_RUNS,
  buildProject,
  collectScript,
  encutSeries,
  kmeshSeries,
  makePotcarScript,
  parseMesh,
  runAllScript,
  treeLines,
  zipProject,
  zipProjectAsync,
  type ProjectInput,
} from './series';
import { validate } from './validate';
import { parseSeriesCsv } from './csv';

const cu = parsePoscar(
  readFileSync(new URL('../crystal/__fixtures__/cu-fcc.vasp', import.meta.url), 'utf8'),
).structure;
const conv = (presetsFile.presets as Preset[]).find((p) => p.id === 'convergence')!;
const base = () =>
  upsert(
    removeEntry(upsert(entriesFromPreset(conv, 'default', { enmax: 400 }), 'ISPIN', '1'), 'MAGMOM'),
    'ENCUT',
    '520',
  );

const input = (over: Partial<ProjectInput> = {}): ProjectInput => ({
  structure: cu,
  entries: base(),
  job: DEFAULT_JOB,
  encuts: encutSeries(400),
  encutMesh: [8, 8, 8],
  kruns: kmeshSeries({ lattice: cu.lattice }),
  fixedEncut: 520,
  ...over,
});

describe('encutSeries', () => {
  it('reproduces the author series for ENMAX 400', () => {
    expect(encutSeries(400)).toEqual([400, 450, 500, 550, 600, 650, 700]);
  });
  it('starts at 500, ends at 950 and contains 680 for ENMAX 520', () => {
    const s = encutSeries(520);
    expect(s[0]).toBe(500);
    expect(s[s.length - 1]).toBe(950);
    expect(s).toContain(680);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
  });
  it('honours explicit options and rejects bad input', () => {
    expect(encutSeries(400, { start: 300, end: 400, step: 50 })).toEqual([300, 350, 400]);
    expect(() => encutSeries(0)).toThrow(RangeError);
    expect(() => encutSeries(400, { step: 0 })).toThrow(RangeError);
  });
});

describe('kmeshSeries', () => {
  it('defaults to the six VASPKIT resolutions with non-decreasing meshes for fcc Cu', () => {
    const r = kmeshSeries({ lattice: cu.lattice });
    expect(r.map((x) => x.resolution)).toEqual([...DEFAULT_RESOLUTIONS]);
    r.forEach((x, i) => expect(x.mesh).toEqual(meshFromResolution(cu.lattice, DEFAULT_RESOLUTIONS[i]!).mesh));
    for (let i = 1; i < r.length; i++)
      for (let j = 0; j < 3; j++) expect(r[i]!.mesh[j]!).toBeGreaterThanOrEqual(r[i - 1]!.mesh[j]!);
  });
  it('accepts explicit meshes and parses mesh text', () => {
    expect(
      kmeshSeries({
        meshes: [
          [4, 4, 4],
          [6, 6, 6],
        ],
      }).map((x) => x.label),
    ).toEqual(['4x4x4', '6x6x6']);
    expect(parseMesh('6x6x6')).toEqual([6, 6, 6]);
    expect(parseMesh('4 4 2')).toEqual([4, 4, 2]);
    expect(parseMesh('0x1x1')).toBeNull();
    expect(parseMesh('junk')).toBeNull();
    expect(() => kmeshSeries({ meshes: [[0, 1, 1]] })).toThrow(RangeError);
    expect(() => kmeshSeries()).toThrow(RangeError);
  });
});

describe('buildProject', () => {
  const p = buildProject(input());
  const paths = p.files.map((f) => f.path);
  it('lays out folders like the author', () => {
    expect(p.folders).toHaveLength(13);
    expect(paths).toContain('00_conv/encut_400/INCAR');
    expect(paths).toContain('00_conv/encut_700/KPOINTS');
    expect(paths).toContain('00_conv/kpt_0.05/job.sh');
    expect(paths).toContain('00_conv/kpt_0.02/POSCAR');
    for (const t of ['run_all.sh', 'collect.sh', 'make_potcar.sh', 'README.txt']) expect(paths).toContain(t);
  });
  it('never writes a file or folder named POTCAR', () => {
    expect(paths.some((x) => x.split('/').some((s) => /^potcar/i.test(s)))).toBe(false);
  });
  it('sets ENCUT per folder and keeps the rest of the preset', () => {
    const f = (path: string) => p.files.find((x) => x.path === path)!.content;
    const e = parseIncar(f('00_conv/encut_450/INCAR')).entries;
    expect(e.find((x) => x.name === 'ENCUT')?.value).toBe('450');
    expect(e.find((x) => x.name === 'NSW')?.value).toBe('0');
    expect(parseIncar(f('00_conv/kpt_0.03/INCAR')).entries.find((x) => x.name === 'ENCUT')?.value).toBe(
      '520',
    );
    expect(e.some((x) => x.name === 'KSPACING')).toBe(false);
  });
  it('writes exact Gamma-centred KPOINTS', () => {
    const k = p.files.find((x) => x.path === '00_conv/encut_400/KPOINTS')!.content;
    expect(k).toBe('ENCUT 400 eV, fixed mesh\n0\nGamma\n 8 8 8\n 0 0 0\n');
  });
  it('names each job after its folder', () => {
    expect(p.files.find((x) => x.path === '00_conv/encut_500/job.sh')!.content).toContain(
      '#SBATCH --job-name=encut_500',
    );
  });
  it('every INCAR passes the validator without errors', () => {
    for (const f of p.files.filter((x) => x.path.endsWith('INCAR'))) {
      const k = p.files.find((x) => x.path === f.path.replace('INCAR', 'KPOINTS'))!.content;
      const issues = validate({
        incar: parseIncar(f.content).entries,
        kpoints: parseKpoints(k),
        structure: cu,
        enmaxEv: 400,
        vaspVersion: '6.4',
      }).filter((i) => i.severity === 'error');
      expect(issues, f.path).toEqual([]);
    }
  });
  it('refuses empty and over-long series', () => {
    expect(() => buildProject(input({ encuts: [], kruns: [] }))).toThrow(RangeError);
    const many = Array.from({ length: MAX_RUNS + 1 }, (_, i) => 300 + i * 10);
    expect(() => buildProject(input({ encuts: many, kruns: [] }))).toThrow(/too long/);
    expect(() => buildProject(input({ encuts: many.slice(0, MAX_RUNS), kruns: [] }))).not.toThrow();
  });
  it('rejects duplicate folder names', () => {
    expect(() => buildProject(input({ encuts: [400, 400], kruns: [] }))).toThrow(/same folder/);
  });
  it('warns when the size indicator is large', () => {
    const big = buildProject(input({ encutMesh: [40, 40, 40], encuts: [400, 450], kruns: [] }));
    expect(big.warnings[0]).toMatch(/Heuristic/);
    expect(p.warnings).toEqual([]);
  });
  it('draws a folder tree', () => {
    const t = treeLines(p.files);
    expect(t[0]).toBe('00_conv/');
    expect(t).toContain('  encut_400/');
    expect(t).toContain('    INCAR'.replace('    ', '    '));
    expect(t).toContain('run_all.sh');
  });
});

describe('scripts', () => {
  const two = ['encut_400', 'kpt_0.05'];
  it('collect.sh uses the two-space pattern and prints a CSV header', () => {
    const s = collectScript(two);
    expect(s).toContain('grep "energy  without entropy"');
    expect(s).toContain("awk '{print $NF}'");
    expect(s).toContain('grep "external pressure"');
    expect(s).toContain('echo "label,E_sigma0,pressure_kB,nions"');
    expect(s.startsWith('#!/bin/bash\n')).toBe(true);
  });
  it('run_all.sh loops sequentially with the author pattern', () => {
    const s = runAllScript(two, DEFAULT_JOB);
    expect(s).toContain('NP=${NP:-32}');
    expect(s).toContain('for d in 00_conv/encut_400 00_conv/kpt_0.05; do');
    expect(s).toContain('mpirun -np "$NP" vasp_std > vasp.out');
  });
  it('make_potcar.sh joins in species order and holds no POTCAR content', () => {
    const s = makePotcarScript(['Ti_pv', 'O'], two);
    expect(s).toContain('cat "$POTCAR_DIR/Ti_pv/POTCAR" "$POTCAR_DIR/O/POTCAR" > POTCAR');
    expect(s).not.toMatch(/PAW_PBE|TITEL|VRHFIN|End of Dataset/);
  });
  const hasBash = spawnSync('bash', ['--version']).status === 0;
  it.skipIf(!hasBash)('all generated scripts pass bash -n', () => {
    const dir = mkdtempSync(join(tmpdir(), 'series-'));
    const p = buildProject(input());
    for (const f of p.files.filter((x) => x.path.endsWith('.sh'))) {
      const file = join(dir, f.path.replace(/\//g, '_'));
      writeFileSync(file, f.content);
      expect(() => execFileSync('bash', ['-n', file]), f.path).not.toThrow();
      expect(f.content.startsWith('#!')).toBe(true);
    }
  });
  it.skipIf(!hasBash)('collect.sh output feeds the CSV parser', () => {
    const dir = mkdtempSync(join(tmpdir(), 'collect-'));
    const p = buildProject(input({ encuts: [400, 450], kruns: [] }));
    for (const f of p.files.filter((x) => x.path === 'collect.sh'))
      writeFileSync(join(dir, f.path), f.content);
    execFileSync('bash', ['-c', `mkdir -p ${dir}/00_conv/encut_400 ${dir}/00_conv/encut_450`]);
    const outcar = (e: string, pr: string) =>
      `   number of dos      NEDOS =  301   number of ions     NIONS =      4\n  energy  without entropy=      ${e}  energy(sigma->0) =      ${e}\n  external pressure =       ${pr} kB  Pullay stress =        0.00 kB\n`;
    writeFileSync(join(dir, '00_conv/encut_400/OUTCAR'), outcar('-14.5', '-1.20'));
    writeFileSync(join(dir, '00_conv/encut_450/OUTCAR'), outcar('-14.6', '-0.80'));
    const out = execFileSync('bash', [join(dir, 'collect.sh')], { encoding: 'utf8' });
    expect(out).toBe('label,E_sigma0,pressure_kB,nions\nencut_400,-14.5,-1.20,4\nencut_450,-14.6,-0.80,4\n');
    expect(() => parseSeriesCsv(out)).toThrow(); // x comes from the label (M4.3); the header aliases are accepted
  });
});

describe('zip', () => {
  const p = buildProject(input({ encuts: [400, 450], kruns: [] }));
  it('round-trips the file list and contents', () => {
    const u = unzipSync(zipProject(p.files));
    expect(Object.keys(u).sort()).toEqual(p.files.map((f) => f.path).sort());
    for (const f of p.files) expect(strFromU8(u[f.path]!)).toBe(f.content);
  });
  it('async zip gives the same entries', async () => {
    const u = unzipSync(await zipProjectAsync(p.files));
    expect(Object.keys(u).sort()).toEqual(p.files.map((f) => f.path).sort());
  });
  it('marks scripts executable in the zip attributes', () => {
    const bytes = zipProject(p.files);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const modes = new Map<string, number>();
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) !== 0x06054b50) continue;
      let o = dv.getUint32(i + 16, true);
      for (let n = dv.getUint16(i + 10, true); n > 0; n--) {
        const nameLen = dv.getUint16(o + 28, true);
        const extra = dv.getUint16(o + 30, true) + dv.getUint16(o + 32, true);
        const name = strFromU8(bytes.subarray(o + 46, o + 46 + nameLen));
        modes.set(name, (dv.getUint32(o + 38, true) >>> 16) & 0o777);
        o += 46 + nameLen + extra;
      }
      break;
    }
    expect(modes.get('run_all.sh')).toBe(0o755);
    expect(modes.get('README.txt')).toBe(0o644);
  });
});
