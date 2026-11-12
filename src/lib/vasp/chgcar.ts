// CHGCAR / CHG / PARCHG parser: structure header, grid, values in Fortran order (x fastest, then y, then z), a second grid
// (magnetization) when present, augmentation blocks skipped.
// Stored values are rho(r) * V_cell, so the density in e/Angstrom^3 is value / V, and sum(values) / N_grid is the electron count.
// @source S-019 (VASP wiki: CHGCAR), S-041 (Field Handbook: "values divided by the cell volume")
import { ParseError } from '../crystal/errors';
import { parsePoscar } from '../crystal/poscar';
import { cellVolume } from '../crystal/lattice';
import type { Structure } from '../crystal/types';

export interface ChgcarResult {
  structure: Structure;
  /** [nx, ny, nz]. */
  grid: [number, number, number];
  /** Cell volume in Angstrom^3. */
  volume: number;
  /** Raw rho * V, index ix + nx * (iy + ny * iz). */
  data: Float64Array;
  /** Second grid (m * V) for ISPIN = 2, same layout. */
  magnetization?: Float64Array;
  warnings: string[];
}

export type Progress = (fraction: number) => void;

/** Read `count` numbers starting at `pos`; returns the position after the last one. Handles "D" exponents. */
export function readNumbers(
  text: string,
  pos: number,
  count: number,
  out: Float64Array,
  onProgress?: Progress,
): number {
  const n = text.length;
  let p = pos;
  let k = 0;
  const step = Math.max(1, Math.floor(count / 100));
  while (k < count) {
    while (p < n && text.charCodeAt(p) <= 32) p++;
    if (p >= n) throw new ParseError(`the file ends after ${k} of ${count} grid values`);
    let q = p;
    while (q < n && text.charCodeAt(q) > 32) q++;
    const tok = text.slice(p, q);
    const v = Number(tok.includes('D') || tok.includes('d') ? tok.replace(/[Dd]/, 'E') : tok);
    if (Number.isNaN(v)) throw new ParseError(`"${tok.slice(0, 20)}" is not a number (grid value ${k + 1})`);
    out[k++] = v;
    p = q;
    if (onProgress && k % step === 0) onProgress(k / count);
  }
  return p;
}

const GRID_LINE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/;

export function parseChgcar(text: string, onProgress?: Progress): ChgcarResult {
  // the POSCAR block ends at the first blank line after the coordinates
  const lines = text.split(/\r?\n/, 4000);
  let blank = -1;
  for (let i = 8; i < lines.length; i++)
    if (lines[i]!.trim() === '') {
      blank = i;
      break;
    }
  if (blank < 0) throw new ParseError('no blank line after the structure block: not a CHGCAR');
  const warnings: string[] = [];
  const poscar = parsePoscar(lines.slice(0, blank).join('\n'));
  warnings.push(...poscar.warnings);
  let gi = blank + 1;
  while (gi < lines.length && lines[gi]!.trim() === '') gi++;
  const m = GRID_LINE.exec(lines[gi] ?? '');
  if (!m) throw new ParseError('expected the grid size "NGX NGY NGZ"', gi + 1);
  const grid: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const total = grid[0] * grid[1] * grid[2];
  if (total < 1 || total > 1.5e9) throw new ParseError(`grid ${grid.join(' x ')} is not usable`, gi + 1);

  // character offset of the line after the grid line
  let pos = 0;
  for (let i = 0; i <= gi; i++) {
    const nl = text.indexOf('\n', pos);
    pos = nl < 0 ? text.length : nl + 1;
  }
  const data = new Float64Array(total);
  pos = readNumbers(text, pos, total, data, onProgress ? (f) => onProgress(f * 0.5) : undefined);

  // skip augmentation blocks; a second grid starts at the next line equal to the first grid line
  let magnetization: Float64Array | undefined;
  const rest = text.slice(pos, pos + 2_000_000_000 > text.length ? undefined : pos + 2_000_000_000);
  const re = new RegExp(String.raw`\n[ \t]*${grid[0]}[ \t]+${grid[1]}[ \t]+${grid[2]}[ \t]*\r?\n`);
  const hit = re.exec(rest);
  if (hit) {
    const start = pos + hit.index + hit[0].length;
    magnetization = new Float64Array(total);
    readNumbers(text, start, total, magnetization, onProgress ? (f) => onProgress(0.5 + f * 0.5) : undefined);
  }
  onProgress?.(1);
  return {
    structure: poscar.structure,
    grid,
    volume: cellVolume(poscar.structure.lattice),
    data,
    ...(magnetization ? { magnetization } : {}),
    warnings,
  };
}

/** Number of electrons: sum(values) / N_grid (values are rho * V). */
export function electronCount(values: Float64Array): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i]!;
  return s / values.length;
}

/** Largest density in e/Angstrom^3 (raw value / volume). */
export function maxDensity(c: ChgcarResult): number {
  let m = -Infinity;
  for (let i = 0; i < c.data.length; i++) if (c.data[i]! > m) m = c.data[i]!;
  return m / c.volume;
}

/** Index into a grid array. */
export const gridIndex = (g: readonly [number, number, number], ix: number, iy: number, iz: number): number =>
  ix + g[0] * (iy + g[1] * iz);
