// POSCAR / CONTCAR reader and writer.
// @source S-019 (VASP wiki: POSCAR), S-041 (author's Field Handbook, "Input and output files")
import { ParseError } from './errors';
import { cartToFrac } from './lattice';
import { det3, scale as vscale } from './linalg';
import type { Mat3, Structure, Vec3 } from './types';

export interface PoscarResult {
  structure: Structure;
  warnings: string[];
  /** True when the coordinates were Cartesian in the file (they are returned as fractional). */
  wasCartesian: boolean;
  /** Scale factor that was applied to the lattice (after the negative-volume rule). */
  appliedScale: number;
}

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/;

function num(tok: string | undefined, line: number, what: string): number {
  if (tok === undefined || !NUM.test(tok))
    throw new ParseError(`expected a number for ${what}, found "${tok ?? ''}"`, line);
  return Number(tok.replace(/[dD]/, 'e'));
}

function vec3(text: string | undefined, line: number, what: string): Vec3 {
  if (text === undefined) throw new ParseError(`missing ${what}`, line);
  const t = text.trim().split(/\s+/);
  if (t.length < 3) throw new ParseError(`${what} needs three numbers`, line);
  return [num(t[0], line, what), num(t[1], line, what), num(t[2], line, what)];
}

/** Parse POSCAR text. Throws ParseError (with `line`) for malformed input. */
export function parsePoscar(text: string): PoscarResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  if (lines.length < 8) throw new ParseError('file is too short to be a POSCAR', lines.length);
  const comment = lines[0]!.trim();

  // line 2: scale
  const sTok = lines[1]!.trim().split(/\s+/).filter(Boolean);
  if (sTok.length === 3) throw new ParseError('three scaling factors are not supported yet', 2);
  if (sTok.length !== 1) throw new ParseError('line 2 must hold one scaling factor', 2);
  const s0 = num(sTok[0], 2, 'the scaling factor');
  if (s0 === 0) throw new ParseError('the scaling factor cannot be zero', 2);

  const raw: Mat3 = [
    vec3(lines[2], 3, 'lattice vector 1'),
    vec3(lines[3], 4, 'lattice vector 2'),
    vec3(lines[4], 5, 'lattice vector 3'),
  ];
  const v0 = Math.abs(det3(raw));
  if (v0 < 1e-12) throw new ParseError('the three lattice vectors do not span a volume', 5);
  const sc = s0 > 0 ? s0 : Math.cbrt(Math.abs(s0) / v0);
  const lattice: Mat3 = [vscale(raw[0], sc), vscale(raw[1], sc), vscale(raw[2], sc)];

  // line 6 (and 7): symbols and counts
  let idx = 5;
  const l6 = lines[idx]!.trim().split(/\s+/).filter(Boolean);
  let symbols: string[];
  if (l6.length > 0 && /^[A-Za-z]/.test(l6[0]!)) {
    symbols = l6;
    idx++;
  } else {
    symbols = [];
    warnings.push('species names missing (VASP 4 format)');
  }
  const cTok = (lines[idx] ?? '').trim().split(/\s+/).filter(Boolean);
  if (cTok.length === 0) throw new ParseError('missing the line with atom counts', idx + 1);
  const counts = cTok.map((t) => {
    if (!/^\d+$/.test(t))
      throw new ParseError(`atom counts must be non-negative integers, found "${t}"`, idx + 1);
    return Number(t);
  });
  if (symbols.length === 0) symbols = counts.map((_, i) => `X${i + 1}`);
  if (symbols.length !== counts.length) {
    throw new ParseError(`${symbols.length} species names but ${counts.length} counts`, idx + 1);
  }
  idx++;

  // optional selective dynamics, then coordinate mode
  let selective = false;
  let mode = (lines[idx] ?? '').trim();
  if (/^[sS]/.test(mode)) {
    selective = true;
    idx++;
    mode = (lines[idx] ?? '').trim();
  }
  if (mode === '') throw new ParseError('missing the Direct or Cartesian line', idx + 1);
  const cartesian = /^[cCkK]/.test(mode);
  idx++;

  const total = counts.reduce((a, b) => a + b, 0);
  const species: string[] = [];
  const labels: string[] = [];
  const frac: Vec3[] = [];
  const flags: [boolean, boolean, boolean][] = [];
  let atom = 0;
  symbols.forEach((label, g) => {
    for (let n = 0; n < counts[g]!; n++) {
      const ln = idx + atom + 1;
      const row = lines[idx + atom];
      if (row === undefined || row.trim() === '') {
        throw new ParseError(`expected ${total} atom lines, found only ${atom}`, ln);
      }
      const t = row.trim().split(/\s+/);
      const p: Vec3 = [num(t[0], ln, 'x'), num(t[1], ln, 'y'), num(t[2], ln, 'z')];
      if (selective) {
        const f = t.slice(3, 6);
        if (f.length < 3 || !f.every((x) => /^[TtFf]$/.test(x))) {
          throw new ParseError('selective dynamics needs three T/F flags after the coordinates', ln);
        }
        flags.push([/[Tt]/.test(f[0]!), /[Tt]/.test(f[1]!), /[Tt]/.test(f[2]!)]);
      }
      frac.push(cartesian ? cartToFrac(vscale(p, sc), lattice) : p);
      labels.push(label);
      species.push(label.split('_')[0]!);
      atom++;
    }
  });

  const structure: Structure = {
    lattice,
    species,
    labels,
    frac,
    comment,
    ...(selective ? { selective: flags } : {}),
  };
  return { structure, warnings, wasCartesian: cartesian, appliedScale: sc };
}

export interface WritePoscarOptions {
  comment?: string;
  /** Digits after the decimal point; default 16. */
  decimals?: number;
}

export interface WritePoscarResult {
  text: string;
  /** permutation[newIndex] = oldIndex. Identity when the sites were already grouped. */
  permutation: number[];
  /** True when the order of sites changed (the UI must tell the user: MAGMOM follows POSCAR order). */
  reordered: boolean;
}

/** Site group key: the raw label when present, else the element symbol. */
const keyOf = (s: Structure, i: number) => s.labels?.[i] ?? s.species[i]!;

/** Write VASP 5 POSCAR text: Direct coordinates, sites grouped by species in order of first appearance. */
export function writePoscar(s: Structure, opts: WritePoscarOptions = {}): WritePoscarResult {
  const dec = opts.decimals ?? 16;
  const order: string[] = [];
  const groups = new Map<string, number[]>();
  s.frac.forEach((_, i) => {
    const k = keyOf(s, i);
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    groups.get(k)!.push(i);
  });
  const permutation = order.flatMap((k) => groups.get(k)!);
  const reordered = permutation.some((old, i) => old !== i);
  const fmt = (x: number) => {
    const t = x.toFixed(dec);
    return Number(t) === 0 ? (0).toFixed(dec) : t;
  };
  const row = (v: Vec3) => `  ${v.map(fmt).join('  ')}`;
  const out: string[] = [
    (opts.comment ?? s.comment ?? 'POSCAR').replace(/[\r\n]+/g, ' '),
    '1.0',
    ...s.lattice.map(row),
    order.join(' '),
    order.map((k) => groups.get(k)!.length).join(' '),
  ];
  if (s.selective) out.push('Selective dynamics');
  out.push('Direct');
  for (const old of permutation) {
    const f = s.selective?.[old];
    out.push(row(s.frac[old]!) + (f ? `  ${f.map((b) => (b ? 'T' : 'F')).join(' ')}` : ''));
  }
  return { text: out.join('\n') + '\n', permutation, reordered };
}
