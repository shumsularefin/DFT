// VASP DOSCAR parser (total and site-projected DOS; ISPIN 1 and 2; LORBIT 10 and 11).
// @source S-019 (VASP wiki: DOSCAR), S-042 (Field Handbook)
import { numbersIn } from './num';

export const ORBITALS_LORBIT10 = ['s', 'p', 'd'] as const;
export const ORBITALS_LORBIT11 = ['s', 'py', 'pz', 'px', 'dxy', 'dyz', 'dz2', 'dxz', 'dx2'] as const;

export interface DoscarSite {
  readonly ion: number;
  readonly lorbit: 10 | 11;
  readonly orbitals: readonly string[];
  /** Map from orbital name to up-spin (or total if ISPIN=1) DOS array aligned with `energies`. */
  readonly up: Readonly<Record<string, readonly number[]>>;
  /** Present when ISPIN = 2. */
  readonly down?: Readonly<Record<string, readonly number[]>>;
}

export interface DoscarResult {
  readonly nions: number;
  readonly nedos: number;
  readonly efermi: number;
  readonly ispin: 1 | 2;
  readonly energies: readonly number[];
  readonly totalUp: readonly number[];
  readonly totalDown?: readonly number[];
  readonly integratedUp: readonly number[];
  readonly integratedDown?: readonly number[];
  readonly sites: readonly DoscarSite[];
  readonly warnings: readonly string[];
}

export function parseDoscar(text: string): DoscarResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  if (lines.length < 7) throw new Error('DOSCAR is too short to contain header and total DOS.');

  const head0 = numbersIn(lines[0]!);
  const nions = Math.round(head0[0] ?? 0);
  const dosHead = numbersIn(lines[5]!);
  if (dosHead.length < 4) throw new Error('DOSCAR line 6 header is malformed.');
  const nedos = Math.round(dosHead[2]!);
  const efermi = dosHead[3]!;

  const firstRow = numbersIn(lines[6] ?? '');
  const ispin: 1 | 2 = firstRow.length >= 5 ? 2 : 1;

  const energies: number[] = [];
  const totalUp: number[] = [];
  const totalDown: number[] = [];
  const integratedUp: number[] = [];
  const integratedDown: number[] = [];

  for (let i = 0; i < nedos; i++) {
    const row = numbersIn(lines[6 + i] ?? '');
    if (row.length < (ispin === 2 ? 5 : 3)) {
      warnings.push(`Total DOS row ${i + 1} has ${row.length} columns.`);
      continue;
    }
    energies.push(row[0]!);
    if (ispin === 2) {
      totalUp.push(row[1]!);
      totalDown.push(row[2]!);
      integratedUp.push(row[3]!);
      integratedDown.push(row[4]!);
    } else {
      totalUp.push(row[1]!);
      integratedUp.push(row[2]!);
    }
  }

  const sites: DoscarSite[] = [];
  let cursor = 6 + nedos;
  for (let ion = 1; ion <= nions && cursor + nedos < lines.length; ion++) {
    // Skip blank lines if any before site header
    while (cursor < lines.length && lines[cursor]!.trim() === '') cursor++;
    if (cursor + nedos >= lines.length) break;
    // Site header line
    cursor++;
    const sampleRow = numbersIn(lines[cursor] ?? '');
    const nCols = sampleRow.length - 1;
    if (nCols <= 0) break;
    const nOrb = ispin === 2 ? Math.floor(nCols / 2) : nCols;
    const lorbit: 10 | 11 = nOrb >= 9 ? 11 : 10;
    const orbitals =
      lorbit === 11
        ? ORBITALS_LORBIT11.slice(0, Math.min(nOrb, ORBITALS_LORBIT11.length))
        : ORBITALS_LORBIT10.slice(0, Math.min(nOrb, ORBITALS_LORBIT10.length));

    const up: Record<string, number[]> = {};
    const down: Record<string, number[]> = {};
    for (const orb of orbitals) {
      up[orb] = [];
      if (ispin === 2) down[orb] = [];
    }

    for (let i = 0; i < nedos; i++) {
      const row = numbersIn(lines[cursor + i] ?? '');
      if (row.length < 1 + orbitals.length * ispin) continue;
      for (let o = 0; o < orbitals.length; o++) {
        const orb = orbitals[o]!;
        if (ispin === 2) {
          up[orb]!.push(row[1 + 2 * o]!);
          down[orb]!.push(row[2 + 2 * o]!);
        } else {
          up[orb]!.push(row[1 + o]!);
        }
      }
    }
    sites.push({
      ion,
      lorbit,
      orbitals,
      up,
      ...(ispin === 2 ? { down } : {}),
    });
    cursor += nedos;
  }

  return {
    nions,
    nedos,
    efermi,
    ispin,
    energies,
    totalUp,
    ...(ispin === 2 ? { totalDown } : {}),
    integratedUp,
    ...(ispin === 2 ? { integratedDown } : {}),
    sites,
    warnings,
  };
}

/** Optional Gaussian smoothing of a DOS curve (off by default in the UI). */
export function smoothDos(energies: readonly number[], values: readonly number[], sigmaEv: number): number[] {
  if (sigmaEv <= 0 || energies.length !== values.length || energies.length < 2) return [...values];
  const out = new Array<number>(values.length).fill(0);
  const inv2s2 = 1 / (2 * sigmaEv * sigmaEv);
  for (let i = 0; i < energies.length; i++) {
    let wSum = 0;
    let vSum = 0;
    const ei = energies[i]!;
    for (let j = 0; j < energies.length; j++) {
      const de = ei - energies[j]!;
      if (Math.abs(de) > 4 * sigmaEv) continue;
      const w = Math.exp(-de * de * inv2s2);
      wSum += w;
      vSum += w * values[j]!;
    }
    out[i] = wSum > 0 ? vSum / wSum : values[i]!;
  }
  return out;
}
