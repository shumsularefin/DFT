// Files for a set of magnetic configurations (M13.2): per-configuration POSCAR and INCAR, a README and a zip layout.
// Pure functions, no DOM. Every number comes from the M13.1 library; nothing here invents a moment or a U value.
// @source S-041 (MAGMOM and ISPIN in the INCAR), S-014 (LDAUTYPE = 2 convention), S-058 (ordering names)
import type { Structure } from '../crystal/types';
import { writeIncar, type IncarEntry } from '../vasp/incar';
import type { VirtualFile } from '../vasp/series';
import type { Issue } from '../vasp/validate';
import { magmomFor, validateMagmom, type MagmomOptions, type MagmomResult } from './magmom';
import { netMoment, type MagneticConfiguration } from './orderings';

/** User-entered DFT+U values for one element. Nothing is defaulted: the author types them. */
export interface LdauValue {
  /** Angular momentum channel: 2 for d, 3 for f. */
  l: number;
  u: number;
  j: number;
}
export type LdauSpec = Readonly<Record<string, LdauValue>>;

export interface ExportOptions extends MagmomOptions {
  /** Starting magnitude per magnetic element (mu_B). Required for every magnetic element. */
  magnitudes: Readonly<Record<string, number>>;
  ldau?: LdauSpec | undefined;
  /** True when every ordering was built in the smallest cell of its own (README must then say so). */
  separateCells?: boolean;
}

export interface ConfigOutput {
  /** Folder name inside the zip. */
  folder: string;
  config: MagneticConfiguration;
  result: MagmomResult;
  incar: IncarEntry[];
  incarText: string;
  issues: Issue[];
  net: number;
}

const folderOf = (c: MagneticConfiguration, i: number, used: Set<string>): string => {
  const base =
    c.kind === 'custom' || c.kind === 'k'
      ? `config-${String(i + 1).padStart(2, '0')}`
      : c.kind === 'RS2'
        ? 'RS2'
        : c.kind;
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
  used.add(name);
  return name;
};

/** POSCAR species labels in file order (one per run of equal labels). */
export function poscarLabels(s: Structure): string[] {
  const lab = s.labels ?? s.species;
  const out: string[] = [];
  lab.forEach((l, i) => {
    if (i === 0 || l !== lab[i - 1]) out.push(l);
  });
  return out;
}

/** LDAU tags for the species of a structure, in POSCAR order. Species without an entry get zeros (no correction). */
export function ldauEntries(s: Structure, spec: LdauSpec): IncarEntry[] {
  const labels = poscarLabels(s);
  const base = (l: string): string => l.replace(/[0-9]+$/, '');
  const pick = (l: string): LdauValue | undefined => spec[l] ?? spec[base(l)];
  const col = (f: (v: LdauValue) => number, none: number): string =>
    labels.map((l) => String(pick(l) ? f(pick(l)!) : none)).join(' ');
  return [
    { name: 'LDAU', value: '.TRUE.', comment: 'DFT+U on' },
    { name: 'LDAUTYPE', value: '2', comment: 'Dudarev: only U-J matters' },
    { name: 'LDAUL', value: col((v) => v.l, -1), comment: 'channel per species, -1 = none' },
    { name: 'LDAUU', value: col((v) => v.u, 0), comment: 'U in eV, entered by you' },
    { name: 'LDAUJ', value: col((v) => v.j, 0), comment: 'J in eV, entered by you' },
    { name: 'LMAXMIX', value: '4', comment: 'use 6 for f electrons' },
  ];
}

/** Check a LDAU spec; returns messages (empty when fine). */
export function checkLdau(spec: LdauSpec): string[] {
  const out: string[] = [];
  for (const [el, v] of Object.entries(spec)) {
    if (![2, 3].includes(v.l)) out.push(`${el}: the channel must be 2 (d) or 3 (f).`);
    if (!Number.isFinite(v.u) || v.u < 0) out.push(`${el}: U must be a number, 0 or more.`);
    if (!Number.isFinite(v.j) || v.j < 0) out.push(`${el}: J must be a number, 0 or more.`);
  }
  return out;
}

/** POSCAR, INCAR and validator issues for every configuration. Throws MagneticError when a magnitude is missing. */
export function buildOutputs(configs: readonly MagneticConfiguration[], opts: ExportOptions): ConfigOutput[] {
  const used = new Set<string>();
  return configs.map((config, i) => {
    const result = magmomFor(config, opts);
    const extra: IncarEntry[] = [
      { name: 'LORBIT', value: '11', comment: 'site-projected moments in OUTCAR and PROCAR' },
      ...(opts.ldau && Object.keys(opts.ldau).length ? ldauEntries(result.structure, opts.ldau) : []),
    ];
    const incar = [...result.incar, ...extra];
    return {
      folder: folderOf(config, i, used),
      config,
      result,
      incar,
      incarText: writeIncar(incar),
      issues: validateMagmom(result, extra),
      net: netMoment(config, opts.magnitudes),
    };
  });
}

export const POTCAR_NOTE =
  'POTCAR files are not generated or included. Build one from your own licensed library, in the species order of POSCAR.';

function makePotcar(labels: readonly string[], folders: readonly string[]): string {
  return [
    '#!/bin/bash',
    '# Join the per-element POTCAR files of YOUR licensed library into POTCAR and copy it into every folder.',
    '# This script contains no POTCAR content. Set POTCAR_DIR to the directory that holds one folder per element.',
    `# Order must match the species line of POSCAR: ${labels.join(' ')}`,
    'POTCAR_DIR="${POTCAR_DIR:-}"',
    'if [ -z "$POTCAR_DIR" ]; then echo "Set POTCAR_DIR first" >&2; exit 1; fi',
    'cd "$(dirname "$0")" || exit 1',
    `for l in ${labels.join(' ')}; do`,
    '  if [ ! -f "$POTCAR_DIR/$l/POTCAR" ]; then echo "Missing $POTCAR_DIR/$l/POTCAR" >&2; exit 1; fi',
    'done',
    `cat ${labels.map((l) => `"$POTCAR_DIR/${l}/POTCAR"`).join(' ')} > POTCAR`,
    `for d in ${folders.join(' ')}; do cp POTCAR "$d/POTCAR"; done`,
    'echo "POTCAR written and copied."',
    '',
  ].join('\n');
}

const sameLattice = (outs: readonly ConfigOutput[]): boolean =>
  outs.every(
    (o) =>
      JSON.stringify(o.result.structure.lattice) === JSON.stringify(outs[0]!.result.structure.lattice) &&
      o.result.structure.species.join() === outs[0]!.result.structure.species.join(),
  );

/** The README text of a download. States the cell policy, the starting-moment caveats and what is missing. */
export function readme(outs: readonly ConfigOutput[], opts: ExportOptions): string {
  const common = sameLattice(outs);
  const L: string[] = [
    '# Magnetic configurations',
    '',
    'Made by the DFT Handbook magnetic configuration tool. Everything was computed in your browser.',
    '',
    '## Folders',
    '',
    ...outs.map(
      (o) =>
        `- ${o.folder}/: ${o.config.label}, ${o.result.structure.species.length} atoms, MAGMOM = ${o.result.magmom}`,
    ),
    '',
    '## Cell',
    '',
    common
      ? 'Every folder uses the same cell and the same atom order, so total energies can be compared directly. Use one k-mesh and one ENCUT for all of them.'
      : 'The cells differ between folders (smallest cell per ordering). The k-meshes then need separate convergence, because a different cell sampled with the same mesh density is not the same calculation. Do not compare energies until each folder has a converged mesh.',
    '',
    '## Read this before running',
    '',
    '- The starting moments only seed the calculation. Check the final moments in OUTCAR (grep "magnetization (x)") and in the site-projected table (LORBIT = 11).',
    '- VASP may find a different ground state than the pattern you started from, for example it can collapse to a smaller moment or to a ferromagnetic state.',
    `- Starting magnitudes you entered (mu_B): ${
      Object.entries(opts.magnitudes)
        .map(([e, m]) => `${e} = ${m}`)
        .join(', ') || 'none'
    }. They were typed in the tool; none is a recommendation.`,
    opts.ldau && Object.keys(opts.ldau).length
      ? `- DFT+U values (eV) were entered by you: ${Object.entries(opts.ldau)
          .map(([e, v]) => `${e} (L=${v.l}) U=${v.u} J=${v.j}`)
          .join('; ')}. Use the same values in every folder you compare.`
      : '- No DFT+U block was written. Add one yourself if your method needs it.',
    `- ${POTCAR_NOTE} Edit nothing but POTCAR_DIR in make_potcar.sh.`,
    '- There is no KPOINTS file: choose and converge a mesh for your cell.',
    '',
  ];
  return L.join('\n');
}

/** The zip layout: one folder per configuration, make_potcar.sh and README.md at the top. */
export function buildFiles(outs: readonly ConfigOutput[], opts: ExportOptions): VirtualFile[] {
  const files: VirtualFile[] = [{ path: 'README.md', content: readme(outs, opts) }];
  for (const o of outs) {
    files.push({ path: `${o.folder}/POSCAR`, content: o.result.poscar });
    files.push({ path: `${o.folder}/INCAR`, content: o.incarText });
  }
  if (outs.length)
    files.push({
      path: 'make_potcar.sh',
      content: makePotcar(
        poscarLabels(outs[0]!.result.structure),
        outs.map((o) => o.folder),
      ),
    });
  return files;
}

/** Plain-language explanation of why the cell has the size it has. */
export function whyThisCell(c: MagneticConfiguration, det: number, common: boolean, nCells: number): string {
  if (det === 1 && c.kind !== 'custom')
    return 'The ordering repeats with the cell you gave, so no supercell was needed.';
  if (c.kind === 'custom') return 'Custom orderings are set in the cell you gave, so nothing was enlarged.';
  const why = `The pattern alternates between neighbouring magnetic sites, so the cell has to hold at least one up and one down site: ${det} copies of your cell.`;
  return common && nCells > 1
    ? `${why} All orderings share this one cell so their energies are comparable.`
    : why;
}
