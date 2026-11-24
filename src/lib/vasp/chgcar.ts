// VASP CHGCAR / CHG / PARCHG volumetric grid parser.
// VASP stores rho(r) * V_cell in Fortran x-fastest order: index = ix + nx * (iy + ny * iz).
// Dividing by cellVolume gives electron density in e / Angstrom^3 (S-042).
// @source S-019 (VASP wiki: CHGCAR), S-042 (Field Handbook)
import { cellVolume } from '../crystal/lattice';
import { parsePoscar } from '../crystal/poscar';
import type { Structure } from '../crystal/types';

export interface ChgcarResult {
  readonly structure: Structure;
  readonly volumeA3: number;
  readonly grid: readonly [number, number, number];
  /** Raw rho * V_cell values in x-fastest order (length = nx * ny * nz). */
  readonly totalRaw: Float64Array;
  /** Present when ISPIN = 2: raw (rho_up - rho_down) * V_cell in x-fastest order. */
  readonly diffRaw?: Float64Array;
  /** Integrated total electrons: sum(totalRaw) / N_grid. */
  readonly electrons: number;
  /** Maximum total electron density in e / Angstrom^3. */
  readonly maxDensityPerA3: number;
  /** Integrated net magnetization when diffRaw is present: sum(diffRaw) / N_grid. */
  readonly magnetization?: number;
}

function readGridBlock(
  lines: string[],
  startLine: number,
  totalPts: number,
): { values: Float64Array; nextLine: number } {
  const values = new Float64Array(totalPts);
  let count = 0;
  let i = startLine;
  while (i < lines.length && count < totalPts) {
    const trimmed = lines[i]!.trim();
    i++;
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    for (const p of parts) {
      if (count >= totalPts) break;
      const v = Number(p);
      if (!Number.isFinite(v)) throw new Error(`Invalid volumetric number "${p}" at line ${i}.`);
      values[count++] = v;
    }
  }
  if (count < totalPts)
    throw new Error(`Volumetric grid truncated: expected ${totalPts} values, got ${count}.`);
  return { values, nextLine: i };
}

export function parseChgcar(text: string): ChgcarResult {
  const lines = text.split(/\r?\n/);
  // Find the blank line separating the POSCAR header from the NGXF NGYF NGZF grid line
  let blankIdx = -1;
  for (let i = 7; i < lines.length; i++) {
    if (lines[i]!.trim() === '') {
      blankIdx = i;
      break;
    }
  }
  if (blankIdx < 0) throw new Error('CHGCAR missing blank line before grid dimensions.');

  const poscarText = lines.slice(0, blankIdx).join('\n');
  const structure = parsePoscar(poscarText).structure;
  const volumeA3 = Math.abs(cellVolume(structure.lattice));

  let gridLineIdx = blankIdx + 1;
  while (gridLineIdx < lines.length && lines[gridLineIdx]!.trim() === '') gridLineIdx++;
  const dims = (lines[gridLineIdx] ?? '').trim().split(/\s+/).map(Number);
  if (dims.length < 3 || !dims.slice(0, 3).every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error(`Invalid CHGCAR grid dimensions at line ${gridLineIdx + 1}.`);
  }
  const grid: [number, number, number] = [dims[0]!, dims[1]!, dims[2]!];
  const nPts = grid[0] * grid[1] * grid[2];

  const first = readGridBlock(lines, gridLineIdx + 1, nPts);

  // Look for optional second volumetric block (magnetization density for ISPIN = 2) after augmentation occupancies
  let diffRaw: Float64Array | undefined;
  const dimPattern = new RegExp(`^\\s*${grid[0]}\\s+${grid[1]}\\s+${grid[2]}\\s*$`);
  for (let i = first.nextLine; i < lines.length; i++) {
    if (dimPattern.test(lines[i]!)) {
      diffRaw = readGridBlock(lines, i + 1, nPts).values;
      break;
    }
  }

  let sum = 0;
  let maxRaw = -Infinity;
  for (let i = 0; i < nPts; i++) {
    const v = first.values[i]!;
    sum += v;
    if (v > maxRaw) maxRaw = v;
  }
  const electrons = sum / nPts;
  const maxDensityPerA3 = volumeA3 > 0 ? maxRaw / volumeA3 : 0;

  let magnetization: number | undefined;
  if (diffRaw) {
    let mSum = 0;
    for (let i = 0; i < nPts; i++) mSum += diffRaw[i]!;
    magnetization = mSum / nPts;
  }

  return {
    structure,
    volumeA3,
    grid,
    totalRaw: first.values,
    ...(diffRaw ? { diffRaw } : {}),
    electrons,
    maxDensityPerA3,
    ...(magnetization !== undefined ? { magnetization } : {}),
  };
}

/** Index into x-fastest Fortran volumetric array: ix + nx * (iy + ny * iz). */
export function gridIndex(
  grid: readonly [number, number, number],
  ix: number,
  iy: number,
  iz: number,
): number {
  return ix + grid[0] * (iy + grid[1] * iz);
}
