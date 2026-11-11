/**
 * Mixed A or B sites, A(1-x)A'x and B(1-y)B'y.
 * Convention (Q-016, D-058): "linear mixing", the occupancy-weighted mean of the ionic radius and of the
 * oxidation state. This is a convention, not a result from the tau paper. Each occupant has its own CN and spin.
 */
import { getRadius, type Geometry, type ShannonEntry, type Spin } from './shannon';

export interface Occupant {
  el: string;
  ox: number;
  cn: number;
  spin?: Spin;
  geometry?: Geometry;
  /** occupancy fraction, 0 < fraction <= 1 */
  fraction: number;
}

export type SiteResult =
  | {
      ok: true;
      radius: number;
      oxidation: number;
      parts: { occupant: Occupant; entry: ShannonEntry }[];
      convention: 'linear mixing';
    }
  | { ok: false; reason: string; occupant?: Occupant; available?: ShannonEntry[] };

export const OCCUPANCY_TOLERANCE = 1e-6;

export function mixSite(occupants: Occupant[]): SiteResult {
  if (occupants.length === 0) return { ok: false, reason: 'A site needs at least one occupant.' };
  for (const o of occupants) {
    if (!(o.fraction > 0 && o.fraction <= 1)) {
      return { ok: false, reason: `Occupancy of ${o.el} must be above 0 and at most 1.`, occupant: o };
    }
  }
  const sum = occupants.reduce((a, o) => a + o.fraction, 0);
  if (Math.abs(sum - 1) > OCCUPANCY_TOLERANCE) {
    return { ok: false, reason: `Occupancies must sum to 1 (they sum to ${sum}).` };
  }
  let radius = 0;
  let oxidation = 0;
  const parts: { occupant: Occupant; entry: ShannonEntry }[] = [];
  for (const o of occupants) {
    const r = getRadius({ el: o.el, ox: o.ox, cn: o.cn, spin: o.spin, geometry: o.geometry, kind: 'ionic' });
    if (!r.ok) return { ok: false, reason: r.reason, occupant: o, available: r.available };
    radius += o.fraction * r.value;
    oxidation += o.fraction * o.ox;
    parts.push({ occupant: o, entry: r.entry });
  }
  return { ok: true, radius, oxidation, parts, convention: 'linear mixing' };
}
