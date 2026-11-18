// Mixed perovskite sites (A1-x A'x, B1-y B'y): occupancy-weighted radius and oxidation state.
// @source S-001 radii via ./shannon. Convention (Q-016, D-062): linear occupancy weighting of the ionic radius
// and of the oxidation state. S-003 uses the arithmetic mean of the two B radii for A2BB'X6 (the 50/50 case);
// other fractions and the A site are this project's extension of it, labelled as a convention in the UI.
import {
  getRadius,
  type Geometry,
  type RadiusKind,
  type RadiusResult,
  type ShannonEntry,
  type Spin,
} from './shannon';

export interface Occupant {
  el: string;
  ox: number;
  cn: number;
  spin?: Spin;
  geometry?: Geometry | null;
  /** Site occupancy, 0 < fraction <= 1; fractions on one site must sum to 1. */
  fraction: number;
}

export const MIXING_CONVENTION =
  "Linear mixing convention: occupancy-weighted average of radius and oxidation state (S-003 uses the arithmetic mean for two B cations in A2BB'X6).";
const SUM_TOL = 1e-6;

export type SiteResult =
  | {
      ok: true;
      radius: number;
      ox: number;
      mixed: boolean;
      occupants: { occupant: Occupant; radius: number; entry: ShannonEntry; note?: string }[];
    }
  | {
      ok: false;
      reason: 'empty site' | 'bad fraction' | 'occupancy sum' | 'radius';
      message: string;
      occupant?: Occupant;
      lookup?: Extract<RadiusResult, { ok: false }>;
    };

export function siteAverage(occupants: Occupant[], kind: RadiusKind = 'ionic'): SiteResult {
  if (occupants.length === 0)
    return { ok: false, reason: 'empty site', message: 'The site has no occupant.' };
  for (const o of occupants)
    if (!(o.fraction > 0 && o.fraction <= 1))
      return {
        ok: false,
        reason: 'bad fraction',
        message: `Occupancy of ${o.el} must be above 0 and at most 1 (got ${o.fraction}).`,
        occupant: o,
      };
  const sum = occupants.reduce((s, o) => s + o.fraction, 0);
  if (Math.abs(sum - 1) > SUM_TOL)
    return { ok: false, reason: 'occupancy sum', message: `Occupancies sum to ${sum}, not 1.` };
  const rows: Extract<SiteResult, { ok: true }>['occupants'] = [];
  for (const o of occupants) {
    const q: Parameters<typeof getRadius>[0] = { el: o.el, ox: o.ox, cn: o.cn, kind };
    if (o.spin) q.spin = o.spin;
    if (o.geometry) q.geometry = o.geometry;
    const r = getRadius(q);
    if (!r.ok) return { ok: false, reason: 'radius', message: r.message, occupant: o, lookup: r };
    const row: (typeof rows)[number] = { occupant: o, radius: r.value, entry: r.entry };
    if (r.note) row.note = r.note;
    rows.push(row);
  }
  return {
    ok: true,
    radius: rows.reduce((s, r) => s + r.occupant.fraction * r.radius, 0),
    ox: occupants.reduce((s, o) => s + o.fraction * o.ox, 0),
    mixed: occupants.length > 1,
    occupants: rows,
  };
}
