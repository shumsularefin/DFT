// VASP 5 XDATCAR trajectory parser (supports fixed-cell and variable-cell frames).
// @source S-019 (VASP wiki: XDATCAR), S-042 (Field Handbook)
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import { numbersIn } from './num';

export interface XdatcarFrame {
  readonly index: number;
  readonly structure: Structure;
}

export interface XdatcarResult {
  readonly comment: string;
  readonly species: readonly string[];
  readonly frames: readonly XdatcarFrame[];
}

function readLattice(lines: string[], start: number): { lattice: Mat3; next: number } {
  const scale = numbersIn(lines[start] ?? '')[0];
  if (scale === undefined) throw new Error(`Invalid XDATCAR scale factor at line ${start + 1}.`);
  const rows: Vec3[] = [];
  for (let r = 0; r < 3; r++) {
    const v = numbersIn(lines[start + 1 + r] ?? '');
    if (v.length < 3) throw new Error(`Invalid XDATCAR lattice row at line ${start + 2 + r}.`);
    rows.push([v[0]! * scale, v[1]! * scale, v[2]! * scale]);
  }
  return { lattice: [rows[0]!, rows[1]!, rows[2]!], next: start + 4 };
}

export function parseXdatcar(text: string): XdatcarResult {
  const lines = text.split(/\r?\n/);
  if (lines.length < 8) throw new Error('XDATCAR is too short.');
  const comment = lines[0]!.trim();
  const { lattice: initLattice } = readLattice(lines, 1);

  const symParts = (lines[5] ?? '').trim().split(/\s+/).filter(Boolean);
  const countParts = numbersIn(lines[6] ?? '');
  if (symParts.length === 0 || symParts.length !== countParts.length) {
    throw new Error('XDATCAR species / counts lines are malformed.');
  }
  const species: string[] = [];
  for (let s = 0; s < symParts.length; s++) {
    const cnt = Math.round(countParts[s]!);
    for (let k = 0; k < cnt; k++) species.push(symParts[s]!);
  }
  const nAtoms = species.length;

  const frames: XdatcarFrame[] = [];
  let currentLattice = initLattice;
  let i = 7;

  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (/^Direct\s+configuration=/i.test(trimmed)) {
      const m = /configuration=\s*(\d+)/i.exec(trimmed);
      const frameIndex = m ? Number(m[1]) : frames.length + 1;
      i++;
      const frac: Vec3[] = [];
      for (let a = 0; a < nAtoms; a++) {
        const v = numbersIn(lines[i++] ?? '');
        if (v.length < 3) throw new Error(`Truncated XDATCAR frame ${frameIndex} at atom ${a + 1}.`);
        frac.push([v[0]!, v[1]!, v[2]!]);
      }
      frames.push({
        index: frameIndex,
        structure: {
          lattice: currentLattice,
          species,
          frac,
          comment: `${comment} (frame ${frameIndex})`,
        },
      });
    } else if (i + 7 < lines.length && /^Direct\s+configuration=/i.test(lines[i + 7]!.trim())) {
      // Variable-cell XDATCAR repeats the 7-line header before each frame
      currentLattice = readLattice(lines, i + 1).lattice;
      i += 7;
    } else {
      i++;
    }
  }

  return { comment, species, frames };
}
