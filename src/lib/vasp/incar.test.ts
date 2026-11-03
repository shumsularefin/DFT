import { describe, expect, it } from 'vitest';
import wf from '../../../scripts/__generated__/workflow-handbook.json';
import { ParseError } from '../crystal/errors';
import { expandRepeats, magmomCount, parseIncar, parseLogical, writeIncar } from './incar';

describe('parser', () => {
  it('repeat syntax expands: 2*5.0 4*0.6', () => {
    expect(expandRepeats('2*5.0 4*0.6')).toEqual([5, 5, 0.6, 0.6, 0.6, 0.6]);
    expect(magmomCount('2*5.0 4*0.6')).toBe(6);
    expect(magmomCount('4.0 -4.0 8*0.0')).toBe(10);
  });
  it('bad repeat tokens throw', () => {
    expect(() => expandRepeats('2*x')).toThrow(RangeError);
    expect(() => expandRepeats('0*1')).toThrow(RangeError);
  });
  it('.TRUE., .T., T all true; false forms; other null', () => {
    for (const v of ['.TRUE.', '.T.', 'T', '.true.', 'true']) expect(parseLogical(v)).toBe(true);
    for (const v of ['.FALSE.', '.F.', 'F']) expect(parseLogical(v)).toBe(false);
    expect(parseLogical('2')).toBeNull();
  });
  it('case-insensitive tags, comments with # and !, ; separators', () => {
    const r = parseIncar('encut = 520 # cutoff\nISMEAR = 0; SIGMA = 0.05 ! small\n\n# only a comment\n');
    expect(r.entries.map((e) => [e.name, e.value])).toEqual([
      ['ENCUT', '520'],
      ['ISMEAR', '0'],
      ['SIGMA', '0.05'],
    ]);
    expect(r.entries[0]!.comment).toBe('cutoff');
    expect(r.entries[1]!.comment).toBeUndefined();
    expect(r.entries[2]!.comment).toBe('small');
  });
  it('line continuation', () => {
    const r = parseIncar('MAGMOM = 2*5.0 \\\n 4*0.6\nENCUT = 400\n');
    expect(r.entries[0]!.value).toBe('2*5.0 4*0.6');
    expect(magmomCount(r.entries[0]!.value)).toBe(6);
    expect(r.entries[1]!.line).toBe(3);
  });
  it('CRLF', () => expect(parseIncar('A = 1\r\nB = 2\r\n').entries).toHaveLength(2));
  it('duplicates warn and are kept', () => {
    const r = parseIncar('ENCUT = 400\nISMEAR = 0\nencut = 500\n');
    expect(r.entries).toHaveLength(3);
    expect(r.warnings).toEqual(['ENCUT is set more than once (lines 1 and 3)']);
  });
  it.each([
    ['ENCUT 400', 1],
    ['A = 1\nENCUT =', 2],
    ['1BAD = 3', 1],
  ])('%j fails on line %i', (t, line) => {
    try {
      parseIncar(t);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(line);
    }
  });
});

describe('writer', () => {
  it('aligns names and writes comments; comments can be switched off', () => {
    const e = [
      { name: 'ENCUT', value: '520', comment: 'why' },
      { name: 'IBRION', value: '2' },
    ];
    expect(writeIncar(e)).toBe('ENCUT  = 520  # why\nIBRION = 2\n');
    expect(writeIncar(e, { comments: false })).toBe('ENCUT  = 520\nIBRION = 2\n');
    expect(writeIncar([])).toBe('');
  });
});

describe('every extracted handbook INCAR and fragment round-trips', () => {
  const blocks = wf.incarBlocks.filter((b) => b.kind !== 'phonopy-config');
  it('13 blocks (11 INCARs + 2 fragments)', () => expect(blocks).toHaveLength(13));
  blocks.forEach((b, i) => {
    it(`#${i} ${b.caption}`, () => {
      const a = parseIncar(b.text);
      expect(a.entries.length).toBeGreaterThan(0);
      const again = parseIncar(writeIncar(a.entries));
      expect(again.entries.map((e) => [e.name, e.value])).toEqual(a.entries.map((e) => [e.name, e.value]));
      expect(again.entries.map((e) => e.comment)).toEqual(a.entries.map((e) => e.comment));
    });
  });
  it('the MAGMOM fragment warns about duplicates (alternatives meant to be picked from)', () => {
    const f = wf.incarBlocks.find((b) => b.kind === 'fragment' && b.name === 'MAGMOM')!;
    expect(parseIncar(f.text).warnings.length).toBeGreaterThan(0);
  });
  it('the relaxation INCAR has MAGMOM for 6 atoms', () => {
    const r = parseIncar(wf.incarBlocks[0]!.text);
    expect(magmomCount(r.entries.find((e) => e.name === 'MAGMOM')!.value)).toBe(6);
  });
});
