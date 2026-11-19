// Oxidation-state frequencies and the common / known-rare / not-observed classification.
// @source S-051 (SMACT 4.0.2 ICSD 2024 occurrence counts; src/data/oxidation-states.json, scripts/data/build_oxidation.py)
// Convention D-061: share among non-zero states >= 0.10 is common, any count above zero is known-rare,
// no count is not-observed. Licence of the derived statistics: Q-012.
import data from '../../data/oxidation-states.json';

export type OxidationClass = 'common' | 'known-rare' | 'not-observed';
export const COMMON_SHARE = 0.1;
export const oxidationMeta = data._meta;
const COUNTS = data.counts as Record<string, Record<string, number>>;

/** Occurrence count of an oxidation state (0 when the element or state has no entry). */
export function oxidationCount(el: string, ox: number): number {
  return COUNTS[el]?.[String(ox)] ?? 0;
}

/** Non-zero oxidation states with their share of all non-zero entries, largest first. */
export function oxidationShares(el: string): { ox: number; count: number; share: number }[] {
  const c = COUNTS[el];
  if (!c) return [];
  const rows = Object.entries(c)
    .map(([k, n]) => ({ ox: Number(k), count: n }))
    .filter((r) => r.ox !== 0);
  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map((r) => ({ ...r, share: total ? r.count / total : 0 })).sort((a, b) => b.count - a.count);
}

export interface OxidationVerdict {
  el: string;
  ox: number;
  class: OxidationClass;
  count: number;
  /** Share among non-zero states (undefined for ox = 0 or an element without data). */
  share?: number;
  known: boolean;
}

export function classifyOxidation(el: string, ox: number): OxidationVerdict {
  const known = el in COUNTS;
  const count = oxidationCount(el, ox);
  const share = ox === 0 ? undefined : oxidationShares(el).find((r) => r.ox === ox)?.share;
  const cls: OxidationClass =
    count === 0 ? 'not-observed' : share !== undefined && share >= COMMON_SHARE ? 'common' : 'known-rare';
  const out: OxidationVerdict = { el, ox, class: cls, count, known };
  if (share !== undefined) out.share = share;
  return out;
}

/** States classified `common`, in decreasing frequency. */
export function commonOxidationStates(el: string): number[] {
  return oxidationShares(el)
    .filter((r) => r.share >= COMMON_SHARE)
    .map((r) => r.ox);
}
