// Convergence series generator (pure, no DOM): ENCUT and k-mesh test folders, helper scripts and a zip.
// The folder layout and the run/collect pipelines follow the author's workflow (VASP Workflow Handbook, step 0).
// POTCAR content is never produced: make_potcar.sh only concatenates files from a directory the user sets.
// @source S-042
import { zip as zipAsync, zipSync, strToU8, type Zippable } from 'fflate';
import { writePoscar } from '../crystal/poscar';
import type { Mat3, Structure } from '../crystal/types';
import { potcarLabels } from './builder';
import { writeIncar, type IncarEntry } from './incar';
import { POTCAR_NOTE, jobScript, submitCommand, totalCores, type JobOptions } from './jobscript';
import {
  kpointCount,
  meshFromResolution,
  writeMeshKpoints,
  type Mesh,
  type MeshKind,
  type RoundingRule,
} from './kpoints';

export const MAX_RUNS = 40;
export const ROOT = '00_conv';
export const DEFAULT_RESOLUTIONS: readonly number[] = [0.06, 0.05, 0.04, 0.03, 0.025, 0.02];
/** Above this many atoms x k-points summed over all runs the panel warns (Heuristic, not a timing prediction). */
export const COST_WARN_ATOM_KPOINTS = 100000;

export interface VirtualFile {
  path: string;
  content: string;
}

// ---- series values -------------------------------------------------------------------------------------------

export interface EncutOptions {
  start?: number;
  end?: number;
  step?: number;
}

/**
 * ENCUT values in eV. Default: from floor(ENMAX/50)*50 to ceil(1.75 ENMAX/50)*50 in steps of 50. When ENMAX is not itself a
 * multiple of 50 the value nearest to 1.3 x ENMAX (rounded to 10 eV), the protocol's production cutoff, is added if missing,
 * so the series always brackets it. Interpretation recorded in Q-032.
 */
export function encutSeries(enmax: number, opts: EncutOptions = {}): number[] {
  if (!(enmax > 0) || !Number.isFinite(enmax)) throw new RangeError('ENMAX must be positive');
  const step = opts.step ?? 50;
  if (!(step > 0) || !Number.isFinite(step)) throw new RangeError('step must be positive');
  const start = opts.start ?? Math.floor(enmax / 50) * 50;
  const end = opts.end ?? Math.ceil((1.75 * enmax) / 50) * 50;
  if (end < start) throw new RangeError('end must not be below start');
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) {
    out.push(Math.round(v * 100) / 100);
    if (out.length > 1000) throw new RangeError('series too long');
  }
  const target = Math.round((1.3 * enmax) / 10) * 10;
  if (enmax % 50 !== 0 && target >= start && target <= end && !out.includes(target)) {
    out.push(target);
    out.sort((a, b) => a - b);
  }
  return out;
}

export interface KRun {
  /** Folder suffix, for example "0.05" or "6x6x6". */
  label: string;
  mesh: Mesh;
  /** VASPKIT resolution in 2 pi / Angstrom when the run came from one. */
  resolution?: number;
}

export interface KmeshOptions {
  lattice?: Mat3;
  resolutions?: readonly number[];
  meshes?: readonly Mesh[];
  rule?: RoundingRule;
}

/** k-mesh runs from explicit meshes, or from resolutions (default six VASPKIT values) converted for `lattice`. */
export function kmeshSeries(opts: KmeshOptions = {}): KRun[] {
  if (opts.meshes && opts.meshes.length > 0)
    return opts.meshes.map((m) => {
      if (!m.every((n) => Number.isInteger(n) && n >= 1))
        throw new RangeError('mesh divisions must be integers >= 1');
      return { label: m.join('x'), mesh: m };
    });
  const res = opts.resolutions ?? DEFAULT_RESOLUTIONS;
  if (!opts.lattice) throw new RangeError('a lattice is needed to convert resolutions to meshes');
  return res.map((r) => ({
    label: String(r),
    resolution: r,
    mesh: meshFromResolution(opts.lattice!, r, opts.rule).mesh,
  }));
}

/** Mesh text such as "6 6 6" or "6x6x6" to a Mesh, or null. */
export function parseMesh(text: string): Mesh | null {
  const m = /^\s*(\d+)\s*[x*,\s]\s*(\d+)\s*[x*,\s]\s*(\d+)\s*$/i.exec(text);
  if (!m) return null;
  const v = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  return v.every((n) => n >= 1 && n <= 999) ? v : null;
}

// ---- scripts -------------------------------------------------------------------------------------------------

const folderName = (kind: 'encut' | 'kpt', label: string) =>
  `${kind}_${label.replace(/[^A-Za-z0-9._-]/g, '_')}`;

const header = (what: string) => `#!/bin/bash\n# ${what}\n`;

export function runAllScript(folders: readonly string[], job: JobOptions, root: string = ROOT): string {
  return [
    header('Run every test folder one after another on this machine or inside one job.'),
    '# Build POTCAR first: bash make_potcar.sh (see README.txt).',
    `NP=\${NP:-${totalCores(job)}}`,
    'cd "$(dirname "$0")" || exit 1',
    `for d in ${folders.map((f) => `${root}/${f}`).join(' ')}; do`,
    '  if [ ! -f "$d/POTCAR" ]; then echo "No POTCAR in $d. Run make_potcar.sh first." >&2; exit 1; fi',
    `  (cd "$d" && mpirun -np "$NP" ${job.executable} > vasp.out) || echo "Run failed in $d" >&2`,
    'done',
    'bash collect.sh > results.csv',
    'echo "Wrote results.csv"',
    '',
  ].join('\n');
}

export function collectScript(folders: readonly string[]): string {
  return [
    header('Print label,E_sigma0,pressure_kB,nions for every finished folder (CSV on standard output).'),
    '# E_sigma0 is "energy(sigma->0)", the last field of the line "energy  without entropy" (two spaces).',
    'cd "$(dirname "$0")" || exit 1',
    'echo "label,E_sigma0,pressure_kB,nions"',
    `for d in ${folders.join(' ')}; do`,
    `  o="${ROOT}/$d/OUTCAR"`,
    '  [ -f "$o" ] || continue',
    '  E=$(grep "energy  without entropy" "$o" | tail -1 | awk \'{print $NF}\')',
    '  P=$(grep "external pressure" "$o" | tail -1 | awk \'{print $4}\')',
    '  N=$(grep "NIONS" "$o" | head -1 | awk \'{print $NF}\')',
    '  echo "$d,$E,$P,$N"',
    'done',
    '',
  ].join('\n');
}

export function makePotcarScript(
  labels: readonly string[],
  folders: readonly string[],
  root: string = ROOT,
): string {
  return [
    header(
      'Join the per-element POTCAR files of YOUR licensed library into POTCAR and copy it into every folder.',
    ),
    '# This script contains no POTCAR content. Set POTCAR_DIR to the directory that holds one folder per element.',
    `# Order must match the species line of POSCAR: ${labels.join(' ')}`,
    'POTCAR_DIR="${POTCAR_DIR:-}"',
    'if [ -z "$POTCAR_DIR" ]; then echo "Set POTCAR_DIR first, for example: POTCAR_DIR=/path/to/potpaw_PBE bash make_potcar.sh" >&2; exit 1; fi',
    'cd "$(dirname "$0")" || exit 1',
    `for l in ${labels.join(' ')}; do`,
    '  if [ ! -f "$POTCAR_DIR/$l/POTCAR" ]; then echo "Missing $POTCAR_DIR/$l/POTCAR" >&2; exit 1; fi',
    'done',
    `cat ${labels.map((l) => `"$POTCAR_DIR/${l}/POTCAR"`).join(' ')} > POTCAR`,
    `for d in ${folders.map((f) => `${root}/${f}`).join(' ')}; do cp POTCAR "$d/POTCAR"; done`,
    'grep -E "ENMAX|ZVAL" POTCAR | head -n 4',
    'echo "POTCAR written and copied. Check ENMAX against the value you typed in the builder."',
    '',
  ].join('\n');
}

// ---- cost ----------------------------------------------------------------------------------------------------

export interface CostEstimate {
  /** Sum over runs of atoms x k-points (full mesh, no symmetry reduction). A size indicator, not a time. */
  atomKpoints: number;
  runs: number;
  warn: boolean;
}

export const estimateCost = (nAtoms: number, runs: readonly { mesh: Mesh }[]): CostEstimate => {
  const atomKpoints = runs.reduce((s, r) => s + nAtoms * kpointCount(r.mesh), 0);
  return { atomKpoints, runs: runs.length, warn: atomKpoints > COST_WARN_ATOM_KPOINTS };
};

// ---- project -------------------------------------------------------------------------------------------------

export interface ProjectInput {
  structure: Structure;
  /** Convergence preset entries. ENCUT is replaced per folder; KSPACING is dropped because KPOINTS is written. */
  entries: readonly IncarEntry[];
  job: JobOptions;
  /** ENCUT series values (empty for none). */
  encuts: readonly number[];
  /** Mesh used by every ENCUT run. */
  encutMesh: Mesh;
  /** k-mesh series (empty for none). */
  kruns: readonly KRun[];
  /** ENCUT used by every k-mesh run. */
  fixedEncut: number;
  centering?: MeshKind;
}

export interface Project {
  files: VirtualFile[];
  folders: string[];
  warnings: string[];
  cost: CostEstimate;
}

const withEncut = (entries: readonly IncarEntry[], encut: number): IncarEntry[] => {
  const rest = entries.filter((e) => e.name !== 'ENCUT' && e.name !== 'KSPACING');
  const e = entries.find((x) => x.name === 'ENCUT');
  const entry: IncarEntry = {
    ...(e ?? { name: 'ENCUT', value: '', line: 0 }),
    name: 'ENCUT',
    value: String(encut),
  };
  // keep ENCUT at its original position
  const idx = entries.filter((x) => x.name !== 'KSPACING').findIndex((x) => x.name === 'ENCUT');
  if (idx < 0) return [...rest, entry];
  const out = [...rest];
  out.splice(idx, 0, entry);
  return out;
};

/** Build the virtual file tree. Throws RangeError for an empty or longer-than-40 series. */
export function buildProject(p: ProjectInput): Project {
  const runs = p.encuts.length + p.kruns.length;
  if (runs === 0) throw new RangeError('Choose at least one run.');
  if (runs > MAX_RUNS)
    throw new RangeError(
      `A series of ${runs} runs is too long. The limit is ${MAX_RUNS}; shorten the series.`,
    );
  const poscar = writePoscar(p.structure);
  const kind: MeshKind = p.centering ?? 'gamma';
  const files: VirtualFile[] = [];
  const folders: string[] = [];
  const warnings: string[] = [];
  const add = (folder: string, entries: readonly IncarEntry[], mesh: Mesh, comment: string) => {
    folders.push(folder);
    const base = `${ROOT}/${folder}`;
    files.push(
      { path: `${base}/POSCAR`, content: poscar.text },
      { path: `${base}/INCAR`, content: writeIncar(entries) },
      { path: `${base}/KPOINTS`, content: writeMeshKpoints(mesh, kind, [0, 0, 0], comment) },
      { path: `${base}/job.sh`, content: jobScript({ ...p.job, jobName: folder }) },
    );
  };
  for (const e of p.encuts)
    add(folderName('encut', String(e)), withEncut(p.entries, e), p.encutMesh, `ENCUT ${e} eV, fixed mesh`);
  for (const k of p.kruns)
    add(
      folderName('kpt', k.label),
      withEncut(p.entries, p.fixedEncut),
      k.mesh,
      k.resolution ? `resolution ${k.resolution}` : `mesh ${k.label}`,
    );
  if (new Set(folders).size !== folders.length)
    throw new RangeError('Two runs would use the same folder name.');
  const labels = potcarLabels(p.structure);
  const cost = estimateCost(p.structure.species.length, [
    ...p.encuts.map(() => ({ mesh: p.encutMesh })),
    ...p.kruns,
  ]);
  if (cost.warn)
    warnings.push(
      `Heuristic size check: ${cost.atomKpoints.toLocaleString('en-US')} atom x k-point units over ${runs} runs. Consider fewer runs or a smaller cell.`,
    );
  files.push(
    { path: 'run_all.sh', content: runAllScript(folders, p.job) },
    { path: 'collect.sh', content: collectScript(folders) },
    { path: 'make_potcar.sh', content: makePotcarScript(labels, folders) },
    { path: 'README.txt', content: projectReadme(p, folders, labels) },
  );
  return { files, folders, warnings, cost };
}

export function projectReadme(
  p: ProjectInput,
  folders: readonly string[],
  labels: readonly string[],
): string {
  const n = p.structure.species.length;
  return [
    'Convergence test series',
    'Generated by the DFT Handbook convergence series generator. Check every file before you run it.',
    '',
    `Atoms: ${n}. ${folders.length} runs: ${p.encuts.length} ENCUT (fixed mesh ${p.encutMesh.join('x')}), ${p.kruns.length} k-mesh (fixed ENCUT ${p.fixedEncut} eV).`,
    '',
    'Layout',
    `  ${ROOT}/<run>/   POSCAR INCAR KPOINTS job.sh (one folder per run)`,
    '  make_potcar.sh   builds POTCAR from your licensed library and copies it into every folder',
    '  run_all.sh       runs every folder one after another (mpirun), then writes results.csv',
    '  collect.sh       prints label,E_sigma0,pressure_kB,nions as CSV',
    '',
    'POTCAR (you must build it yourself)',
    `  ${POTCAR_NOTE}`,
    `  Species order in POSCAR: ${labels.join(' ')}`,
    '  POTCAR_DIR=/path/to/your/library bash make_potcar.sh',
    '',
    'Run',
    '  Locally or inside one job:  bash run_all.sh',
    `  On a cluster, one job per folder:  for d in ${ROOT}/*/; do (cd "$d" && ${submitCommand(p.job.scheduler, 'job.sh')}); done`,
    '  Then collect:  bash collect.sh > results.csv',
    '',
    'Plot',
    '  Drop results.csv (or the OUTCAR files) into the convergence plotter on the site. Nothing is uploaded.',
    '  Pick the smallest setting where the energy per atom changes by less than 1 meV from the next larger one.',
    '',
  ].join('\n');
}

// ---- equation of state (M13.6) ----------------------------------------------------------------------------
// @source S-042 (E-V scan: 7 to 11 fixed-volume points, ISIF = 4 or 2 for cubic, IBRION = 2, NSW = 100,
// EDIFF = 1E-6, EDIFFG = -0.005, the same ENCUT and k-mesh everywhere), S-041 (ISIF = 4 / 2 for E-V, ISTART = 2)

export const EOS_ROOT = '01_eos';
/** 0.94 to 1.06 of V0 in 7 equal steps: a convention inside the handbook's 7 to 11 points over +-5 to 10 % (D-071). */
export const DEFAULT_VOLUME_FRACTIONS: readonly number[] = [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06];

const det3 = (m: Mat3): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Cell volume in cubic angstrom. */
export const cellVolume = (lattice: Mat3): number => Math.abs(det3(lattice));

export interface VolumeRun {
  /** V / V_start. */
  fraction: number;
  folder: string;
  structure: Structure;
  /** Cubic angstrom. */
  volume: number;
}

/** Scale the cell isotropically: every lattice vector by f^(1/3), fractional coordinates unchanged. */
export function volumeSeries(
  structure: Structure,
  { fractions = DEFAULT_VOLUME_FRACTIONS }: { fractions?: readonly number[] } = {},
): VolumeRun[] {
  if (fractions.length === 0) throw new RangeError('Choose at least one volume.');
  if (fractions.length > MAX_RUNS)
    throw new RangeError(`A series of ${fractions.length} runs is too long. The limit is ${MAX_RUNS}.`);
  const v0 = cellVolume(structure.lattice);
  const runs = [...fractions]
    .sort((a, b) => a - b)
    .map((f) => {
      if (!Number.isFinite(f) || f <= 0)
        throw new RangeError(`Volume fraction ${f} must be a positive number.`);
      const s = Math.cbrt(f);
      const lattice = structure.lattice.map((r) => r.map((x) => x * s)) as unknown as Mat3;
      return {
        fraction: f,
        folder: `vol_${f.toFixed(3)}`,
        structure: { ...structure, lattice },
        volume: v0 * f,
      };
    });
  if (new Set(runs.map((r) => r.folder)).size !== runs.length)
    throw new RangeError('Two volumes round to the same folder name (3 decimals); space them further apart.');
  return runs;
}

/** Equal lengths and equal angles of 90, 60 or 109.47 degrees: simple, fcc or bcc primitive cubic. Heuristic. */
export function looksCubic(lattice: Mat3, tol = 1e-4): boolean {
  const len = lattice.map((r) => Math.hypot(...r));
  const cos = (i: number, j: number) =>
    (lattice[i]![0] * lattice[j]![0] + lattice[i]![1] * lattice[j]![1] + lattice[i]![2] * lattice[j]![2]) /
    (len[i]! * len[j]!);
  const c = [cos(0, 1), cos(0, 2), cos(1, 2)];
  if (Math.max(...len) - Math.min(...len) > tol * Math.max(...len)) return false;
  if (Math.max(...c) - Math.min(...c) > tol) return false;
  // 90 (sc), 60 (fcc primitive), 109.47 (bcc primitive, cos = -1/3)
  return [0, 0.5, -1 / 3].some((t) => Math.abs(c[0]! - t) < tol);
}

/** INCAR settings per E-V point (S-042). ENCUT and the k-mesh must stay the same in every folder. */
export function eosEntries(base: readonly IncarEntry[], encut: number, cubic: boolean): IncarEntry[] {
  const set: IncarEntry[] = [
    {
      name: 'ISIF',
      value: cubic ? '2' : '4',
      comment: cubic
        ? 'cubic cell: ions only, the cell is fixed at this volume'
        : 'shape and ions relax, the volume stays fixed',
    },
    { name: 'IBRION', value: '2', comment: 'conjugate gradient' },
    { name: 'NSW', value: '100' },
    { name: 'EDIFF', value: '1E-6' },
    { name: 'EDIFFG', value: '-0.005', comment: 'stop when every force is below 0.005 eV/A' },
  ];
  const names = new Set(set.map((e) => e.name));
  const kept = withEncut(base, encut).filter((e) => !names.has(e.name));
  return [...kept, ...set];
}

export interface EosProjectInput {
  structure: Structure;
  entries: readonly IncarEntry[];
  job: JobOptions;
  encut: number;
  mesh: Mesh;
  cubic: boolean;
  fractions?: readonly number[];
  centering?: MeshKind;
}

export function eosCollectScript(folders: readonly string[]): string {
  return [
    header(
      'Print label,volume_A3,E_sigma0,nions for every finished folder (CSV for the equation-of-state tool).',
    ),
    '# Volume: last "volume of cell" line. Energy: last field of "energy  without entropy" (energy(sigma->0)).',
    'cd "$(dirname "$0")" || exit 1',
    'echo "label,volume_A3,E_sigma0,nions"',
    `for d in ${folders.join(' ')}; do`,
    `  o="${EOS_ROOT}/$d/OUTCAR"`,
    '  [ -f "$o" ] || continue',
    '  grep -q "reached required accuracy" "$o" || echo "Not converged: $d" >&2',
    '  V=$(grep "volume of cell" "$o" | tail -1 | awk \'{print $NF}\')',
    '  E=$(grep "energy  without entropy" "$o" | tail -1 | awk \'{print $NF}\')',
    '  N=$(grep "NIONS" "$o" | head -1 | awk \'{print $NF}\')',
    '  echo "$d,$V,$E,$N"',
    'done',
    '',
  ].join('\n');
}

/** One folder per volume, the same INCAR (fixed ENCUT) and KPOINTS everywhere, scripts and a README. */
export function buildEosProject(p: EosProjectInput): Project {
  const runs = volumeSeries(p.structure, p.fractions ? { fractions: p.fractions } : {});
  const kind: MeshKind = p.centering ?? 'gamma';
  const incar = writeIncar(eosEntries(p.entries, p.encut, p.cubic));
  const kpoints = writeMeshKpoints(p.mesh, kind, [0, 0, 0], `fixed mesh for every volume`);
  const files: VirtualFile[] = [];
  const folders = runs.map((r) => r.folder);
  for (const r of runs) {
    const base = `${EOS_ROOT}/${r.folder}`;
    files.push(
      {
        path: `${base}/POSCAR`,
        content: writePoscar({
          ...r.structure,
          comment: `V = ${r.volume.toFixed(4)} A^3 (${r.fraction} x start)`,
        }).text,
      },
      { path: `${base}/INCAR`, content: incar },
      { path: `${base}/KPOINTS`, content: kpoints },
      { path: `${base}/job.sh`, content: jobScript({ ...p.job, jobName: r.folder }) },
    );
  }
  const warnings: string[] = [];
  if (runs.length < 7)
    warnings.push(
      `${runs.length} volumes: the handbook asks for 7 to 11 points, and the fit needs at least 5 to be checked.`,
    );
  const lo = runs[0]!.fraction;
  const hi = runs.at(-1)!.fraction;
  if (lo > 1 || hi < 1)
    warnings.push(
      'The starting volume is outside the scanned range, so the minimum may be too. Scan on both sides.',
    );
  const cost = estimateCost(
    p.structure.species.length,
    runs.map(() => ({ mesh: p.mesh })),
  );
  if (cost.warn)
    warnings.push(
      `Heuristic size check: ${cost.atomKpoints.toLocaleString('en-US')} atom x k-point units over ${runs.length} runs. Consider fewer runs or a smaller cell.`,
    );
  const labels = potcarLabels(p.structure);
  files.push(
    { path: 'run_all.sh', content: runAllScript(folders, p.job, EOS_ROOT) },
    { path: 'collect.sh', content: eosCollectScript(folders) },
    { path: 'make_potcar.sh', content: makePotcarScript(labels, folders, EOS_ROOT) },
    { path: 'README.txt', content: eosReadme(p, runs, labels) },
  );
  return { files, folders, warnings, cost };
}

export function eosReadme(p: EosProjectInput, runs: readonly VolumeRun[], labels: readonly string[]): string {
  return [
    'Equation of state: energy-volume scan',
    'Generated by the DFT Handbook Input Builder. Check every file before you run it.',
    '',
    `Atoms: ${p.structure.species.length}. ${runs.length} volumes from ${runs[0]!.volume.toFixed(3)} to ${runs.at(-1)!.volume.toFixed(3)} A^3 (${runs.map((r) => r.fraction).join(', ')} x the starting cell).`,
    `ENCUT ${p.encut} eV and the mesh ${p.mesh.join('x')} are the same in every folder.`,
    '',
    'Why these settings',
    p.cubic
      ? '  ISIF = 2: the cell is cubic, so its shape is fixed by symmetry; only ions relax (none move when every atom sits on a fixed site, which makes the run a static point).'
      : '  ISIF = 4: ions and cell shape relax while the volume stays fixed, so each point is the lowest energy at that volume.',
    '  Each volume is a separate fixed-volume run. An E(V) curve gives V0 and B0 without the stress tensor, so it is free of',
    '  Pulay stress at a fixed cutoff (Workflow Handbook, EOS). Do not use ISIF = 3 for this: a volume relaxation follows',
    '  the stress, which needs about 30 % more cutoff to converge (ENCUT = 1.3 x ENMAX for variable-cell runs).',
    '  ISIF = 4 still changes the cell shape at a fixed cutoff; if the shape changes a lot, raise ENCUT and rerun.',
    '  ISTART = 2 (constant basis set, read from a WAVECAR) is the other way to get a curve without Pulay contamination.',
    '  EDIFF = 1E-6 and EDIFFG = -0.005: B0 comes from a small curvature, so noisy energies spoil it.',
    '',
    'Layout',
    `  ${EOS_ROOT}/vol_<fraction>/   POSCAR INCAR KPOINTS job.sh`,
    '  make_potcar.sh   builds POTCAR from your licensed library and copies it into every folder',
    '  run_all.sh       runs every folder one after another (mpirun), then writes results.csv',
    '  collect.sh       prints label,volume_A3,E_sigma0,nions as CSV',
    '',
    'POTCAR (you must build it yourself)',
    `  ${POTCAR_NOTE}`,
    `  Species order in POSCAR: ${labels.join(' ')}`,
    '  POTCAR_DIR=/path/to/your/library bash make_potcar.sh',
    '',
    'Run',
    '  Locally or inside one job:  bash run_all.sh',
    `  On a cluster, one job per folder:  for d in ${EOS_ROOT}/*/; do (cd "$d" && ${submitCommand(p.job.scheduler, 'job.sh')}); done`,
    '  Then collect:  bash collect.sh > results.csv',
    '',
    'Fit',
    '  Drop results.csv (or the OUTCAR files) into the equation-of-state tool on the site (/tools/eos/). Nothing is uploaded.',
    '  Check that the minimum lies inside the scanned range. If the lowest energy is at an edge, extend the scan.',
    '',
  ].join('\n');
}

// ---- zip -----------------------------------------------------------------------------------------------------

/** Unix mode 0o755 for scripts, 0o644 otherwise, stored in the zip's external attributes. */
const zippable = (files: readonly VirtualFile[]): Zippable => {
  const z: Zippable = {};
  for (const f of files) {
    const mode = f.path.endsWith('.sh') ? 0o755 : 0o644;
    z[f.path] = [strToU8(f.content), { os: 3, attrs: (0o100000 | mode) << 16, mtime: new Date(2024, 0, 1) }];
  }
  return z;
};

export const totalBytes = (files: readonly VirtualFile[]): number =>
  files.reduce((s, f) => s + strToU8(f.content).length, 0);

export const ZIP_WORKER_THRESHOLD = 2 * 1024 * 1024;

export const zipProject = (files: readonly VirtualFile[]): Uint8Array => zipSync(zippable(files));

/** Async zip: fflate runs the compression in a worker, so a large tree does not freeze the page. */
export const zipProjectAsync = (files: readonly VirtualFile[]): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zipAsync(zippable(files), (err, data) => (err ? reject(err) : resolve(data)));
  });

/** Indented folder tree for display before download. */
export function treeLines(files: readonly VirtualFile[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of [...files].map((x) => x.path).sort()) {
    const parts = f.split('/');
    parts.forEach((part, i) => {
      const key = parts.slice(0, i + 1).join('/');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(`${'  '.repeat(i)}${part}${i < parts.length - 1 ? '/' : ''}`);
    });
  }
  return out;
}
