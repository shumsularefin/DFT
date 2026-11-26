import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestCalculationFiles } from './intake';
import {
  ENTROPY_WARN_MEV_PER_ATOM,
  PULAY_WARN_KB,
  reviewCalculation,
  VOLUME_CHANGE_WARN_PCT,
} from './postflight';

// Hand-made OUTCAR excerpt (src/lib/vasp/__fixtures__/README.md): 2 ions, last step TOTEN -10.5 eV,
// energy without entropy -10.6 eV, forces +-0.03 eV/A along z, last Pulay stress 0.00 kB.
const OUTCAR = readFileSync('src/lib/vasp/__fixtures__/outcar-v54.txt', 'utf8');
const post = (files: { name: string; text: string }[]) =>
  reviewCalculation(ingestCalculationFiles(files)).postflight;
const find = (checks: ReturnType<typeof post>, id: string) => checks.find((c) => c.id === id);
const poscar = (a: number) => `cubic\n1.0\n${a} 0 0\n0 ${a} 0\n0 0 ${a}\nSi\n1\nDirect\n0 0 0\n`;

describe('postflight checks on the OUTCAR excerpt (S-041, S-042)', () => {
  it('POST-FORCE compares the largest force (0.03 eV/A) with |EDIFFG|', () => {
    const tight = post([
      { name: 'OUTCAR', text: OUTCAR },
      { name: 'INCAR', text: 'EDIFFG = -0.01\n' },
    ]);
    expect(find(tight, 'POST-FORCE')?.status).toBe('fail');
    const loose = post([
      { name: 'OUTCAR', text: OUTCAR },
      { name: 'INCAR', text: 'EDIFFG = -0.05\n' },
    ]);
    expect(find(loose, 'POST-FORCE')?.status).toBe('pass');
  });

  it('POST-NELM passes when every electronic loop reached EDIFF', () => {
    expect(find(post([{ name: 'OUTCAR', text: OUTCAR }]), 'POST-NELM')?.status).toBe('pass');
  });

  it('POST-ENTROPY: |TOTEN - E(no entropy)| / N = 0.1 eV / 2 = 50 meV/atom warns (limit 1 meV/atom, S-042)', () => {
    expect(ENTROPY_WARN_MEV_PER_ATOM).toBe(1);
    const c = find(post([{ name: 'OUTCAR', text: OUTCAR }]), 'POST-ENTROPY')!;
    expect(c.status).toBe('warn');
    expect(c.reason).toContain('50.000 meV/atom');
    expect(c.kind).toBe('heuristic');
  });

  it('POST-PULAY appears only above the heuristic level and names Q-014', () => {
    expect(find(post([{ name: 'OUTCAR', text: OUTCAR }]), 'POST-PULAY')).toBeUndefined();
    const lines = OUTCAR.split('\n');
    const at = lines.findLastIndex((l) => l.includes('Pullay stress'));
    lines[at] = lines[at]!.replace('0.00 kB', `${PULAY_WARN_KB + 2}.00 kB`);
    const c = find(post([{ name: 'OUTCAR', text: lines.join('\n') }]), 'POST-PULAY')!;
    expect(c.status).toBe('warn');
    expect(c.kind).toBe('heuristic');
    expect(c.reason).toContain('Q-014');
  });

  it('POST-VOL: +15.8 % (a 4.0 to 4.2) warns, +7.7 % (4.0 to 4.1) passes; labelled heuristic (Q-054)', () => {
    expect(VOLUME_CHANGE_WARN_PCT).toBe(10);
    const big = find(
      post([
        { name: 'OUTCAR', text: OUTCAR },
        { name: 'POSCAR', text: poscar(4) },
        { name: 'CONTCAR', text: poscar(4.2) },
      ]),
      'POST-VOL',
    )!;
    expect(big.status).toBe('warn');
    expect(big.reason).toContain('+15.76 %');
    expect(big.kind).toBe('heuristic');
    const small = find(
      post([
        { name: 'OUTCAR', text: OUTCAR },
        { name: 'POSCAR', text: poscar(4) },
        { name: 'CONTCAR', text: poscar(4.1) },
      ]),
      'POST-VOL',
    )!;
    expect(small.status).toBe('pass');
  });
});
