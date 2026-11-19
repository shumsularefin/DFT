import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, echoedSettings, guessKind, readOutput } from './outputReader';
import { OUTPUT_SAMPLES } from './outputSamples';
import { parseOszicar } from './oszicar';

const golden = (f: string) =>
  readFileSync(new URL(`../../../tests/reference/vasp-outputs/${f}`, import.meta.url), 'utf8');
const expected = JSON.parse(golden('expected.json')) as {
  OSZICAR_relax_spin: {
    ionic_steps: { F: number; E0: number; dE: number; mag: number }[];
    n_electronic_steps_per_ionic: number[];
  };
};
const sample = (id: string) => OUTPUT_SAMPLES.find((s) => s.id === id)!;

describe('output reader on the golden OSZICAR (values from pymatgen via expected.json)', () => {
  const text = golden('OSZICAR_relax_spin');
  const r = readOutput(text);
  const exp = expected.OSZICAR_relax_spin;
  it('the first sample is the golden file itself', () => {
    expect(sample('oszicar-relax-spin').text).toBe(text);
  });
  it('is read as an OSZICAR with two ionic steps', () => {
    expect(r.kind).toBe('OSZICAR');
    expect(r.summary.ionicSteps).toBe(2);
    expect(r.summary.electronicPerIonic).toEqual(exp.n_electronic_steps_per_ionic);
  });
  it('reports F, E0, dE and mag equal to expected.json', () => {
    const ionic = parseOszicar(text).ionic;
    ionic.forEach((s, i) => {
      expect(s.f).toBeCloseTo(exp.ionic_steps[i]!.F, 3);
      expect(s.e0).toBeCloseTo(exp.ionic_steps[i]!.E0, 3);
      expect(s.dE!).toBeCloseTo(exp.ionic_steps[i]!.dE, 3);
      expect(s.mag!).toBeCloseTo(exp.ionic_steps[i]!.mag, 3);
    });
    const last = exp.ionic_steps[1]!;
    expect(r.summary.lastF!).toBeCloseTo(last.F, 3);
    expect(r.summary.lastE0!).toBeCloseTo(last.E0, 3);
    expect(r.summary.lastDE!).toBeCloseTo(last.dE, 3);
    expect(r.summary.mag!).toBeCloseTo(last.mag, 3);
  });
  it('writes one note per recognised line (5 electronic steps + 2 ionic lines), sorted by line', () => {
    expect(r.notes).toHaveLength(7);
    expect(r.notes.map((n) => n.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('electronic convergence in OSZICAR', () => {
  it('marks the last step of each loop ok when dE and d eps are below EDIFF', () => {
    const r = readOutput(sample('oszicar-relax-spin').text, { ediff: 1e-3 });
    // line 4 (step 3 of the first loop): dE 2.2e-3 is above 1e-3, so watch; line 7 (second loop): both below
    expect(r.notes.find((n) => n.line === 4)!.health).toBe('watch');
    expect(r.notes.find((n) => n.line === 7)!.health).toBe('ok');
    const loose = readOutput(sample('oszicar-relax-spin').text, { ediff: 1e-2 });
    expect(loose.notes.find((n) => n.line === 4)!.health).toBe('ok');
    expect(loose.checks.find((c) => c.id === 'electronic')!.state).toBe('ok');
  });
  it('a loop that never converges is flagged as watch, and as a problem when it uses all NELM steps', () => {
    const t = sample('oszicar-stuck').text;
    expect(readOutput(t).notes.find((n) => n.line === 7)!.health).toBe('watch');
    const capped = readOutput(t, { nelm: 6 });
    expect(capped.notes.find((n) => n.line === 7)!.health).toBe('problem');
    expect(capped.checks.find((c) => c.id === 'electronic')!.state).toBe('watch');
  });
  it('an energy rise between ionic steps is a watch note marked as a heuristic', () => {
    const t = `   1 F= -.80000000E+01 E0= -.79000000E+01  d E =-.800000E+01
   2 F= -.79000000E+01 E0= -.78000000E+01  d E =0.100000E+01
`;
    const n = readOutput(t, {}, 'OSZICAR').notes;
    expect(n).toHaveLength(2);
    expect(n[1]!.health).toBe('watch');
    expect(n[1]!.heuristic).toBe(true);
    expect(n[0]!.health).toBe('info');
  });
  it('EDIFFG: a negative value defers to the OUTCAR; a positive value is compared with the last dE', () => {
    const t = sample('oszicar-nospin').text;
    const neg = readOutput(t, { ediffg: -0.01 }).checks.find((c) => c.id === 'ionic-criterion')!;
    expect(neg.state).toBe('unknown');
    expect(neg.text).toContain('OUTCAR');
    const pos = readOutput(t, { ediffg: 0.01 }).checks.find((c) => c.id === 'ionic-criterion')!;
    expect(pos.state).toBe('ok'); // last dE is 5e-3, below 1e-2
    const tight = readOutput(t, { ediffg: 1e-3 }).checks.find((c) => c.id === 'ionic-criterion')!;
    expect(tight.state).toBe('watch');
    expect(readOutput(t).checks.find((c) => c.id === 'ionic-criterion')!.state).toBe('unknown');
  });
});

describe('output reader on OUTCAR excerpts', () => {
  const t54 = sample('outcar-v54').text;
  it('guesses the kind', () => {
    expect(guessKind(t54)).toBe('OUTCAR');
    expect(guessKind(sample('oszicar-nospin').text)).toBe('OSZICAR');
    expect(guessKind('hello world')).toBe('unknown');
    expect(guessKind('')).toBe('unknown');
  });
  it('reads the converged relaxation', () => {
    const r = readOutput(t54, { ediffg: -0.05 });
    const state = (id: string) => r.checks.find((c) => c.id === id)!.state;
    expect(r.summary.ionicSteps).toBe(2);
    expect(r.summary.maxForce!).toBeCloseTo(0.03, 6);
    expect(r.summary.mag!).toBeCloseTo(2, 6);
    expect(state('finished')).toBe('ok');
    expect(state('electronic')).toBe('ok');
    expect(state('accuracy')).toBe('ok');
    expect(state('force')).toBe('ok'); // 0.03 < 0.05
    expect(state('mag')).toBe('ok');
  });
  it('entropy term per atom: |-10.5 - (-10.6)| / 2 atoms = 0.05 eV, far above 1 meV, flagged as a heuristic', () => {
    const r = readOutput(t54);
    expect(r.summary.entropyPerAtom!).toBeCloseTo(0.05, 8);
    const c = r.checks.find((x) => x.id === 'entropy')!;
    expect(c.state).toBe('watch');
    expect(c.heuristic).toBe(true);
  });
  it('a small entropy term is ok', () => {
    const t = t54.replace('-10.60000000', '-10.50050000');
    expect(readOutput(t).checks.find((x) => x.id === 'entropy')!.state).toBe('ok');
  });
  it('the force check says it is not a force criterion for a positive EDIFFG, and asks for EDIFFG when unknown', () => {
    expect(readOutput(t54, { ediffg: 1e-3 }).checks.find((c) => c.id === 'force')!.text).toContain(
      'energy criterion',
    );
    expect(readOutput(t54).checks.find((c) => c.id === 'force')!.state).toBe('unknown');
    expect(readOutput(t54, { ediffg: -0.01 }).checks.find((c) => c.id === 'force')!.state).toBe('watch'); // 0.03 > 0.01
  });
  it('flags the loop that did not converge and the missing accuracy line (6.3 sample: one ionic step)', () => {
    const r = readOutput(sample('outcar-v63').text);
    expect(r.checks.find((c) => c.id === 'electronic')!.state).toBe('problem');
    expect(r.notes.some((n) => n.health === 'problem')).toBe(true);
    expect(r.checks.find((c) => c.id === 'finished')!.state).toBe('unknown');
    expect(r.checks.find((c) => c.id === 'accuracy')!.state).toBe('unknown');
  });
  it('a relaxation that ended without the accuracy line is a watch', () => {
    const t = t54.replace(' reached required accuracy - stopping structural energy minimisation\n', '');
    expect(readOutput(t).checks.find((c) => c.id === 'accuracy')!.state).toBe('watch');
  });
  it('line numbers point at the lines they describe', () => {
    const lines = t54.split('\n');
    const r = readOutput(t54);
    for (const n of r.notes) {
      expect(lines[n.line - 1], n.label).toBeDefined();
    }
    const acc = r.notes.find((n) => n.label === 'Reached required accuracy')!;
    expect(lines[acc.line - 1]).toContain('reached required accuracy');
    const enc = r.notes.find((n) => n.label === 'ENCUT')!;
    expect(lines[enc.line - 1]).toContain('ENCUT');
  });
});

describe('echoed settings and odd input', () => {
  it('reads EDIFF, EDIFFG and NELM when they are echoed', () => {
    const t =
      '   EDIFF  =   0.100E-05   stopping-criterion for ELM\n   EDIFFG = -.500E-02   stopping-criterion for IOM\n   NELM   =    120;   NELMIN=  4\n';
    expect(echoedSettings(t)).toEqual({ ediff: 1e-6, ediffg: -0.005, nelm: 120 });
    expect(echoedSettings('nothing')).toEqual({});
  });
  it('never throws and warns on text that is not an output file', () => {
    for (const t of ['', 'x', '\n\n', 'DAV:   1  abc', 'TOTEN']) {
      const r = readOutput(t);
      expect(Array.isArray(r.notes)).toBe(true);
      expect(Array.isArray(r.checks)).toBe(true);
    }
    expect(readOutput('hello').warnings[0]).toMatch(/does not look like/);
  });
  it('defaults match the tag data: EDIFF 1E-4, NELM 60', () => {
    expect(DEFAULT_SETTINGS).toEqual({ ediff: 1e-4, ediffg: null, nelm: 60 });
  });
  it('no sample or note text contains an em dash', () => {
    const dash = String.fromCharCode(0x2014);
    for (const s of OUTPUT_SAMPLES) {
      expect(s.text.includes(dash)).toBe(false);
      const r = readOutput(s.text, { ediffg: -0.01 });
      for (const n of r.notes) expect((n.label + n.beginner + n.intermediate).includes(dash)).toBe(false);
      for (const c of r.checks) expect(c.text.includes(dash)).toBe(false);
    }
  });
});
