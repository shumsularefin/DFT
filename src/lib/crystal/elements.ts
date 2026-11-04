// Element symbols by atomic number (1 to 103). Standard periodic-table order.
export const SYMBOLS: readonly string[] = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo ' +
  'Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl ' +
  'Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr'
).split(' ');

const Z = new Map(SYMBOLS.map((s, i) => [s, i + 1]));

/** Atomic number of an element symbol ("Cu" gives 29), or undefined when unknown. */
export const atomicNumber = (symbol: string): number | undefined => Z.get(symbol);

/** Element symbol of an atomic number, or undefined outside 1 to 103. */
export const symbolOf = (z: number): string | undefined => SYMBOLS[z - 1];

/** Element symbol from a label such as "Ti_pv", "Fe1" or "O2-": the leading letters, normalised to "Ti", "Fe", "O". */
export function elementFromLabel(label: string): string | undefined {
  const m = /^([A-Za-z]{1,2})/.exec(label.trim());
  if (!m) return undefined;
  const two = m[1]![0]!.toUpperCase() + (m[1]![1] ?? '').toLowerCase();
  if (two.length === 2 && Z.has(two)) return two;
  const one = two[0]!;
  return Z.has(one) ? one : undefined;
}
