import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

const types = (lang: Parameters<typeof highlight>[0], line: string) =>
  highlight(lang, line)[0]!
    .filter((t) => t.text.trim())
    .map((t) => [t.type, t.text]);

describe('highlight', () => {
  it('INCAR: tag, value and a trailing comment', () => {
    expect(types('incar', 'ENCUT = 520  # cutoff in eV')).toEqual([
      ['tag', 'ENCUT'],
      ['punct', '='],
      ['number', '520'],
      ['comment', '# cutoff in eV'],
    ]);
  });

  it('INCAR: ! starts a comment and a whole-line comment has no tag', () => {
    expect(types('incar', '! relaxation')).toEqual([['comment', '! relaxation']]);
    expect(types('incar', 'LREAL = .FALSE. ! small cell')).toEqual([
      ['tag', 'LREAL'],
      ['punct', '='],
      ['keyword', '.FALSE.'],
      ['comment', '! small cell'],
    ]);
  });

  it('KPOINTS: title, counts and mode keyword', () => {
    const lines = highlight('kpoints', 'Automatic mesh\n0\nGamma\n6 6 6\n0 0 0');
    expect(lines[0]).toEqual([{ type: 'comment', text: 'Automatic mesh' }]);
    expect(lines[1]).toEqual([{ type: 'number', text: '0' }]);
    expect(lines[2]).toEqual([{ type: 'keyword', text: 'Gamma' }]);
    expect(lines[3]!.filter((t) => t.type === 'number')).toHaveLength(3);
  });

  it('POSCAR: title line, lattice numbers, Direct keyword', () => {
    const lines = highlight('poscar', 'Si2\n1.0\n 0.0 2.7 2.7\nSi\n2\nDirect\n0 0 0');
    expect(lines[0]![0]!.type).toBe('comment');
    expect(lines[2]!.filter((t) => t.type === 'number').map((t) => t.text)).toEqual(['0.0', '2.7', '2.7']);
    expect(lines[5]).toEqual([{ type: 'keyword', text: 'Direct' }]);
  });

  it('shell: only a real comment is highlighted', () => {
    expect(highlight('shell', 'mpirun -np 4 vasp_std  # run')[0]!.at(-1)).toEqual({
      type: 'comment',
      text: '# run',
    });
    expect(highlight('shell', 'echo a#b')[0]).toEqual([{ type: 'plain', text: 'echo a#b' }]);
  });

  it('never changes the text', () => {
    const src = 'SYSTEM = Si   ! test\nISMEAR = 0';
    const joined = highlight('incar', src)
      .map((l) => l.map((t) => t.text).join(''))
      .join('\n');
    expect(joined).toBe(src);
  });
});
