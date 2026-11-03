// INCAR parser and writer. Pure functions, no DOM.
// @source S-019 (VASP wiki: INCAR file format), S-041, S-042
import { ParseError } from '../crystal/errors';

export interface IncarEntry {
  /** Upper-case tag name. */
  name: string;
  /** Value text exactly as written (trimmed), for example "2*5.0 4*0.6" or ".TRUE.". */
  value: string;
  /** Inline comment without the leading # or !. */
  comment?: string;
  /** 1-based line of the file this entry came from (set by the parser, ignored by the writer). */
  line?: number;
}

export interface IncarParse {
  /** Entries in file order. Comment-only lines are not kept. */
  entries: IncarEntry[];
  warnings: string[];
}

const TAG = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Find the first # or ! outside nothing special: VASP treats both as comment starts. */
function splitComment(s: string): [string, string | undefined] {
  const i = s.search(/[#!]/);
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1).trim()];
}

/**
 * Parse INCAR text. Tags are case-insensitive (stored upper-case); `#` and `!` start comments; `;` separates several
 * assignments on one line; a trailing `\` continues the line. Throws ParseError (with the line) for text that is not
 * `TAG = value`. Duplicate tags produce a warning and are both kept.
 */
export function parseIncar(text: string): IncarParse {
  const raw = text.split(/\r?\n/);
  const entries: IncarEntry[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const startLine = i + 1;
    let line = raw[i]!;
    // continuation: the backslash must be the last character before any comment, so strip the comment first
    let [body, comment] = splitComment(line);
    while (/\\\s*$/.test(body) && i + 1 < raw.length) {
      body = body.replace(/\\\s*$/, ' ').replace(/\s+$/, ' ');
      i++;
      line = raw[i]!;
      const [b2, c2] = splitComment(line);
      body += b2.replace(/^\s+/, '');
      if (c2 !== undefined) comment = comment ? `${comment} ${c2}` : c2;
    }
    if (body.trim() === '') continue;
    const parts = body.split(';').filter((p) => p.trim() !== '');
    parts.forEach((p, k) => {
      const eq = p.indexOf('=');
      if (eq < 0) throw new ParseError(`expected TAG = value, found "${p.trim()}"`, startLine);
      const name = p.slice(0, eq).trim();
      if (!TAG.test(name)) throw new ParseError(`"${name}" is not a valid tag name`, startLine);
      const value = p.slice(eq + 1).trim();
      if (value === '') throw new ParseError(`${name.toUpperCase()} has no value`, startLine);
      const e: IncarEntry = { name: name.toUpperCase(), value, line: startLine };
      if (k === parts.length - 1 && comment) e.comment = comment;
      entries.push(e);
    });
  }
  const seen = new Map<string, number>();
  for (const e of entries) {
    const first = seen.get(e.name);
    if (first !== undefined) warnings.push(`${e.name} is set more than once (lines ${first} and ${e.line})`);
    else seen.set(e.name, e.line ?? 0);
  }
  return { entries, warnings };
}

export interface WriteIncarOptions {
  /** Write inline comments (default true). */
  comments?: boolean;
}

/** Write entries one per line as `NAME = value  # comment`, padding names to the longest one. */
export function writeIncar(entries: readonly IncarEntry[], opts: WriteIncarOptions = {}): string {
  const withComments = opts.comments ?? true;
  const w = Math.max(0, ...entries.map((e) => e.name.length));
  const lines = entries.map((e) => {
    const base = `${e.name.padEnd(w)} = ${e.value}`;
    return withComments && e.comment ? `${base}  # ${e.comment.replace(/[\r\n]+/g, ' ')}` : base;
  });
  return lines.join('\n') + (lines.length ? '\n' : '');
}

/** Parse a VASP logical: .TRUE. .T. T TRUE (any case) and the false forms. Returns null when it is neither. */
export function parseLogical(value: string): boolean | null {
  const v = value
    .trim()
    .replace(/^\.|\.$/g, '')
    .toUpperCase();
  if (v === 'T' || v === 'TRUE') return true;
  if (v === 'F' || v === 'FALSE') return false;
  return null;
}

/** Expand the repeat syntax: "2*5.0 4*0.6" gives [5, 5, 0.6, 0.6, 0.6, 0.6]. Commas and spaces separate items. */
export function expandRepeats(value: string): number[] {
  const out: number[] = [];
  for (const tok of value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)) {
    const m = /^(\d+)\*(.+)$/.exec(tok);
    const count = m ? Number(m[1]) : 1;
    const x = Number((m ? m[2]! : tok).replace(/[dD]/, 'e'));
    if (!Number.isFinite(count) || !Number.isFinite(x) || count < 1)
      throw new RangeError(`cannot read "${tok}" as a number`);
    for (let k = 0; k < count; k++) out.push(x);
  }
  return out;
}

/** Number of MAGMOM values after expanding repeats; compare with the number of atoms. */
export const magmomCount = (value: string): number => expandRepeats(value).length;
