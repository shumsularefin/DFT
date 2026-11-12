/** Text helpers for showing a Shannon entry and its source. */
import type { ShannonEntry } from './shannon';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

export const romanCn = (cn: number): string => ROMAN[cn] ?? String(cn);

/** "Cu3+", "O2-", "Na+", "Cl-". */
export const ionLabel = (el: string, ox: number): string =>
  `${el}${Math.abs(ox) === 1 ? '' : Math.abs(ox)}${ox < 0 ? '-' : '+'}`;

const GEOMETRY = { SQ: 'square planar', PY: 'pyramidal' } as const;
const SPIN = { HS: 'high spin', LS: 'low spin' } as const;

/** "Shannon 1976, Cu3+, CN VI, low spin, ionic radius 0.54 Angstrom" (S-001). */
export function sourceLine(e: ShannonEntry, kind: 'ionic' | 'crystal' = 'ionic'): string {
  const parts = ['Shannon 1976', ionLabel(e.el, e.ox), `CN ${romanCn(e.cn)}`];
  if (e.geometry) parts.push(GEOMETRY[e.geometry]);
  if (e.spin) parts.push(SPIN[e.spin]);
  parts.push(`${kind} radius ${e[kind]} Angstrom`);
  return parts.join(', ');
}

export const spinName = (s: 'HS' | 'LS'): string => SPIN[s];
export const geometryName = (g: 'SQ' | 'PY' | null): string => (g ? GEOMETRY[g] : 'standard');
