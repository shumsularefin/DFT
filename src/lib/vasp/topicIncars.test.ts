// M7.3: every INCAR shown in the module 6 and 7 topics must pass the M3.4 validator with no errors.
// Warnings are listed (set PRINT_FP=1). Q-019: the handbook's band INCAR has no LMAXMIX, so a V018 warning is expected there.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIncar } from './incar';
import { formatIssue, validate } from './validate';
import type { Structure, Vec3 } from '../crystal/types';

const DIRS = ['src/content/handbook/06-vasp-files', 'src/content/handbook/07-running'];
const BLOCK = /<(?:VaspFileExplorer|VaspFile)\s+(?:kind|name)="INCAR"[^]*?code=\{`([^`]*)`\}/g;

interface Shown {
  where: string;
  text: string;
}
const shown: Shown[] = [];
for (const d of DIRS) {
  for (const f of readdirSync(d).sort()) {
    const src = readFileSync(`${d}/${f}`, 'utf8');
    let n = 0;
    for (const m of src.matchAll(BLOCK)) shown.push({ where: `${f} #${++n}`, text: m[1]! });
  }
}

const atomsFromMagmom = (value: string | undefined): number =>
  value === undefined
    ? 2
    : value
        .split('#')[0]!
        .trim()
        .split(/\s+/)
        .reduce((s, t) => s + (/^(\d+)\*/.exec(t) ? Number(/^(\d+)\*/.exec(t)![1]) : 1), 0);

const structure = (n: number, el: string): Structure => ({
  lattice: [
    [4, 0, 0],
    [0, 4, 0],
    [0, 0, 4],
  ],
  species: Array<string>(n).fill(el),
  frac: Array.from({ length: n }, (): Vec3 => [0, 0, 0]),
});

describe('INCARs shown in modules 6 and 7', () => {
  it('finds at least the relaxation, SCF, band and restart examples', () => {
    expect(shown.length).toBeGreaterThanOrEqual(4);
  });
  it.each(shown)('no validator error: $where', ({ text }) => {
    const incar = parseIncar(text).entries;
    const mag = incar.find((e) => e.name === 'MAGMOM')?.value;
    const ctx = {
      incar,
      structure: structure(atomsFromMagmom(mag), mag === undefined ? 'Si' : 'Fe'),
      systemType: 'semiconductor' as const,
      enmaxEv: 270,
    };
    const issues = validate(ctx);
    if (process.env.PRINT_FP)
      console.log(issues.map((i) => `${text.split('\n')[0]} -> ${formatIssue(i)}`).join('\n'));
    expect(issues.filter((i) => i.severity === 'error').map(formatIssue)).toEqual([]);
  });
});
