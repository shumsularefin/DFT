// One entry point for reading a structure file: POSCAR/CONTCAR, CIF or XYZ, detected from the name and the content.
// Files are parsed in the browser and never uploaded.
// @source S-019 (POSCAR), S-034 (CIF), S-054 (XYZ format: atom count, comment, one "Element x y z" line per atom)
import { parseCif } from './cif';
import { elementFromLabel } from './elements';
import { ParseError } from './errors';
import { cartToFrac } from './lattice';
import { parsePoscar } from './poscar';
import type { Mat3, Structure, Vec3 } from './types';

export type FileFormat = 'poscar' | 'cif' | 'xyz';

export interface ReadOptions {
  /** Lattice for an XYZ file (rows in Angstrom). Without it the atoms are put in a box and a warning is given. */
  cell?: Mat3;
  /** Which data block of a multi-block CIF to use (default 0). */
  block?: number;
}

export interface ReadResult {
  structure: Structure;
  format: FileFormat;
  warnings: string[];
  /** Number of structures found in the file (CIF data blocks); only the chosen one is returned. */
  blockCount: number;
}

/** Guess the format from the file name first, then from the text. */
export function detectFormat(name: string, text: string): FileFormat {
  const lower = name.toLowerCase().split(/[\\/]/).pop() ?? '';
  if (lower.endsWith('.cif')) return 'cif';
  if (lower.endsWith('.xyz')) return 'xyz';
  if (/^(poscar|contcar)/.test(lower) || lower.endsWith('.vasp')) return 'poscar';
  if (/^\s*data_/m.test(text) && /_cell_length_a/i.test(text)) return 'cif';
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (/^\d+$/.test(first)) return 'xyz';
  return 'poscar';
}

const BOX_PADDING = 10;

function parseXyz(text: string, opts: ReadOptions): ReadResult {
  const lines = text.replace(/\s+$/, '').split(/\r?\n/);
  const n = Number(lines[0]?.trim());
  if (!Number.isInteger(n) || n < 1)
    throw new ParseError('the first line of an XYZ file is the number of atoms', 1);
  if (lines.length < n + 2)
    throw new ParseError(`expected ${n} atom lines but the file ends early`, lines.length);
  const species: string[] = [];
  const cart: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const ln = i + 3;
    const t = lines[i + 2]!.trim().split(/\s+/);
    if (t.length < 4) throw new ParseError('an atom line needs an element and three coordinates', ln);
    const el = elementFromLabel(t[0]!);
    if (!el) throw new ParseError(`"${t[0]}" is not a known element symbol`, ln);
    const xyz = [t[1]!, t[2]!, t[3]!].map(Number);
    if (xyz.some((x) => !Number.isFinite(x))) throw new ParseError('coordinates must be numbers', ln);
    species.push(el);
    cart.push([xyz[0]!, xyz[1]!, xyz[2]!]);
  }
  const comment = lines[1]?.trim() ?? '';
  const warnings: string[] = [];
  let lattice = opts.cell;
  const ext = /Lattice="([^"]+)"/i.exec(comment);
  if (!lattice && ext) {
    const v = ext[1]!.trim().split(/\s+/).map(Number);
    if (v.length === 9 && v.every(Number.isFinite))
      lattice = [
        [v[0]!, v[1]!, v[2]!],
        [v[3]!, v[4]!, v[5]!],
        [v[6]!, v[7]!, v[8]!],
      ];
  }
  let shifted = cart;
  if (!lattice) {
    const min = [0, 1, 2].map((k) => Math.min(...cart.map((c) => c[k]!)));
    const max = [0, 1, 2].map((k) => Math.max(...cart.map((c) => c[k]!)));
    const len = [0, 1, 2].map((k) => max[k]! - min[k]! + 2 * BOX_PADDING);
    lattice = [
      [len[0]!, 0, 0],
      [0, len[1]!, 0],
      [0, 0, len[2]!],
    ];
    shifted = cart.map((c) => [
      c[0] - min[0]! + BOX_PADDING,
      c[1] - min[1]! + BOX_PADDING,
      c[2] - min[2]! + BOX_PADDING,
    ]);
    warnings.push(
      `An XYZ file has no unit cell, so the atoms were placed in a box with ${BOX_PADDING} Angstrom of empty space around them (a molecule in a box). Give a cell if this is a crystal.`,
    );
  }
  const frac = shifted.map((c) => cartToFrac(c, lattice!));
  return {
    structure: { lattice, species, frac, ...(comment && !ext ? { comment } : {}) },
    format: 'xyz',
    warnings,
    blockCount: 1,
  };
}

/** Read a structure from file text. Throws ParseError with a line number for malformed input. */
export function readStructure(name: string, text: string, opts: ReadOptions = {}): ReadResult {
  const format = detectFormat(name, text);
  if (format === 'xyz') return parseXyz(text, opts);
  if (format === 'cif') {
    const blocks = parseCif(text);
    const idx = opts.block ?? 0;
    const b = blocks[idx];
    if (!b)
      throw new ParseError(`the file has ${blocks.length} data block(s); block ${idx + 1} does not exist`);
    const warnings = [...b.warnings];
    if (blocks.length > 1)
      warnings.push(
        `This CIF file holds ${blocks.length} structures. Showing "${b.name}"; choose another block to switch.`,
      );
    return { structure: b.structure, format, warnings, blockCount: blocks.length };
  }
  const p = parsePoscar(text);
  return { structure: p.structure, format, warnings: p.warnings, blockCount: 1 };
}
