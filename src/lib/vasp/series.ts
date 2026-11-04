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

export function runAllScript(folders: readonly string[], job: JobOptions): string {
  return [
    header('Run every test folder one after another on this machine or inside one job.'),
    '# Build POTCAR first: bash make_potcar.sh (see README.txt).',
    `NP=\${NP:-${totalCores(job)}}`,
    'cd "$(dirname "$0")" || exit 1',
    `for d in ${folders.map((f) => `${ROOT}/${f}`).join(' ')}; do`,
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

export function makePotcarScript(labels: readonly string[], folders: readonly string[]): string {
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
    `for d in ${folders.map((f) => `${ROOT}/${f}`).join(' ')}; do cp POTCAR "$d/POTCAR"; done`,
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
