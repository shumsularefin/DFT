// VASP LOCPOT volumetric electrostatic potential parser.
// Unlike CHGCAR, LOCPOT values are already in eV and are NOT multiplied by V_cell (S-019, S-043).
// @source S-019 (VASP wiki: LOCPOT), S-043, S-066
import { parsePoscar } from '../crystal/poscar';
import type { Structure } from '../crystal/types';

export interface LocpotResult {
  readonly structure: Structure;
  readonly grid: readonly [number, number, number];
  /** Local electrostatic potential in eV (x-fastest Fortran order, NOT multiplied by cell volume). */
  readonly potentialEv: Float64Array;
  /** Optional second spin-channel potential in eV when ISPIN = 2. */
  readonly potentialDownEv?: Float64Array;
  readonly isVolumeScaled: false;
}

function readBlock(
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
    for (const p of trimmed.split(/\s+/)) {
      if (count >= totalPts) break;
      const v = Number(p);
      if (!Number.isFinite(v)) throw new Error(`Invalid LOCPOT number "${p}" at line ${i}.`);
      values[count++] = v;
    }
  }
  if (count < totalPts) throw new Error(`LOCPOT truncated: expected ${totalPts} values, got ${count}.`);
  return { values, nextLine: i };
}

export function parseLocpot(text: string): LocpotResult {
  const lines = text.split(/\r?\n/);
  let blankIdx = -1;
  for (let i = 7; i < lines.length; i++) {
    if (lines[i]!.trim() === '') {
      blankIdx = i;
      break;
    }
  }
  if (blankIdx < 0) throw new Error('LOCPOT missing blank line before grid dimensions.');

  const structure = parsePoscar(lines.slice(0, blankIdx).join('\n')).structure;
  let gridLineIdx = blankIdx + 1;
  while (gridLineIdx < lines.length && lines[gridLineIdx]!.trim() === '') gridLineIdx++;
  const dims = (lines[gridLineIdx] ?? '').trim().split(/\s+/).map(Number);
  if (dims.length < 3 || !dims.slice(0, 3).every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error(`Invalid LOCPOT grid dimensions at line ${gridLineIdx + 1}.`);
  }
  const grid: [number, number, number] = [dims[0]!, dims[1]!, dims[2]!];
  const nPts = grid[0] * grid[1] * grid[2];

  const first = readBlock(lines, gridLineIdx + 1, nPts);
  let potentialDownEv: Float64Array | undefined;
  const dimPattern = new RegExp(`^\\s*${grid[0]}\\s+${grid[1]}\\s+${grid[2]}\\s*$`);
  for (let i = first.nextLine; i < lines.length; i++) {
    if (dimPattern.test(lines[i]!)) {
      potentialDownEv = readBlock(lines, i + 1, nPts).values;
      break;
    }
  }

  return {
    structure,
    grid,
    potentialEv: first.values,
    ...(potentialDownEv ? { potentialDownEv } : {}),
    isVolumeScaled: false,
  };
}
