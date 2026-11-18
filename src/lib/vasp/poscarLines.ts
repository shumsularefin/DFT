// Which lines of a POSCAR text hold the atoms (M12.6), so a view of the structure can be tied to the file lines.
// Mirrors the layout the parser accepts: comment, scale, three lattice lines, optional species line, counts,
// optional "Selective dynamics" line, coordinate mode, then one line per atom.
const isCounts = (s: string): boolean => /^\s*\d+(\s+\d+)*\s*$/.test(s);

/** 1-based line numbers of the atom lines, in atom order. Empty when the text does not have the POSCAR layout. */
export function poscarAtomLines(text: string): number[] {
  const lines = text.replace(/\n$/, '').split(/\r?\n/);
  let i = 5;
  if (lines[i] === undefined) return [];
  if (!isCounts(lines[i]!)) i++;
  const countsLine = lines[i];
  if (countsLine === undefined || !isCounts(countsLine)) return [];
  const total = countsLine
    .trim()
    .split(/\s+/)
    .reduce((a, x) => a + Number(x), 0);
  i++;
  if (/^\s*s/i.test(lines[i] ?? '')) i++;
  if (lines[i] === undefined) return [];
  i++; // coordinate mode line
  const out: number[] = [];
  for (let a = 0; a < total && lines[i] !== undefined && lines[i]!.trim() !== ''; a++, i++) out.push(i + 1);
  return out.length === total ? out : [];
}
