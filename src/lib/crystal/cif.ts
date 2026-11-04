// CIF reader and writer (the subset materials work needs: cell, symmetry operations, atom sites).
// @source S-034 (CIF core dictionary: _cell_*, _atom_site_fract_*, _symmetry_equiv_pos_as_xyz, _space_group_symop_operation_xyz)
import { elementFromLabel } from './elements';
import { ParseError } from './errors';
import { fromParameters, latticeParameters } from './lattice';
import type { Mat3, Structure, Vec3 } from './types';

interface Token {
  text: string;
  line: number;
  quoted: boolean;
}

/** Split CIF text into tokens: bare words, 'quoted' and "quoted" strings, and ;text fields. Comments are dropped. */
function tokenize(text: string): Token[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const out: Token[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.startsWith(';')) {
      const start = i + 1;
      const parts = [raw.slice(1)];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i]!.startsWith(';')) {
          closed = true;
          break;
        }
        parts.push(lines[i]!);
      }
      if (!closed) throw new ParseError('a ; text field is never closed', start);
      out.push({ text: parts.join('\n').trim(), line: start, quoted: true });
      continue;
    }
    let p = 0;
    while (p < raw.length) {
      const ch = raw[p]!;
      if (ch === ' ' || ch === '\t') {
        p++;
      } else if (ch === '#') {
        break;
      } else if (ch === "'" || ch === '"') {
        let q = p + 1;
        for (; q < raw.length; q++) {
          if (raw[q] === ch && (q + 1 === raw.length || /\s/.test(raw[q + 1]!))) break;
        }
        if (q >= raw.length) throw new ParseError(`a quote (${ch}) is never closed`, i + 1);
        out.push({ text: raw.slice(p + 1, q), line: i + 1, quoted: true });
        p = q + 1;
      } else {
        let q = p;
        while (q < raw.length && !/\s/.test(raw[q]!)) q++;
        out.push({ text: raw.slice(p, q), line: i + 1, quoted: false });
        p = q;
      }
    }
  }
  return out;
}

interface RawBlock {
  name: string;
  line: number;
  /** Lower-cased tag to value token (for single tags). */
  items: Map<string, Token>;
  /** Loops: lower-cased tags plus rows of tokens. */
  loops: { tags: string[]; rows: Token[][]; line: number }[];
}

const isKeyword = (t: Token): boolean =>
  !t.quoted && (/^(data_|loop_|save_|global_|stop_)/i.test(t.text) || t.text.startsWith('_'));

function readBlocks(tokens: Token[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let cur: RawBlock | undefined;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (!t.quoted && /^data_/i.test(t.text)) {
      cur = { name: t.text.slice(5), line: t.line, items: new Map(), loops: [] };
      blocks.push(cur);
      i++;
    } else if (!cur) {
      throw new ParseError('expected a data_ block header before any data', t.line);
    } else if (!t.quoted && /^loop_$/i.test(t.text)) {
      i++;
      const tags: string[] = [];
      while (i < tokens.length && !tokens[i]!.quoted && tokens[i]!.text.startsWith('_')) {
        tags.push(tokens[i]!.text.toLowerCase());
        i++;
      }
      if (tags.length === 0) throw new ParseError('loop_ has no column names', t.line);
      const vals: Token[] = [];
      while (i < tokens.length && !isKeyword(tokens[i]!)) vals.push(tokens[i++]!);
      if (vals.length % tags.length !== 0) {
        throw new ParseError(
          `loop_ has ${tags.length} columns but ${vals.length} values (a value is missing or extra)`,
          vals[vals.length - 1]?.line ?? t.line,
        );
      }
      const rows: Token[][] = [];
      for (let r = 0; r < vals.length; r += tags.length) rows.push(vals.slice(r, r + tags.length));
      cur.loops.push({ tags, rows, line: t.line });
    } else if (!t.quoted && t.text.startsWith('_')) {
      const v = tokens[i + 1];
      if (!v || isKeyword(v)) throw new ParseError(`${t.text} has no value`, t.line);
      cur.items.set(t.text.toLowerCase(), v);
      i += 2;
    } else {
      throw new ParseError(`unexpected text "${t.text.slice(0, 30)}"`, t.line);
    }
  }
  return blocks;
}

const UNKNOWN = new Set(['?', '.']);

/** A CIF number, with an optional standard uncertainty: 5.64(2) is 5.64. Unknown values (? and .) give undefined. */
function cifNumber(t: Token | undefined, what: string): number | undefined {
  if (!t || (!t.quoted && UNKNOWN.has(t.text))) return undefined;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:\(\d+\))?$/.exec(t.text);
  if (!m) throw new ParseError(`expected a number for ${what}, found "${t.text}"`, t.line);
  return Number(m[1]);
}

/** One symmetry operation as an affine map on fractional coordinates: x' = R x + t. */
export interface CifOperation {
  rotation: readonly [Vec3, Vec3, Vec3];
  translation: Vec3;
}

/** Parse an operation such as "-x+y, x, z+1/2" or "1/2+x,y,-z". */
export function parseSymop(text: string, line?: number): CifOperation {
  const comps = text.toLowerCase().replace(/\s+/g, '').split(',');
  if (comps.length !== 3) throw new ParseError(`symmetry operation "${text}" needs three parts`, line);
  const rot: number[][] = [];
  const tr: number[] = [];
  for (const c of comps) {
    const row = [0, 0, 0];
    let t = 0;
    const re = /([+-]?)(?:(\d+(?:\.\d*)?|\.\d+)(?:\/(\d+))?|([xyz]))/gy;
    let pos = 0;
    while (pos < c.length) {
      re.lastIndex = pos;
      const m = re.exec(c);
      if (!m) throw new ParseError(`cannot read symmetry operation "${text}"`, line);
      pos = re.lastIndex;
      const sign = m[1] === '-' ? -1 : 1;
      if (m[4]) {
        const k = 'xyz'.indexOf(m[4]);
        row[k] = row[k]! + sign;
      } else {
        const num = Number(m[2]);
        const den = m[3] ? Number(m[3]) : 1;
        if (den === 0) throw new ParseError(`division by zero in "${text}"`, line);
        t += (sign * num) / den;
      }
    }
    rot.push(row);
    tr.push(t);
  }
  return {
    rotation: [rot[0]! as unknown as Vec3, rot[1]! as unknown as Vec3, rot[2]! as unknown as Vec3],
    translation: [tr[0]!, tr[1]!, tr[2]!],
  };
}

export interface CifBlock {
  /** Name after data_. */
  name: string;
  structure: Structure;
  /** From the file, when given. Not trusted: run the symmetry analysis for the real answer. */
  spaceGroupNumber?: number;
  spaceGroupSymbol?: string;
  /** Number of symmetry operations used to expand the asymmetric unit (1 when the file listed none). */
  operationCount: number;
  warnings: string[];
}

const wrap = (x: number): number => {
  const w = x - Math.floor(x);
  return w > 1 - 1e-9 ? 0 : w < 1e-9 ? 0 : w;
};

function elementOf(token: string, line: number): string {
  const el = elementFromLabel(token);
  if (!el) throw new ParseError(`"${token}" is not a known element symbol`, line);
  return el;
}

const MERGE_TOL = 1e-3;

function buildBlock(b: RawBlock): CifBlock {
  const warnings: string[] = [];
  const cellNum = (tag: string): number => {
    const t = b.items.get(tag);
    const v = cifNumber(t, tag);
    if (v === undefined) throw new ParseError(`data block "${b.name}" has no ${tag}`, t?.line ?? b.line);
    return v;
  };
  const [a, bb, c] = [cellNum('_cell_length_a'), cellNum('_cell_length_b'), cellNum('_cell_length_c')];
  const [al, be, ga] = [
    cellNum('_cell_angle_alpha'),
    cellNum('_cell_angle_beta'),
    cellNum('_cell_angle_gamma'),
  ];
  if (!(a > 0 && bb > 0 && c > 0)) throw new ParseError('cell lengths must be positive', b.line);
  for (const ang of [al, be, ga])
    if (!(ang > 0 && ang < 180))
      throw new ParseError('cell angles must be between 0 and 180 degrees', b.line);
  const lattice = fromParameters(a, bb, c, al, be, ga);
  if (!(Math.abs(lattice[2][2]) > 1e-6))
    throw new ParseError('the cell angles do not form a valid cell (zero volume)', b.line);

  // Symmetry operations: either tag name is valid.
  const opLoop = b.loops.find((l) =>
    l.tags.some((t) => t === '_symmetry_equiv_pos_as_xyz' || t === '_space_group_symop_operation_xyz'),
  );
  const ops: CifOperation[] = [];
  if (opLoop) {
    const col = opLoop.tags.findIndex(
      (t) => t === '_symmetry_equiv_pos_as_xyz' || t === '_space_group_symop_operation_xyz',
    );
    for (const row of opLoop.rows) ops.push(parseSymop(row[col]!.text, row[col]!.line));
  } else {
    const single =
      b.items.get('_symmetry_equiv_pos_as_xyz') ?? b.items.get('_space_group_symop_operation_xyz');
    if (single) ops.push(parseSymop(single.text, single.line));
  }
  if (ops.length === 0) {
    ops.push({
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      translation: [0, 0, 0],
    });
    warnings.push(
      'The file lists no symmetry operations, so its atom list is used as written (space group P1).',
    );
  }

  const siteLoop = b.loops.find((l) => l.tags.includes('_atom_site_fract_x'));
  if (!siteLoop)
    throw new ParseError(
      `data block "${b.name}" has no fractional atom positions (_atom_site_fract_x/y/z). Cartesian-only CIF files are not supported.`,
      b.line,
    );
  const ix = siteLoop.tags.indexOf('_atom_site_fract_x');
  const iy = siteLoop.tags.indexOf('_atom_site_fract_y');
  const iz = siteLoop.tags.indexOf('_atom_site_fract_z');
  if (iy < 0 || iz < 0)
    throw new ParseError('the atom list needs _atom_site_fract_x, _y and _z', siteLoop.line);
  const itype = siteLoop.tags.indexOf('_atom_site_type_symbol');
  const ilabel = siteLoop.tags.indexOf('_atom_site_label');
  const iocc = siteLoop.tags.indexOf('_atom_site_occupancy');
  if (itype < 0 && ilabel < 0)
    throw new ParseError('the atom list needs _atom_site_type_symbol or _atom_site_label', siteLoop.line);

  const species: string[] = [];
  const frac: Vec3[] = [];
  for (const row of siteLoop.rows) {
    const p: number[] = [];
    for (const [k, tag] of [
      [ix, 'x'],
      [iy, 'y'],
      [iz, 'z'],
    ] as const) {
      const v = cifNumber(row[k], `fractional ${tag}`);
      if (v === undefined)
        throw new ParseError(`an atom has an unknown fractional ${tag} coordinate`, row[k]!.line);
      p.push(v);
    }
    if (iocc >= 0) {
      const occ = cifNumber(row[iocc], 'occupancy');
      if (occ !== undefined && Math.abs(occ - 1) > 1e-6) {
        throw new ParseError(
          `site "${row[ilabel >= 0 ? ilabel : ix]!.text}" has occupancy ${occ}, which means a disordered (partly filled) site. A VASP calculation needs every site fully occupied: choose one ordered arrangement, for example a supercell where each site is either filled or empty, and export that.`,
          row[iocc]!.line,
        );
      }
    }
    const symTok = row[itype >= 0 ? itype : ilabel]!;
    const el = elementOf(symTok.text, symTok.line);
    const x: Vec3 = [p[0]!, p[1]!, p[2]!];
    for (const op of ops) {
      const y: Vec3 = [0, 1, 2].map((i) =>
        wrap(
          op.rotation[i]![0]! * x[0] +
            op.rotation[i]![1]! * x[1] +
            op.rotation[i]![2]! * x[2] +
            op.translation[i]!,
        ),
      ) as unknown as Vec3;
      const dup = frac.some((f, n) => {
        if (species[n] !== el) return false;
        return [0, 1, 2].every((i) => {
          const d = y[i]! - f[i]!;
          return Math.abs(d - Math.round(d)) < MERGE_TOL;
        });
      });
      if (!dup) {
        species.push(el);
        frac.push(y);
      }
    }
  }
  if (frac.length === 0) throw new ParseError(`data block "${b.name}" has no atoms`, siteLoop.line);

  const num = b.items.get('_symmetry_int_tables_number') ?? b.items.get('_space_group_it_number');
  const sym = b.items.get('_symmetry_space_group_name_h-m') ?? b.items.get('_space_group_name_h-m_alt');
  const n = cifNumber(num, 'space group number');
  return {
    name: b.name,
    structure: { lattice, species, frac, comment: b.name || 'CIF' },
    ...(n !== undefined ? { spaceGroupNumber: n } : {}),
    ...(sym && !UNKNOWN.has(sym.text) ? { spaceGroupSymbol: sym.text } : {}),
    operationCount: ops.length,
    warnings,
  };
}

/** Parse CIF text into one result per data block. Throws ParseError (with `line`) for malformed or unsupported input. */
export function parseCif(text: string): CifBlock[] {
  const blocks = readBlocks(tokenize(text));
  if (blocks.length === 0)
    throw new ParseError('no data_ block found: this does not look like a CIF file', 1);
  return blocks.map(buildBlock);
}

export interface WriteCifOptions {
  /** Name after data_ (default "structure"). */
  name?: string;
  /** Detected space group, recorded in a comment only: the file itself is written in P1. */
  symmetry?: { number: number; hmSymbol: string };
}

const f8 = (x: number): string => x.toFixed(8);

/** Write a structure as a P1 CIF (every atom listed, one identity symmetry operation). */
export function writeCif(s: Structure, opts: WriteCifOptions = {}): string {
  const p = latticeParameters(s.lattice as Mat3);
  const name = (opts.name ?? 'structure').replace(/\s+/g, '_');
  const lines = ['# written by DFT Handbook (P1: every atom is listed)'];
  if (opts.symmetry)
    lines.push(`# detected space group ${opts.symmetry.hmSymbol} (number ${opts.symmetry.number})`);
  lines.push(
    `data_${name}`,
    "_symmetry_space_group_name_H-M   'P 1'",
    '_symmetry_Int_Tables_number   1',
    `_cell_length_a   ${f8(p.a)}`,
    `_cell_length_b   ${f8(p.b)}`,
    `_cell_length_c   ${f8(p.c)}`,
    `_cell_angle_alpha   ${f8(p.alpha)}`,
    `_cell_angle_beta   ${f8(p.beta)}`,
    `_cell_angle_gamma   ${f8(p.gamma)}`,
    'loop_',
    ' _symmetry_equiv_pos_site_id',
    ' _symmetry_equiv_pos_as_xyz',
    "  1  'x, y, z'",
    'loop_',
    ' _atom_site_type_symbol',
    ' _atom_site_label',
    ' _atom_site_fract_x',
    ' _atom_site_fract_y',
    ' _atom_site_fract_z',
    ' _atom_site_occupancy',
  );
  const seen = new Map<string, number>();
  s.species.forEach((el, i) => {
    const k = seen.get(el) ?? 0;
    seen.set(el, k + 1);
    const f = s.frac[i]!;
    lines.push(`  ${el}  ${el}${k + 1}  ${f8(f[0])}  ${f8(f[1])}  ${f8(f[2])}  1`);
  });
  return lines.join('\n') + '\n';
}
