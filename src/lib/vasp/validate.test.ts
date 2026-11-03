import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseIncar } from './incar';
import { applyFix, ALL_RULES, formatIssue, validate } from './validate';
import type { Issue, ValidateContext } from './validate';
import type { ParsedKpoints } from './kpoints';
import type { Structure, Vec3 } from '../crystal/types';
import wf from '../../../scripts/__generated__/workflow-handbook.json';

const inc = (t: string) => parseIncar(t).entries;
const cubic: Structure['lattice'] = [
  [4, 0, 0],
  [0, 4, 0],
  [0, 0, 4],
];
const hex: Structure['lattice'] = [
  [3, 0, 0],
  [-1.5, 2.598076211353316, 0],
  [0, 0, 5],
];
const mk = (species: string[], lattice = cubic): Structure => ({
  lattice,
  species,
  frac: species.map((): Vec3 => [0, 0, 0]),
});
const rep = (el: string, n: number) => Array<string>(n).fill(el);
const si2 = mk(['Si', 'Si']);
const fe4o8 = mk([...rep('Fe', 4), ...rep('O', 8)]);
const mesh = (n: number, centering: 'gamma' | 'monkhorst-pack' = 'gamma'): ParsedKpoints => ({
  kind: 'mesh',
  centering,
  mesh: [n, n, n],
  shift: [0, 0, 0],
  comment: '',
});
const line: ParsedKpoints = {
  kind: 'line',
  coords: 'reciprocal',
  pointsPerSegment: 10,
  segments: [],
  comment: '',
};

const ids = (ctx: ValidateContext, rule: string): Issue[] => validate(ctx).filter((i) => i.rule === rule);

interface Case {
  rule: string;
  severity: 'error' | 'warn' | 'info';
  bad: ValidateContext;
  good: ValidateContext;
}
const c = (rule: string, severity: Case['severity'], bad: ValidateContext, good: ValidateContext): Case => ({
  rule,
  severity,
  bad,
  good,
});

// Expected outcomes come from the rule table in docs/milestones/M3-input-builder.md, not from running the code.
const CASES: Case[] = [
  c(
    'V001',
    'error',
    { incar: inc('MAGMOM = 4*1.0'), structure: fe4o8 },
    { incar: inc('MAGMOM = 4*4.0 8*0.6'), structure: fe4o8 },
  ),
  c(
    'V002',
    'warn',
    { incar: inc('MAGMOM = 2*1.0'), structure: si2 },
    { incar: inc('ISPIN = 2\nMAGMOM = 2*1.0'), structure: si2 },
  ),
  c(
    'V003',
    'warn',
    { incar: inc('ISPIN = 2'), structure: fe4o8 },
    { incar: inc('ISPIN = 2'), structure: si2 },
  ),
  c(
    'V004',
    'error',
    { incar: inc('ISMEAR = -5'), kpoints: mesh(1) },
    { incar: inc('ISMEAR = -5'), kpoints: mesh(4) },
  ),
  c(
    'V005',
    'warn',
    { incar: inc('ISMEAR = -5\nNSW = 50\nIBRION = 2'), systemType: 'metal' },
    { incar: inc('ISMEAR = -5\nNSW = 0'), systemType: 'metal' },
  ),
  c(
    'V006',
    'warn',
    { incar: inc('NSW = 0'), systemType: 'semiconductor' },
    { incar: inc('ISMEAR = 0'), systemType: 'semiconductor' },
  ),
  c(
    'V007',
    'warn',
    { incar: inc('ISMEAR = 0\nSIGMA = 0.2'), systemType: 'insulator' },
    { incar: inc('ISMEAR = 0\nSIGMA = 0.05'), systemType: 'insulator' },
  ),
  c('V008', 'warn', { incar: inc('ENCUT = 300'), enmaxEv: 400 }, { incar: inc('ENCUT = 400'), enmaxEv: 400 }),
  c(
    'V009',
    'warn',
    { incar: inc('ISIF = 3\nENCUT = 500'), enmaxEv: 400 },
    { incar: inc('ISIF = 3\nENCUT = 520'), enmaxEv: 400 },
  ),
  c('V010', 'error', { incar: inc('NSW = 100') }, { incar: inc('NSW = 100\nIBRION = 2') }),
  c(
    'V011',
    'warn',
    { incar: inc('IBRION = 6\nISIF = 2\nNSW = 1') },
    { incar: inc('IBRION = 6\nISIF = 3\nNSW = 1') },
  ),
  c(
    'V012',
    'warn',
    { incar: inc('IBRION = 6\nISIF = 3\nNSW = 5') },
    { incar: inc('IBRION = 6\nISIF = 3\nNSW = 1') },
  ),
  c(
    'V013',
    'warn',
    { incar: inc('IBRION = 6\nISIF = 3\nNSW = 1\nNCORE = 4') },
    { incar: inc('IBRION = 6\nISIF = 3\nNSW = 1') },
  ),
  c(
    'V014',
    'warn',
    { incar: inc('EDIFFG = -0.001\nEDIFF = 1E-5') },
    { incar: inc('EDIFFG = -0.001\nEDIFF = 1E-7') },
  ),
  c(
    'V015',
    'warn',
    { incar: inc('EDIFFG = 0.001\nEDIFF = 1E-3') },
    { incar: inc('EDIFFG = 0.001\nEDIFF = 1E-4') },
  ),
  c(
    'V016',
    'error',
    { incar: inc('LDAUL = 2'), structure: fe4o8 },
    { incar: inc('LDAUL = 2 -1\nLDAUU = 4.0 0\nLDAUJ = 0 0'), structure: fe4o8 },
  ),
  c('V017', 'warn', { incar: inc('LDAU = .TRUE.') }, { incar: inc('LDAU = .TRUE.\nLASPH = .TRUE.') }),
  c(
    'V018',
    'warn',
    { incar: inc('LDAU = .TRUE.\nLMAXMIX = 2'), structure: fe4o8 },
    { incar: inc('LDAU = .TRUE.\nLMAXMIX = 4'), structure: fe4o8 },
  ),
  c('V019', 'error', { incar: inc('METAGGA = R2SCAN') }, { incar: inc('METAGGA = R2SCAN\nLASPH = .TRUE.') }),
  c('V020', 'warn', { incar: inc('METAGGA = R2SCAN\nGGA = PE') }, { incar: inc('METAGGA = R2SCAN') }),
  c(
    'V021',
    'error',
    { incar: inc('LEPSILON = .TRUE.\nLHFCALC = .TRUE.') },
    { incar: inc('LEPSILON = .TRUE.') },
  ),
  c(
    'V022',
    'warn',
    { incar: inc('LOPTICS = .TRUE.') },
    { incar: inc('LOPTICS = .TRUE.\nNBANDS = 96\nEDIFF = 1E-8\nNEDOS = 3000') },
  ),
  c(
    'V023',
    'error',
    { incar: inc('ISIF = 3'), systemType: 'slab' },
    { incar: inc('ISIF = 2'), systemType: 'slab' },
  ),
  c(
    'V024',
    'warn',
    { incar: inc('IBRION = 6\nLREAL = Auto') },
    { incar: inc('IBRION = 6\nLREAL = .FALSE.') },
  ),
  c('V025', 'info', { incar: inc('ICHARG = 11') }, { incar: inc('ICHARG = 2') }),
  c(
    'V026',
    'error',
    { incar: inc('ICHARG = 2'), kpoints: line },
    { incar: inc('ICHARG = 11'), kpoints: line },
  ),
  c(
    'V027',
    'info',
    { incar: inc('LHFCALC = .TRUE.\nAEXX = 0.3\nHFSCREEN = 0.2') },
    { incar: inc('LHFCALC = .TRUE.\nAEXX = 0.25\nHFSCREEN = 0.2') },
  ),
  c(
    'V028',
    'info',
    { incar: inc('LHFCALC = .TRUE.\nALGO = Normal') },
    { incar: inc('LHFCALC = .TRUE.\nALGO = Damped') },
  ),
  c(
    'V029',
    'warn',
    { incar: inc('NSW = 0'), kpoints: mesh(4, 'monkhorst-pack'), structure: mk(['Mg', 'Mg'], hex) },
    { incar: inc('NSW = 0'), kpoints: mesh(5, 'monkhorst-pack'), structure: mk(['Mg', 'Mg'], hex) },
  ),
  c('V030', 'info', { incar: inc('LSORBIT = .TRUE.') }, { incar: inc('LSORBIT = .FALSE.') }),
  c(
    'V031',
    'info',
    { incar: inc('NSW = 0'), structure: mk(rep('Si', 24)) },
    { incar: inc('NSW = 0'), structure: si2 },
  ),
  c(
    'V032',
    'error',
    { incar: inc('NBANDS = 3'), structure: si2, zvalBySpecies: { Si: 4 } },
    { incar: inc('NBANDS = 8'), structure: si2, zvalBySpecies: { Si: 4 } },
  ),
  c('V033', 'warn', { incar: inc('KPAR = 3'), cores: 16 }, { incar: inc('KPAR = 4'), cores: 16 }),
];

describe('rule table', () => {
  it('has 33 unique, sorted, sourced rules', () => {
    expect(ALL_RULES).toHaveLength(33);
    expect(ALL_RULES.map((r) => r.id)).toEqual(
      Array.from({ length: 33 }, (_, i) => `V${String(i + 1).padStart(3, '0')}`),
    );
    for (const r of ALL_RULES) {
      expect(r.source.length, r.id).toBeGreaterThan(0);
      expect(r.vasp.length, r.id).toBeGreaterThan(0);
    }
  });
  it('has a case for every rule', () => {
    expect(CASES.map((x) => x.rule)).toEqual(ALL_RULES.map((r) => r.id));
  });
});

describe.each(CASES)('$rule', ({ rule, severity, bad, good }) => {
  it('fires on the failing input', () => {
    const hit = ids(bad, rule);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]!.severity).toBe(severity);
    expect(hit[0]!.why.length).toBeGreaterThan(20);
  });
  it('stays silent on valid input', () => {
    expect(ids(good, rule)).toEqual([]);
  });
  it('has a pure fix that clears the issue (when it has a fix)', () => {
    const issue = ids(bad, rule)[0]!;
    if (!issue.fix) return;
    const before = JSON.stringify(bad.incar);
    const fixed = issue.fix.apply(bad.incar);
    expect(JSON.stringify(bad.incar)).toBe(before); // input untouched
    expect(ids({ ...bad, incar: fixed }, rule)).toEqual([]);
  });
});

describe('rule details', () => {
  it('V009 threshold: ENMAX 400 gives 520', () => {
    const ctx = (e: number): ValidateContext => ({ incar: inc(`ISIF = 3\nENCUT = ${e}`), enmaxEv: 400 });
    expect(ids(ctx(500), 'V009')).toHaveLength(1);
    expect(ids(ctx(519.9), 'V009')).toHaveLength(1);
    expect(ids(ctx(520), 'V009')).toHaveLength(0);
    expect(ids({ incar: inc('IBRION = 6\nISIF = 3\nNSW = 1'), enmaxEv: 400 }, 'V009')).toHaveLength(1); // default ENCUT = ENMAX
  });
  it('V001 counts 3 x atoms for spin-orbit runs and expands repeats', () => {
    const ok: ValidateContext = { incar: inc('LSORBIT = .TRUE.\nISPIN = 2\nMAGMOM = 6*0.0'), structure: si2 };
    expect(ids(ok, 'V001')).toHaveLength(0);
    expect(ids({ ...ok, incar: inc('LSORBIT = .TRUE.\nMAGMOM = 2*0.0') }, 'V001')).toHaveLength(1);
  });
  it('V004 does not guess for automatic meshes', () => {
    expect(
      ids({ incar: inc('ISMEAR = -5'), kpoints: { kind: 'auto', length: 20, comment: '' } }, 'V004'),
    ).toHaveLength(0);
  });
  it('V010 only fires for NSW above 1 (handbook default is -1 when NSW is 0 or 1)', () => {
    expect(ids({ incar: inc('NSW = 1') }, 'V010')).toHaveLength(0);
    expect(ids({ incar: inc('NSW = 2') }, 'V010')).toHaveLength(1);
  });
  it('V012 also fires when NSW is absent', () => {
    expect(ids({ incar: inc('IBRION = 8') }, 'V012')).toHaveLength(1);
  });
  it('V014 uses the default EDIFF when absent', () => {
    expect(ids({ incar: inc('EDIFFG = -0.001') }, 'V014')).toHaveLength(1);
    expect(ids({ incar: inc('EDIFFG = -0.005\nEDIFF = 1E-5') }, 'V014')).toHaveLength(0);
  });
  it('V018 asks for LMAXMIX 6 on f systems and also fires for ICHARG = 11', () => {
    const ce = mk(['Ce', 'O', 'O']);
    expect(ids({ incar: inc('LDAU = .TRUE.\nLMAXMIX = 4'), structure: ce }, 'V018')).toHaveLength(1);
    expect(ids({ incar: inc('LDAU = .TRUE.\nLMAXMIX = 6'), structure: ce }, 'V018')).toHaveLength(0);
    expect(ids({ incar: inc('ICHARG = 11'), structure: fe4o8 }, 'V018')).toHaveLength(1);
    expect(ids({ incar: inc('ICHARG = 11'), structure: si2 }, 'V018')).toHaveLength(0);
  });
  it('V022 lists each problem', () => {
    const i = ids({ incar: inc('LOPTICS = .TRUE.') }, 'V022')[0]!;
    expect(i.why).toContain('NBANDS');
    expect(i.why).toContain('EDIFF');
    expect(i.why).toContain('NEDOS');
  });
  it('V026 is silent for KPOINTS_OPT on VASP 6.3 or newer only', () => {
    const base: ValidateContext = { incar: inc('NSW = 0'), kpoints: line, kpointsIsOpt: true };
    expect(ids({ ...base, vaspVersion: '6.3' }, 'V026')).toHaveLength(0);
    expect(ids({ ...base, vaspVersion: '5.4' }, 'V026')).toHaveLength(1);
    expect(ids(base, 'V026')).toHaveLength(1);
  });
  it('V032 error and warning thresholds', () => {
    const base = { structure: si2, zvalBySpecies: { Si: 4 } };
    // NELECT = 8
    expect(ids({ ...base, incar: inc('NBANDS = 3') }, 'V032')[0]?.severity).toBe('error');
    expect(ids({ ...base, incar: inc('NBANDS = 4') }, 'V032')).toHaveLength(0);
    const sp = (nb: number) => ({ ...base, incar: inc(`ISPIN = 2\nMAGMOM = 2*2.0\nNBANDS = ${nb}`) });
    expect(ids(sp(5), 'V032')[0]?.severity).toBe('warn'); // ceil((8 + 4) / 2) = 6
    expect(ids(sp(6), 'V032')).toHaveLength(0);
    const nc = { ...base, incar: inc('LSORBIT = .TRUE.\nNBANDS = 7') };
    expect(ids(nc, 'V032')[0]?.severity).toBe('error'); // needs NELECT = 8
    expect(ids({ ...nc, incar: inc('LSORBIT = .TRUE.\nNBANDS = 8') }, 'V032')).toHaveLength(0);
  });
  it('V032 is silent without user-entered ZVAL for every species', () => {
    expect(ids({ incar: inc('NBANDS = 1'), structure: si2, zvalBySpecies: {} }, 'V032')).toHaveLength(0);
  });
});

describe('engine', () => {
  it('sorts by severity then rule id and is silent on an empty INCAR', () => {
    expect(validate({ incar: [] })).toEqual([]);
    const out = validate({ incar: inc('NSW = 100\nLDAU = .TRUE.\nICHARG = 11') });
    expect(out.map((i) => i.severity)).toEqual(
      [...out.map((i) => i.severity)].sort((a, b) => 'ewi'.indexOf(a[0]!) - 'ewi'.indexOf(b[0]!)),
    );
    expect(formatIssue(out[0]!)).toMatch(/^V\d{3} (error|warn|info): /);
  });
  it('applyFix returns a new INCAR and leaves the input alone', () => {
    const incar = inc('NSW = 100');
    const issue = validate({ incar }).find((i) => i.rule === 'V010')!;
    const fixed = applyFix(incar, issue);
    expect(fixed.find((e) => e.name === 'IBRION')?.value).toBe('2');
    expect(incar).toHaveLength(1);
  });
  it('every issue cites sources that exist in the register', () => {
    const register = readFileSync(new URL('../../../docs/SCIENCE_SOURCES.md', import.meta.url), 'utf8');
    for (const r of ALL_RULES)
      for (const s of r.source) expect(register.includes(`| ${s} |`), `${r.id} ${s}`).toBe(true);
  });
  it('contains no em dash', () => {
    const files = [
      'validate.ts',
      ...[
        'accuracy',
        'bands',
        'dftu',
        'functional',
        'helpers',
        'index',
        'ionic',
        'magnetism',
        'parallel',
        'restart',
        'smearing',
        'types',
      ].map((f) => `rules/${f}.ts`),
    ];
    for (const f of files)
      expect(readFileSync(new URL(f, import.meta.url), 'utf8').includes(String.fromCharCode(0x2014)), f).toBe(
        false,
      );
  });
});

describe('false positives on the author handbook INCARs', () => {
  const blocks = wf.incarBlocks.filter((b) => b.kind === 'incar');
  const plusU = wf.incarBlocks.find((b) => b.kind === 'fragment' && b.caption.includes('+U'))!;
  const magFrag = wf.incarBlocks.find((b) => b.kind === 'fragment' && b.name === 'MAGMOM')!;
  const staticText = blocks.find((b) => b.caption.includes('SCF'))!.text;

  const contexts: { name: string; ctx: ValidateContext }[] = [];
  for (const b of blocks) {
    const incar = inc(b.text);
    const mag = incar.find((e) => e.name === 'MAGMOM');
    const n = mag
      ? mag.value
          .split(/\s+/)
          .reduce((s, t) => s + (/^(\d+)\*/.exec(t)?.[1] ? Number(/^(\d+)\*/.exec(t)![1]) : 1), 0)
      : 2;
    contexts.push({
      name: b.caption,
      ctx: { incar, structure: mk(rep(mag ? 'Fe' : 'Si', n)), systemType: 'semiconductor', enmaxEv: 270 },
    });
  }
  contexts.push({
    name: '+U fragment merged into the static INCAR',
    ctx: {
      incar: [...inc(staticText), ...inc(plusU.text)],
      structure: mk(['Fe', 'Fe', 'O', 'O', 'O']), // species Fe O; 5 atoms as in the fragment MAGMOM
      systemType: 'semiconductor',
      enmaxEv: 270,
    },
  });
  contexts.push({
    name: 'MAGMOM fragment merged into the static INCAR',
    ctx: {
      incar: [...inc(staticText).filter((e) => e.name !== 'MAGMOM'), ...inc(magFrag.text)],
      structure: fe4o8,
      systemType: 'semiconductor',
      enmaxEv: 270,
    },
  });

  it('covers 11 INCARs and 2 merged fragments', () => expect(contexts).toHaveLength(13));
  it.each(contexts)('no error on: $name', ({ ctx }) => {
    const errors = validate(ctx).filter((i) => i.severity === 'error');
    expect(errors.map(formatIssue)).toEqual([]);
  });
  it('prints the warnings and infos for the report', () => {
    const lines = contexts.flatMap(({ name, ctx }) =>
      validate(ctx).map((i) => `${name} -> ${formatIssue(i)}`),
    );
    if (process.env.PRINT_FP) console.log(lines.join('\n'));
    expect(Array.isArray(lines)).toBe(true);
  });
});
