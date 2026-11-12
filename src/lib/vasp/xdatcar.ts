// XDATCAR parser (VASP 5 format: element symbols on line 6). Handles fixed-cell files (one header) and
// variable-cell files (the header repeats before every frame). Coordinates are fractional ("Direct configuration=").
// @source S-019 (VASP wiki: XDATCAR), S-041
import { ParseError } from '../crystal/errors';
import { numbersIn } from './num';
import type { Mat3, Vec3 } from '../crystal/types';

export interface XdatcarResult {
  comment: string;
  /** One element symbol per atom. */
  species: string[];
  symbols: string[];
  counts: number[];
  /** Lattice per frame (scaled, Angstrom). */
  lattices: Mat3[];
  /** frames[frame][atom] fractional coordinates. */
  frames: Vec3[][];
}

export function parseXdatcar(text: string): XdatcarResult {
  const lines = text.split(/\r?\n/);
  let i = 0;
  let comment = '';
  let symbols: string[] = [];
  let counts: number[] = [];
  let lattice: Mat3 | null = null;
  const lattices: Mat3[] = [];
  const frames: Vec3[][] = [];

  const readHeader = () => {
    comment = (lines[i] ?? '').trim();
    const sc = numbersIn(lines[i + 1] ?? '');
    if (sc.length !== 1 || sc[0] === 0) throw new ParseError('expected one scaling factor', i + 2);
    const rows = [2, 3, 4].map((d) => numbersIn(lines[i + d] ?? ''));
    if (rows.some((r) => r.length < 3)) throw new ParseError('expected three lattice vectors', i + 3);
    // a negative factor means "target volume" in POSCAR; XDATCAR written by VASP never uses it
    if (sc[0]! < 0) throw new ParseError('a negative scaling factor is not supported in XDATCAR', i + 2);
    const s = sc[0]!;
    lattice = rows.map((r) => [r[0]! * s, r[1]! * s, r[2]! * s] as Vec3) as unknown as Mat3;
    const sym = (lines[i + 5] ?? '').trim().split(/\s+/).filter(Boolean);
    if (sym.length === 0 || !/^[A-Za-z]/.test(sym[0]!))
      throw new ParseError('line 6 must list the element symbols (VASP 5 format)', i + 6);
    const cn = numbersIn(lines[i + 6] ?? '');
    if (cn.length !== sym.length) throw new ParseError('line 7 must give one count per element', i + 7);
    symbols = sym;
    counts = cn;
    i += 7;
  };

  readHeader();
  const natoms = () => counts.reduce((a, b) => a + b, 0);
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.trim() === '') {
      i++;
      continue;
    }
    if (/^\s*Direct configuration/i.test(l)) {
      i++;
      const f: Vec3[] = [];
      for (let a = 0; a < natoms(); a++, i++) {
        const v = numbersIn(lines[i] ?? '');
        if (v.length < 3)
          throw new ParseError(`frame ${frames.length + 1}: expected 3 coordinates for atom ${a + 1}`, i + 1);
        f.push([v[0]!, v[1]!, v[2]!]);
      }
      frames.push(f);
      lattices.push(lattice!);
    } else if (/^\s*Cartesian configuration/i.test(l)) {
      throw new ParseError('Cartesian XDATCAR frames are not supported', i + 1);
    } else {
      readHeader(); // variable-cell: header repeats
    }
  }
  if (frames.length === 0) throw new ParseError('no "Direct configuration=" frame found', lines.length);
  const species = symbols.flatMap((s, k) => Array<string>(counts[k]!).fill(s));
  return { comment, species, symbols, counts, lattices, frames };
}
