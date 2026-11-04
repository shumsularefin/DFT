// Series CSV parser for pasted convergence results. Pure.
// @source S-042 (workflow convergence series)
import { ParseError } from '../crystal/errors';

export interface SeriesRow {
  x: number;
  energy: number;
  natoms?: number;
  pressure?: number;
  label?: string;
}

export interface SeriesCsv {
  rows: SeriesRow[];
  /** Header text of the x column when a header was given (for example "encut"). */
  xName?: string;
  warnings: string[];
}

const ALIASES: Record<string, 'x' | 'energy' | 'natoms' | 'pressure' | 'label'> = {
  x: 'x',
  encut: 'x',
  kpoints: 'x',
  k: 'x',
  kspacing: 'x',
  resolution: 'x',
  energy: 'energy',
  e: 'energy',
  e0: 'energy',
  esigma0: 'energy',
  toten: 'energy',
  natoms: 'natoms',
  nions: 'natoms',
  atoms: 'natoms',
  pressure: 'pressure',
  p: 'pressure',
  pressurekb: 'pressure',
  label: 'label',
  name: 'label',
};

function sniff(line: string): RegExp {
  if (line.includes('\t')) return /\t/;
  if (line.includes(';')) return /;/;
  if (line.includes(',')) return /,/;
  return /\s+/;
}

const isNumber = (s: string) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s);

/** Parse a pasted series. Delimiter is comma, tab, semicolon or spaces. A decimal comma is rejected with a clear message. */
export function parseSeriesCsv(text: string): SeriesCsv {
  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter((x) => x.l !== '' && !x.l.startsWith('#'));
  if (lines.length === 0) throw new ParseError('the series is empty');
  const sep = sniff(lines[0]!.l);
  const split = (l: string) => l.split(sep).map((c) => c.trim());
  const decimalComma = lines.some(
    ({ l }) => sep.source !== ',' && split(l).some((c) => /^[-+]?\d+,\d+$/.test(c)),
  );
  if (decimalComma)
    throw new ParseError(
      'numbers with a decimal comma are not accepted; write 1.5 instead of 1,5 and separate columns with tabs, semicolons or spaces',
    );
  let cols: (keyof SeriesRow)[] = ['x', 'energy', 'natoms', 'pressure'];
  let start = 0;
  let xName: string | undefined;
  const first = split(lines[0]!.l);
  if (first.some((c) => c !== '' && !isNumber(c))) {
    cols = first.map((h) => {
      const k = ALIASES[h.toLowerCase().replace(/[^a-z0-9]/g, '')];
      if (!k)
        throw new ParseError(
          `unknown column "${h}"; use x, encut, kpoints, energy, natoms, pressure or label`,
          lines[0]!.n,
        );
      return k;
    });
    if (!cols.includes('x') || !cols.includes('energy'))
      throw new ParseError(
        'the header needs an x column (for example encut) and an energy column',
        lines[0]!.n,
      );
    xName = first[cols.indexOf('x')]!.toLowerCase();
    start = 1;
  }
  const rows: SeriesRow[] = [];
  const warnings: string[] = [];
  for (const { l, n } of lines.slice(start)) {
    const cells = split(l);
    if (cells.length < 2) throw new ParseError('each row needs at least an x value and an energy', n);
    if (cells.length > cols.length && start === 1)
      throw new ParseError(`row has ${cells.length} values but the header names ${cols.length} columns`, n);
    const row: Partial<SeriesRow> = {};
    cells.forEach((c, i) => {
      const k = cols[i];
      if (!k) return;
      if (k === 'label') row.label = c;
      else {
        if (!isNumber(c)) throw new ParseError(`"${c}" is not a number`, n);
        row[k] = Number(c);
      }
    });
    if (row.x === undefined || row.energy === undefined) throw new ParseError('missing x or energy', n);
    rows.push(row as SeriesRow);
  }
  if (rows.length < 4) warnings.push('Fewer than 4 points: a convergence judgement from so few is weak.');
  return { rows, ...(xName ? { xName } : {}), warnings };
}
