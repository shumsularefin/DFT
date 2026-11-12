/**
 * Shannon radii lookup. Never substitutes a nearest value: a missing or
 * ambiguous request returns `ok: false` with a reason and the available entries.
 * @source S-001 (Shannon 1976 data), S-034 (as compiled by pymatgen; Q-002)
 */
import data from '../../data/shannon-radii.json';

export type Geometry = 'SQ' | 'PY' | null;
export type Spin = 'HS' | 'LS' | null;

export interface ShannonEntry {
  el: string;
  ox: number;
  cn: number;
  geometry: Geometry;
  spin: Spin;
  ionic: number;
  crystal: number;
}

export interface ShannonMeta {
  source: string;
  generated: string;
  entries: number;
  assignable: number;
  elements: number;
  units: string;
  unassigned: { el: string; oxKey: string; cnKey: string; ionic: number; crystal: number }[];
}

export const shannonMeta = data._meta as unknown as ShannonMeta;
const ENTRIES = data.entries as ShannonEntry[];

export interface RadiusQuery {
  el: string;
  ox: number;
  cn: number;
  spin?: Spin;
  geometry?: Geometry;
  kind: 'ionic' | 'crystal';
}

export type RadiusResult =
  { ok: true; value: number; entry: ShannonEntry } | { ok: false; reason: string; available: ShannonEntry[] };

const forIon = (el: string, ox: number) => ENTRIES.filter((e) => e.el === el && e.ox === ox);

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function oxidationStates(el: string): number[] {
  return uniq(ENTRIES.filter((e) => e.el === el).map((e) => e.ox)).sort((a, b) => a - b);
}

export function coordinations(el: string, ox: number): number[] {
  return uniq(forIon(el, ox).map((e) => e.cn)).sort((a, b) => a - b);
}

export function spins(el: string, ox: number, cn: number): Spin[] {
  return uniq(
    forIon(el, ox)
      .filter((e) => e.cn === cn)
      .map((e) => e.spin),
  );
}

/** Geometries tabulated at this coordination (null is the standard one). */
export function geometries(el: string, ox: number, cn: number): Geometry[] {
  return uniq(
    forIon(el, ox)
      .filter((e) => e.cn === cn)
      .map((e) => e.geometry),
  );
}

export function getRadius(q: RadiusQuery): RadiusResult {
  const ion = forIon(q.el, q.ox);
  const label = `${q.el}${Math.abs(q.ox)}${q.ox < 0 ? '-' : '+'}`;
  if (ion.length === 0) {
    return {
      ok: false,
      reason: `No Shannon entry for ${label}.`,
      available: ENTRIES.filter((e) => e.el === q.el),
    };
  }
  const atCn = ion.filter((e) => e.cn === q.cn);
  if (atCn.length === 0) {
    return { ok: false, reason: `No Shannon entry for ${label} at coordination ${q.cn}.`, available: ion };
  }
  let cands = atCn;
  const geoms = uniq(cands.map((e) => e.geometry));
  if (q.geometry !== undefined) {
    cands = cands.filter((e) => e.geometry === q.geometry);
    if (cands.length === 0) {
      return {
        ok: false,
        reason: `No Shannon entry for ${label} at coordination ${q.cn} with that geometry.`,
        available: atCn,
      };
    }
  } else if (geoms.length > 1) {
    const plain = cands.filter((e) => e.geometry === null);
    if (plain.length === 0) {
      return {
        ok: false,
        reason: 'geometry required: several geometries are tabulated for this coordination.',
        available: atCn,
      };
    }
    cands = plain;
  }
  const spinSet = uniq(cands.map((e) => e.spin));
  if (spinSet.includes('HS') && spinSet.includes('LS') && !q.spin) {
    return {
      ok: false,
      reason: 'spin required: the table lists both high spin (HS) and low spin (LS).',
      available: cands,
    };
  }
  if (q.spin) {
    cands = cands.filter((e) => e.spin === q.spin);
    if (cands.length === 0) {
      return {
        ok: false,
        reason: `No ${q.spin} entry for ${label} at coordination ${q.cn}.`,
        available: atCn,
      };
    }
  }
  if (cands.length !== 1) {
    return { ok: false, reason: 'Request is ambiguous; specify spin or geometry.', available: cands };
  }
  const entry = cands[0]!;
  return { ok: true, value: entry[q.kind], entry };
}
