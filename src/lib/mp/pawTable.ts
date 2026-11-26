// Recommended PBE PAW potential names (potpaw.64 standard set), copied from the VASP wiki page
// "Choosing pseudopotentials" by scripts/data/build_paw_table.py. Names and valence counts only, never POTCAR content.
// @source S-019 (Choosing pseudopotentials, Recommended PAW potentials; Q-010)
import paw from '../../data/paw-recommended.json';

export interface PawEntry {
  potential: string;
  valence: number;
}

export const PAW_TABLE_META = paw._meta;
export const RECOMMENDED_PAW: ReadonlyMap<string, PawEntry> = new Map(
  Object.entries(paw.elements as Record<string, PawEntry>),
);
/** Element symbols with a recommended potential, in the shape evaluateFeasibility expects. */
export const RECOMMENDED_PAW_ELEMENTS: ReadonlySet<string> = new Set(RECOMMENDED_PAW.keys());

export function recommendedPotential(element: string): PawEntry | undefined {
  return RECOMMENDED_PAW.get(element);
}
