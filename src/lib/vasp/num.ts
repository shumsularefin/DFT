// Shared number scanning for VASP text outputs. Pure, no DOM.
/** Matches one Fortran-style number; a leading sign starts a new match, so glued numbers such as 1.0E+02-2.0E+01 split. */
export const NUM_SRC = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?`;
/** Parse a Fortran-style number (accepts D exponents, leading ".", trailing "."). Returns NaN when not a number. */
export const toNum = (s: string): number => Number(s.replace(/[Dd]/, 'E'));
/** All numbers in a string, in order. */
export const numbersIn = (s: string): number[] => (s.match(new RegExp(NUM_SRC, 'g')) ?? []).map(toNum);
