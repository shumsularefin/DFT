import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import expected from '../../../tests/reference/vasp-outputs/expected.json';
import { detectKind, readOutput } from './outputReader';

const read = (p: string) => readFileSync(p, 'utf8');

describe('output reader', () => {
  it('golden OSZICAR_relax_spin: two ionic steps with F, E0, dE, mag as pymatgen reads them', () => {
    const r = readOutput(read('tests/reference/vasp-outputs/OSZICAR_relax_spin'));
    expect(r.kind).toBe('OSZICAR');
    const want = expected.OSZICAR_relax_spin;
    expect(r.oszicar!.ionic).toHaveLength(want.ionic_steps.length);
    r.oszicar!.ionic.forEach((s, i) => {
      const w = want.ionic_steps[i]!;
      expect(s.f).toBeCloseTo(w.F, 10);
      expect(s.e0).toBeCloseTo(w.E0, 10);
      expect(s.dE!).toBeCloseTo(w.dE, 10);
      expect(s.mag!).toBeCloseTo(w.mag, 10);
      expect(s.nElectronic).toBe(want.n_electronic_steps_per_ionic[i]);
    });
    expect(r.checks.find((c) => c.label === 'Steps that hit NELM')!.health).toBe('ok');
    expect(r.notes.length).toBe(7);
  });
  it('flags a step that used NELM electronic steps', () => {
    const r = readOutput(read('tests/reference/vasp-outputs/OSZICAR_relax_spin'), { nelm: 3 });
    expect(r.checks.find((c) => c.label === 'Steps that hit NELM')!.value).toBe('1 (NELM = 3)');
  });
  it('OUTCAR fixture: accuracy line, forces against EDIFFG, entropy per atom, ENCUT ratio', () => {
    const r = readOutput(read('src/lib/vasp/__fixtures__/outcar-v54.txt'), { ediffg: -0.02 });
    expect(r.kind).toBe('OUTCAR');
    const c = (l: string) => r.checks.find((x) => x.label === l)!;
    expect(c('"reached required accuracy"').value).toBe('present');
    expect(c('Largest force').health).toBe('warn'); // 0.03 > 0.02
    expect(c('ENCUT / largest ENMAX').value).toBe('1.30');
    // fixture: |E without entropy - TOTEN| = 0.1 eV over 2 atoms = 50 meV per atom
    expect(c('Entropy term T*S per atom').value).toBe('50.000 meV');
    expect(c('Finished normally').health).toBe('ok');
    expect(r.ionic).toHaveLength(2);
  });
  it('detects unknown text', () => {
    expect(detectKind('hello world')).toBe('unknown');
    expect(readOutput('hello').checks).toEqual([]);
  });
});
