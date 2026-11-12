/**
 * Oxidation-state frequency classification.
 * Counts: SMACT 4.0.2 ICSD 2024 (S-051). Convention (D-058): share among non-zero states >= 0.10 is
 * "common", any count above zero is "known-rare", no count is "not-observed".
 * @source S-051
 */
import data from '../../data/oxidation-states.json';

export type OxidationClass = 'common' | 'known-rare' | 'not-observed';

export const COMMON_SHARE_THRESHOLD = 0.1;

const COUNTS = data.counts as Record<string, Record<string, number>>;

export interface OxidationInfo {
  class: OxidationClass;
  /** count / sum of counts over non-zero states of the element (0 when not observed) */
  share: number;
  count: number;
}

export function oxidationInfo(el: string, ox: number): OxidationInfo {
  const c = COUNTS[el];
  if (!c) return { class: 'not-observed', share: 0, count: 0 };
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const count = c[String(ox)] ?? 0;
  if (count === 0 || total === 0) return { class: 'not-observed', share: 0, count: 0 };
  const share = count / total;
  return { class: share >= COMMON_SHARE_THRESHOLD ? 'common' : 'known-rare', share, count };
}

export function classifyOxidation(el: string, ox: number): OxidationClass {
  return oxidationInfo(el, ox).class;
}

export const oxidationDataMeta = data._meta;
