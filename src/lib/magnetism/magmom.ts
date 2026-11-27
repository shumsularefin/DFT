// MAGMOM for a collinear configuration, in POSCAR order after species grouping (M13.1, D-056, D-059).
// @source S-065 (VASP wiki MAGMOM, read 2026-11-18: one value per ion for ISPIN = 2; MAGMOM lowers the symmetry)
// @source S-041, S-042 (the author's handbooks: POSCAR order, repeat syntax "2*4.0 2*-4.0", start above the
//   expected moment)
import { writePoscar } from '../crystal/poscar';
import type { Structure } from '../crystal/types';
import { parseIncar, writeIncar, type IncarEntry } from '../vasp/incar';
import { validate, ALL_RULES, type Issue } from '../vasp/validate';
import type { MagneticConfiguration } from './orderings';
import { MagneticError } from './sublattice';

/**
 * What the sources say about starting magnitudes: the handbook gives a range for 3d ions and the VASP wiki a rule
 * relative to the experimental moment. The only per-element table is the Materials Project one in
 * `../vasp/mpDefaults.ts`, offered as a labelled fill the user can change (D-111), never applied silently.
 */
export const STARTING_MOMENT_GUIDANCE = [
  { text: 'Start above the expected moment (3 to 5 for 3d ions).', source: 'S-042' },
  {
    text: 'Set the starting moments slightly larger than expected, for example the experimental moment times 1.2 to 1.5. The final state depends strongly on the starting values.',
    source: 'S-065',
  },
] as const;

/** One MAGMOM number: at least one decimal ("4.0", "-4.0", "0.0", "0.25"), never "-0". */
export function formatMoment(x: number): string {
  if (!Number.isFinite(x)) throw new MagneticError('bad-input', 'A magnetic moment must be a finite number.');
  const v = Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(8));
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/** Compress runs of equal values with VASP's repeat syntax: [4, 4, -4, -4] gives "2*4.0 2*-4.0". */
export function compressMagmom(values: readonly number[]): string {
  const toks: string[] = [];
  let i = 0;
  while (i < values.length) {
    const t = formatMoment(values[i]!);
    let n = 1;
    while (i + n < values.length && formatMoment(values[i + n]!) === t) n++;
    toks.push(n > 1 ? `${n}*${t}` : t);
    i += n;
  }
  return toks.join(' ');
}

export interface MagmomOptions {
  /** Starting magnitude per magnetic element (entered by the user; no defaults are invented). */
  magnitudes?: Readonly<Record<string, number>>;
  /** Value written for non-magnetic sites (default 0). */
  nonMagnetic?: number;
  /** Write up and down sites of an element as separate POSCAR species (Mn1, Mn2). Off by default. */
  splitSpecies?: boolean;
  /** Write MAGMOM uncompressed (one value per atom). */
  expanded?: boolean;
}

export interface MagmomResult {
  /** POSCAR text of the configuration's cell, sites grouped by species (the M3.1 writer). */
  poscar: string;
  /** The structure in POSCAR order (what VASP will read). */
  structure: Structure;
  /** permutation[poscarIndex] = index in the configuration's structure. */
  permutation: number[];
  /** Moments in POSCAR order. */
  values: number[];
  /** The MAGMOM value text. */
  magmom: string;
  /** ISPIN = 2 and MAGMOM, ready to merge into an INCAR. */
  incar: IncarEntry[];
  notes: string[];
}

/**
 * MAGMOM and POSCAR for a configuration. Every magnetic site needs a magnitude, from the configuration's own
 * per-site magnitudes or from `magnitudes` by element; a missing one is an error, never a guess.
 */
export function magmomFor(c: MagneticConfiguration, opts: MagmomOptions = {}): MagmomResult {
  const s = c.structure;
  const nonMag = opts.nonMagnetic ?? 0;
  const moment = (j: number): number => {
    const sign = c.signs[j]!;
    if (sign === 0) return c.magneticSites.includes(j) ? 0 : nonMag;
    const m = c.magnitudes?.[j] ?? opts.magnitudes?.[s.species[j]!];
    if (m === undefined || !Number.isFinite(m) || m <= 0)
      throw new MagneticError(
        'bad-input',
        `Enter a positive starting magnitude for ${s.species[j]} (in Bohr magnetons).`,
      );
    return sign * m;
  };
  const moments = s.species.map((_, j) => moment(j));
  const notes: string[] = [
    'The starting moments only seed the calculation; check the final moments in OUTCAR (LORBIT = 11 writes them per site).',
  ];
  let out: Structure = s;
  let pre = s.species.map((_, j) => j);
  if (opts.splitSpecies) {
    const raw = s.species.map((sym, j) =>
      c.signs[j] === 1 && c.magneticSites.includes(j) ? `${sym}1` : c.signs[j] === -1 ? `${sym}2` : sym,
    );
    // keep the split labels of one element next to each other: element order of first appearance, then label order
    const elOrder = [...new Set(s.species)];
    const labOrder = [...new Set(raw)];
    pre = [...pre].sort(
      (x, y) =>
        elOrder.indexOf(s.species[x]!) - elOrder.indexOf(s.species[y]!) ||
        labOrder.indexOf(raw[x]!) - labOrder.indexOf(raw[y]!) ||
        x - y,
    );
    const pick = <T>(arr: readonly T[]) => pre.map((j) => arr[j]!);
    const labels = pick(raw);
    out = {
      ...s,
      species: pick(s.species),
      frac: pick(s.frac),
      labels,
      ...(s.selective ? { selective: pick(s.selective) } : {}),
    };
    const split = [...new Set(labels.filter((l, j) => l !== s.species[j]))];
    notes.push(
      `Split species (${split.join(', ')}): the POTCAR must then hold one potential per POSCAR species, in the same order, so the same element's POTCAR appears twice. VASP does not need this for a collinear pattern, because MAGMOM itself lowers the symmetry.`,
    );
  }
  const w = writePoscar(out, { comment: `${s.comment ?? 'POSCAR'} ${c.label}`.trim() });
  if (w.reordered) notes.push('Sites were regrouped by species for POSCAR; MAGMOM follows the new order.');
  const permutation = w.permutation.map((j) => pre[j]!);
  const values = permutation.map((j) => moments[j]!);
  const magmom = opts.expanded ? values.map(formatMoment).join(' ') : compressMagmom(values);
  const structure: Structure = {
    lattice: out.lattice,
    species: w.permutation.map((j) => out.species[j]!),
    frac: w.permutation.map((j) => out.frac[j]!),
    ...(out.labels ? { labels: w.permutation.map((j) => out.labels![j]!) } : {}),
    ...(out.comment !== undefined ? { comment: out.comment } : {}),
  };
  return {
    poscar: w.text,
    structure,
    permutation,
    values,
    magmom,
    incar: [
      { name: 'ISPIN', value: '2', comment: 'spin polarized' },
      { name: 'MAGMOM', value: magmom, comment: 'POSCAR order' },
    ],
    notes,
  };
}

/**
 * The validator hook: run rules V001 (MAGMOM count) and V002 (ISPIN) of the M3.4 engine on the generated INCAR
 * entries, after a round trip through the INCAR writer and parser.
 */
export function validateMagmom(r: MagmomResult, extra: readonly IncarEntry[] = []): Issue[] {
  const text = writeIncar([...extra, ...r.incar]);
  const { entries } = parseIncar(text);
  const rules = ALL_RULES.filter((x) => x.id === 'V001' || x.id === 'V002');
  return validate({ incar: entries, structure: r.structure }, rules);
}
