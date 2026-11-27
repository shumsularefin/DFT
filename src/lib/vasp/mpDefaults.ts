// Materials Project defaults for GGA (PBE)+U and starting moments, offered as labelled suggestions (D-111, Q-072).
// @source S-080 (the U values come from fitting binary oxide formation enthalpies: Wang et al. 2006 method, Jain
//   et al. 2011; read 2026-11-27)
// @source S-085 (Materials Project documentation, "Hubbard U values": oxides, fluorides use the oxide values)
// @source S-034 (the numbers: pymatgen-core 2026.10.31 io/vasp/MPRelaxSet.yaml LDAUTYPE 2, LDAUL 2, LDAUJ 0,
//   LDAUU; io/vasp/VASPIncarBase.yaml MAGMOM; io/vasp/sets.py: an element with no entry starts at 0.6.
//   Golden file tests/reference/mp_defaults_reference.json)
// @source S-014 (Dudarev scheme: only U - J enters, so J = 0 and U is the effective U)

/** Ueff (eV) per metal, Dudarev scheme, d channel. Applied by the Materials Project only with O or F present. */
export const MP_U: Readonly<Record<string, number>> = {
  Co: 3.32,
  Cr: 3.7,
  Fe: 5.3,
  Mn: 3.9,
  Mo: 4.38,
  Ni: 6.2,
  V: 3.25,
  W: 6.2,
};
/** The anions that switch the U table on: the most electronegative element must be one of these. */
export const MP_U_ANIONS = ['O', 'F'] as const;

/** Starting MAGMOM per element (no oxidation state known), from the Materials Project input set. */
export const MP_MAGMOM: Readonly<Record<string, number>> = {
  Ce: 5,
  Co: 0.6,
  Cr: 5,
  Eu: 10,
  Fe: 5,
  Mn: 5,
  Mo: 5,
  Ni: 5,
  V: 5,
  W: 5,
};
/** What the Materials Project input set starts every other element at. */
export const MP_MAGMOM_DEFAULT = 0.6;

export interface MpLdau {
  /** True when O or F is present, so the Materials Project would switch +U on. */
  applies: boolean;
  /** Species (POSCAR order) that get a non-zero U. */
  withU: string[];
  /** One row per species: LDAUL 2 and the U for table metals, -1 and 0 for the rest, J = 0. */
  rows: Record<string, { l: string; u: string; j: string }>;
}

/** The Materials Project +U rows for these species. Without O or F the table does not apply and no row has U. */
export function mpLdau(species: readonly string[]): MpLdau {
  const applies = species.some((s) => (MP_U_ANIONS as readonly string[]).includes(s));
  const rows: MpLdau['rows'] = {};
  const withU: string[] = [];
  for (const sp of species) {
    const u = applies ? MP_U[sp] : undefined;
    if (u !== undefined) withU.push(sp);
    rows[sp] = u !== undefined ? { l: '2', u: String(u), j: '0' } : { l: '-1', u: '0', j: '0' };
  }
  return { applies, withU, rows };
}

/** Starting moment per species from the Materials Project table, 0.6 for elements it does not list. */
export function mpMagmom(species: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sp of species) out[sp] = MP_MAGMOM[sp] ?? MP_MAGMOM_DEFAULT;
  return out;
}

/** What the user must know before using the values; shown next to the buttons. */
export const MP_U_NOTES = [
  {
    text: 'These are the Materials Project values for GGA (PBE)+U in oxides and fluorides, fitted so that GGA+U formation energies match experiment. They are database-compatibility values, not the physical U of your compound.',
    source: 'S-080',
  },
  {
    text: 'Other published fits differ, for Fe by more than 1 eV (Jain et al. 2011 give 4.0, the database now uses 5.3). Use one U for every calculation you compare, and say which one in your paper.',
    source: 'S-080',
  },
  {
    text: 'Without O or F the Materials Project uses no +U, and its r2SCAN calculations use none at all.',
    source: 'S-085',
  },
] as const;

export const MP_MAGMOM_NOTES = [
  {
    text: 'These are the starting moments of the Materials Project input set (Fe, Mn, Ni, Cr, V 5, Co 0.6 low spin, every unlisted element 0.6). They only seed the calculation: check the final moments in OUTCAR.',
    source: 'S-034',
  },
] as const;
