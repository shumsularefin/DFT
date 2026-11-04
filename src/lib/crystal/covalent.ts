// Covalent radii for drawing atoms and bonds (M5.5). Values in Angstrom for the 30 elements of the golden file.
// @source S-021 (Cordero et al., Dalton Trans. 2008), S-052 (ASE 3.29.0 transcription)
// Other elements get GENERIC_RADIUS, and callers are told so (`tabulated` is false): the radius is then only a drawing
// size, not a chemical fact. Extend the table by adding elements to scripts/reference/gen_element_reference.py.
export const COVALENT_RADII: Readonly<Record<string, number>> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  Na: 1.66,
  Mg: 1.41,
  Al: 1.21,
  Si: 1.11,
  P: 1.07,
  S: 1.05,
  Cl: 1.02,
  K: 2.03,
  Ca: 1.76,
  Ti: 1.6,
  Mn: 1.39,
  Fe: 1.32,
  Co: 1.26,
  Ni: 1.24,
  Cu: 1.32,
  Zn: 1.22,
  Sr: 1.95,
  Zr: 1.75,
  Nb: 1.64,
  Ba: 2.15,
  La: 2.07,
  Nd: 2.01,
  Pb: 1.46,
  I: 1.39,
  Cs: 2.44,
};

/** Drawing size for an element that is not in the table, in Angstrom. Not a chemical value. */
export const GENERIC_RADIUS = 1.4;

export function covalentRadius(symbol: string): { radius: number; tabulated: boolean } {
  const r = COVALENT_RADII[symbol];
  return r === undefined ? { radius: GENERIC_RADIUS, tabulated: false } : { radius: r, tabulated: true };
}

/**
 * Bonded pairs for drawing: two atoms are joined when their distance is below (r1 + r2) times `tolerance`.
 * This is a drawing heuristic, not a bond-order or bond-valence result. Distances use the minimum image of the
 * given positions only (the caller passes a supercell if bonds across the cell boundary should show).
 */
export function bondPairs(
  positions: readonly (readonly [number, number, number])[],
  species: readonly string[],
  tolerance = 1.15,
): [number, number][] {
  const out: [number, number][] = [];
  const r = species.map((s) => covalentRadius(s).radius);
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]!;
      const b = positions[j]!;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > 0.1 && d < (r[i]! + r[j]!) * tolerance) out.push([i, j]);
    }
  return out;
}
