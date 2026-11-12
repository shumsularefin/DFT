/**
 * Shareable URL fragment for a composition.
 * Format: A=el:ox:cn:spin:geometry:fraction,...&B=...&X=...&p=12  (spin and geometry empty when not set).
 * Decoding validates everything and returns null for a malformed fragment, so a bad link never breaks the page.
 */
import { atomicNumber } from '../crystal/elements';
import type { Occupant } from './sites';
import type { Composition } from './checks';

export type Policy = 12 | 9 | 8;
export interface ToolState {
  composition: Composition;
  policy: Policy;
}

const fmt = (o: Occupant) => [o.el, o.ox, o.cn, o.spin ?? '', o.geometry ?? '', o.fraction].join(':');

export function encodeState(s: ToolState): string {
  const site = (k: 'A' | 'B' | 'X') => `${k}=${s.composition[k].map(fmt).join(',')}`;
  return `${site('A')}&${site('B')}&${site('X')}&p=${s.policy}`;
}

function parseOccupant(text: string): Occupant | null {
  const f = text.split(':');
  if (f.length !== 6) return null;
  const [el, ox, cn, spin, geo, frac] = f as [string, string, string, string, string, string];
  if (!/^[A-Z][a-z]?$/.test(el) || atomicNumber(el) === undefined) return null;
  const nOx = Number(ox);
  const nCn = Number(cn);
  const nFr = Number(frac);
  if (!Number.isInteger(nOx) || nOx === 0 || Math.abs(nOx) > 8) return null;
  if (!Number.isInteger(nCn) || nCn < 1 || nCn > 14) return null;
  if (!(nFr > 0 && nFr <= 1)) return null;
  if (spin !== '' && spin !== 'HS' && spin !== 'LS') return null;
  if (geo !== '' && geo !== 'SQ' && geo !== 'PY') return null;
  return {
    el,
    ox: nOx,
    cn: nCn,
    fraction: nFr,
    ...(spin ? { spin: spin as 'HS' | 'LS' } : {}),
    ...(geo ? { geometry: geo as 'SQ' | 'PY' } : {}),
  };
}

export function decodeState(hash: string): ToolState | null {
  const text = hash.replace(/^#/, '');
  if (!text) return null;
  const parts = new Map<string, string>();
  for (const kv of text.split('&')) {
    const i = kv.indexOf('=');
    if (i < 1) return null;
    parts.set(kv.slice(0, i), kv.slice(i + 1));
  }
  const comp: Partial<Composition> = {};
  for (const k of ['A', 'B', 'X'] as const) {
    const raw = parts.get(k);
    if (!raw) return null;
    const occ = raw.split(',').map(parseOccupant);
    if (occ.length === 0 || occ.length > 2 || occ.some((o) => o === null)) return null;
    comp[k] = occ as Occupant[];
  }
  const p = Number(parts.get('p') ?? 12);
  if (p !== 12 && p !== 9 && p !== 8) return null;
  return { composition: comp as Composition, policy: p };
}
