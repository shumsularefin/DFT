// Default line-by-line annotations for VASP input files. Pure functions, no DOM, never throws on odd input.
// @source S-019 (VASP wiki: POSCAR, KPOINTS and INCAR pages), S-041, S-042 (the author's handbooks)
import tagsFile from '../../data/vasp-tags.json';
import { ParseError } from '../crystal/errors';
import { parseIncar } from './incar';

export type FileKind = 'POSCAR' | 'KPOINTS' | 'INCAR' | 'OSZICAR' | 'OUTCAR-excerpt';

export interface Annotation {
  /** 1-based line of the file. */
  line: number;
  /** Short name of what the line is. */
  label: string;
  beginner: string;
  intermediate?: string;
  pro?: string;
  /** Why this value (INCAR tags). */
  why?: string;
  /** "What if it were different." */
  whatIf?: string;
  /** INCAR tag name, when the line sets one. */
  tag?: string;
  /** False for an INCAR tag that is not in the tag database. */
  known?: boolean;
}

interface TagRow {
  name: string;
  summary: { beginner: string; intermediate: string; pro?: string };
  why: string;
  breaks: string;
}
const TAGS = new Map((tagsFile.tags as unknown as TagRow[]).map((t) => [t.name, t]));

const isNum = (s: string | undefined) => s !== undefined && s !== '' && Number.isFinite(Number(s));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

function poscar(lines: string[]): Annotation[] {
  const out: Annotation[] = [];
  const add = (line: number, label: string, beginner: string, more: Partial<Annotation> = {}) =>
    out.push({ line, label, beginner, ...more });
  add(1, 'Comment', 'A free-text title. VASP ignores it, so use it to say what this structure is.');
  add(
    2,
    'Scaling factor',
    'A number that multiplies every lattice vector. 1.0 means the vectors below are already in angstrom.',
    {
      intermediate:
        'A negative value is read as the target cell volume in cubic angstrom instead of a scale. Three numbers scale x, y and z separately.',
      whatIf:
        'A wrong scale changes the cell size and every distance in it, so energies mean something else.',
    },
  );
  ['first', 'second', 'third'].forEach((w, i) =>
    add(
      3 + i,
      `Lattice vector ${i + 1}`,
      `The ${w} edge of the unit cell as x, y, z (times the scaling factor). Together the three vectors define the cell.`,
      {
        whatIf:
          'Swapping or changing vectors changes the cell and the meaning of every fractional coordinate.',
      },
    ),
  );
  let i = 5; // 0-based index of the next line
  let names: string[] = [];
  if (lines[i] !== undefined && words(lines[i]!).length > 0 && !isNum(words(lines[i]!)[0])) {
    names = words(lines[i]!);
    add(
      i + 1,
      'Species names',
      'The chemical symbol of each kind of atom, in the order of the counts on the next line.',
      {
        intermediate:
          'This line exists in the VASP 5 format. The order must match the order of the datasets concatenated into POTCAR.',
        whatIf:
          'If this order differs from the POTCAR order, VASP applies the wrong dataset to the wrong atoms.',
      },
    );
    i++;
  }
  const counts = lines[i] !== undefined ? words(lines[i]!).map(Number) : [];
  if (counts.length > 0 && counts.every((c) => Number.isInteger(c) && c >= 0)) {
    add(i + 1, 'Atom counts', 'How many atoms of each species there are, in the same order as the species.', {
      whatIf: 'The sum must equal the number of coordinate lines below, or VASP reads the wrong atoms.',
    });
    i++;
  } else return out;
  const total = counts.reduce((a, b) => a + b, 0);
  let selective = false;
  if (/^s/i.test((lines[i] ?? '').trim())) {
    selective = true;
    add(
      i + 1,
      'Selective dynamics',
      'Switches on per-atom freezing: each coordinate line then ends with T or F flags.',
      {
        intermediate: 'T lets the atom move along that axis during a relaxation, F holds it fixed.',
      },
    );
    i++;
  }
  const mode = (lines[i] ?? '').trim();
  if (mode !== '') {
    const cart = /^[ck]/i.test(mode);
    add(
      i + 1,
      cart ? 'Cartesian coordinates' : 'Direct coordinates',
      cart
        ? 'The atom positions below are in angstrom (times the scaling factor), not as fractions of the cell.'
        : 'The atom positions below are fractions of the three lattice vectors, from 0 to 1.',
      {
        intermediate: cart
          ? 'Starts with C or K. Positions are x, y, z in the same units as the lattice vectors.'
          : 'Starts with anything else (usually D). Fractional coordinates keep their meaning if the cell is scaled.',
      },
    );
    i++;
  }
  const labels: string[] = [];
  counts.forEach((c, k) => {
    for (let j = 0; j < c; j++) labels.push(names[k] ?? `species ${k + 1}`);
  });
  for (let a = 0; a < total && lines[i] !== undefined && lines[i]!.trim() !== ''; a++, i++) {
    add(
      i + 1,
      `Atom ${a + 1} (${labels[a]})`,
      `The position of atom ${a + 1}, a ${labels[a]} atom, in the mode set above.`,
      {
        ...(selective
          ? { intermediate: 'Three more entries at the end of the line are the T or F flags for x, y and z.' }
          : {}),
        whatIf: 'The order of atoms is the order used by MAGMOM and LDAU values in the INCAR.',
      },
    );
  }
  return out;
}

function kpoints(lines: string[]): Annotation[] {
  const out: Annotation[] = [];
  const add = (line: number, label: string, beginner: string, more: Partial<Annotation> = {}) =>
    out.push({ line, label, beginner, ...more });
  add(1, 'Comment', 'A free-text title. VASP ignores it.');
  const count = Number(words(lines[1] ?? '')[0]);
  if (!Number.isInteger(count)) return out;
  add(
    2,
    'Number of k-points',
    count === 0
      ? '0 means VASP builds the k-points itself from the mesh or length given below.'
      : 'A list of k-points follows (or, in line mode, the number of points along each segment).',
    { whatIf: 'A wrong count makes VASP read too few or too many lines.' },
  );
  const mode = (lines[2] ?? '').trim();
  if (mode === '') return out;
  const c = mode[0]!.toLowerCase();
  if (count === 0) {
    if (c === 'g' || c === 'm') {
      add(
        3,
        c === 'g' ? 'Gamma-centred mesh' : 'Monkhorst-Pack mesh',
        c === 'g'
          ? 'The mesh always includes the Gamma point (the centre of reciprocal space).'
          : 'A Monkhorst-Pack mesh. For an even mesh it does not include Gamma.',
        {
          intermediate:
            'The first letter decides: G or g for Gamma-centred, M or m for Monkhorst-Pack. For hexagonal cells use Gamma-centred.',
          whatIf: 'An even Monkhorst-Pack mesh on a hexagonal cell breaks the symmetry of the mesh.',
        },
      );
      add(4, 'Mesh divisions', 'How many k-points along each reciprocal lattice vector: N1 N2 N3.', {
        whatIf:
          'A coarser mesh is cheaper but less accurate. Test that the energy stops changing as it gets denser.',
      });
      if ((lines[4] ?? '').trim() !== '')
        add(5, 'Mesh shift', 'An optional shift of the whole mesh. 0 0 0 means no shift.', {
          whatIf: 'A non-zero shift moves the mesh off the high-symmetry points.',
        });
    } else if (c === 'a') {
      add(3, 'Automatic mode', 'VASP chooses the mesh from a single length given on the next line.');
      add(4, 'Length', 'A length parameter; a larger value gives a denser mesh.');
    }
    return out;
  }
  if (c === 'l') {
    add(
      3,
      'Line mode',
      'The k-points follow straight lines between pairs of end points, used for band structures.',
      {
        intermediate: 'The count on line 2 is how many points are placed on each segment.',
      },
    );
    add(4, 'Coordinate mode', 'Whether the end points are in reciprocal (r) or Cartesian (c) coordinates.');
    let seg = 0;
    for (let i = 4; i < lines.length; i++) {
      if ((lines[i] ?? '').trim() === '') continue;
      add(
        i + 1,
        `Segment end point ${seg + 1}`,
        'One end of a segment. End points come in pairs: start, then end.',
        {
          intermediate:
            'Text after ! on the line is a label for the point, for example a high-symmetry name.',
        },
      );
      seg++;
    }
    return out;
  }
  add(
    3,
    'Coordinate mode',
    'Whether the k-points below are in Cartesian (C or K) or reciprocal coordinates (anything else).',
  );
  for (let i = 0; i < count && (lines[3 + i] ?? '').trim() !== ''; i++)
    add(
      4 + i,
      `k-point ${i + 1}`,
      'Three coordinates and a weight. Weights say how much each point counts in the sum.',
      {
        whatIf: 'The weights must add up to a consistent total, or the averages are wrong.',
      },
    );
  return out;
}

function incar(text: string): Annotation[] {
  let entries;
  try {
    entries = parseIncar(text).entries;
  } catch (e) {
    if (e instanceof ParseError && e.line !== undefined)
      return [
        {
          line: e.line,
          label: 'Not a valid INCAR line',
          beginner: `VASP expects TAG = value on each line. This line cannot be read: ${e.message}.`,
          known: false,
        },
      ];
    return [];
  }
  return entries.map((e) => {
    const t = TAGS.get(e.name);
    const line = e.line ?? 1;
    if (!t)
      return {
        line,
        label: `${e.name} (not in the database)`,
        beginner:
          'This tag is not in the handbook tag database. It may still be valid in VASP, so check the VASP wiki, or it may be a typo.',
        tag: e.name,
        known: false,
      };
    return {
      line,
      label: e.name,
      beginner: t.summary.beginner,
      intermediate: t.summary.intermediate,
      ...(t.summary.pro ? { pro: t.summary.pro } : {}),
      why: t.why,
      whatIf: t.breaks,
      tag: e.name,
      known: true,
    };
  });
}

/**
 * Default annotations for a file. OSZICAR and OUTCAR excerpts have no defaults yet (their parsers arrive with M4.1),
 * so they return an empty list and rely on annotations supplied by the caller.
 */
export function annotate(kind: FileKind, text: string): Annotation[] {
  const lines = text.split(/\r?\n/);
  if (kind === 'POSCAR') return poscar(lines);
  if (kind === 'KPOINTS') return kpoints(lines);
  if (kind === 'INCAR') return incar(text);
  return [];
}

/** Caller annotations replace default ones on the same line; the rest are kept. Sorted by line. */
export function mergeAnnotations(
  defaults: readonly Annotation[],
  custom: readonly Annotation[] = [],
): Annotation[] {
  const lines = new Set(custom.map((a) => a.line));
  return [...defaults.filter((a) => !lines.has(a.line)), ...custom].sort((a, b) => a.line - b.line);
}

export interface PotcarField {
  name: string;
  meaning: string;
}

/**
 * Generic description of the header fields of a POTCAR dataset. Structure only: no values and no dataset text
 * (the VASP licence forbids hosting POTCAR content).
 */
export const POTCAR_FIELDS: readonly PotcarField[] = [
  {
    name: 'TITEL',
    meaning:
      'Names the dataset (which element and which variant). `grep TITEL POTCAR` lists the datasets in order.',
  },
  { name: 'POMASS', meaning: 'The atomic mass VASP uses for this species.' },
  {
    name: 'ZVAL',
    meaning: 'The number of valence electrons this dataset treats explicitly. Needed for Bader net charges.',
  },
  {
    name: 'RWIGS',
    meaning: 'The sphere radius used to project charge and moments onto atoms. Site moments depend on it.',
  },
  {
    name: 'ENMAX',
    meaning:
      'The recommended plane-wave cutoff for this dataset. ENCUT should not be below the largest ENMAX in your POTCAR.',
  },
  {
    name: 'ENMIN',
    meaning:
      'Listed next to ENMAX in the header. The handbooks do not describe it, so it is not explained here yet (Q-030).',
  },
  {
    name: 'LEXCH',
    meaning:
      'The exchange-correlation functional the dataset was made for: PE is PBE, CA is LDA. Keep the family consistent across species.',
  },
];
