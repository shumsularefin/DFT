// Job script templates (SLURM and PBS) and the POTCAR assembly command. Pure functions, no DOM.
// Directives: SLURM sbatch (--job-name, --nodes, --ntasks-per-node, --time, --partition, --output) and PBS Pro
// (-N, -l select=..:ncpus=..:mpiprocs=.., -l walltime, -q, -j oe). Site-specific values (modules, queue names, the POTCAR
// directory) are placeholders the user edits; nothing here is a real cluster default.
// @source S-042 (VASP Workflow Handbook, job and POTCAR sections)
export type Scheduler = 'slurm' | 'pbs';
export type Executable = 'vasp_std' | 'vasp_gam' | 'vasp_ncl';
export type Launcher = 'mpirun' | 'srun';

export interface JobOptions {
  scheduler: Scheduler;
  jobName: string;
  nodes: number;
  tasksPerNode: number;
  /** HH:MM:SS */
  walltime: string;
  /** Partition (SLURM) or queue (PBS); empty to omit. */
  partition: string;
  /** One `module load` line each, for example "vasp/6.4.2". */
  modules: string[];
  executable: Executable;
  launcher: Launcher;
}

export const DEFAULT_JOB: JobOptions = {
  scheduler: 'slurm',
  jobName: 'vasp',
  nodes: 1,
  tasksPerNode: 32,
  walltime: '24:00:00',
  partition: '',
  modules: [],
  executable: 'vasp_std',
  launcher: 'srun',
};

export const totalCores = (o: Pick<JobOptions, 'nodes' | 'tasksPerNode'>): number => o.nodes * o.tasksPerNode;

/** Whole-number divisors of n (ascending). */
export function divisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (Number.isInteger(n) && n % d === 0) out.push(d);
  return out;
}

/**
 * Candidate NCORE and KPAR values that divide the core counts. HEURISTIC: the handbook only says KPAR is typically 2 to 8
 * and divides the cores, and NCORE is a divisor of the cores per node; the best pair depends on the machine and system.
 */
export function parallelSuggestions(o: Pick<JobOptions, 'nodes' | 'tasksPerNode'>): {
  kpar: number[];
  ncore: number[];
} {
  const cores = totalCores(o);
  return {
    kpar: divisors(cores).filter((d) => d >= 2 && d <= 8),
    ncore: divisors(o.tasksPerNode).filter((d) => d >= 2 && d <= 16),
  };
}

const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
const safeName = (s: string) => clean(s).replace(/[^A-Za-z0-9._-]/g, '_') || 'vasp';

function launchLine(o: JobOptions): string {
  const exe = o.executable;
  return o.launcher === 'srun'
    ? `srun ${exe} > vasp.out 2>&1`
    : `mpirun -np ${totalCores(o)} ${exe} > vasp.out 2>&1`;
}

/** The job script text, ending in a newline. */
export function jobScript(o: JobOptions): string {
  const lines: string[] = ['#!/bin/bash'];
  const name = safeName(o.jobName);
  if (o.scheduler === 'slurm') {
    lines.push(`#SBATCH --job-name=${name}`);
    lines.push(`#SBATCH --nodes=${o.nodes}`);
    lines.push(`#SBATCH --ntasks-per-node=${o.tasksPerNode}`);
    lines.push(`#SBATCH --time=${clean(o.walltime)}`);
    if (clean(o.partition)) lines.push(`#SBATCH --partition=${clean(o.partition)}`);
    lines.push('#SBATCH --output=%x-%j.out');
  } else {
    lines.push(`#PBS -N ${name}`);
    lines.push(`#PBS -l select=${o.nodes}:ncpus=${o.tasksPerNode}:mpiprocs=${o.tasksPerNode}`);
    lines.push(`#PBS -l walltime=${clean(o.walltime)}`);
    if (clean(o.partition)) lines.push(`#PBS -q ${clean(o.partition)}`);
    lines.push('#PBS -j oe');
  }
  lines.push('');
  lines.push(o.scheduler === 'slurm' ? 'cd "$SLURM_SUBMIT_DIR"' : 'cd "$PBS_O_WORKDIR"');
  for (const m of o.modules.map(clean).filter(Boolean)) lines.push(`module load ${m}`);
  lines.push('');
  lines.push(launchLine(o));
  return lines.join('\n') + '\n';
}

/** Name of the submit command for the README. */
export const submitCommand = (s: Scheduler, file: string): string =>
  s === 'slurm' ? `sbatch ${file}` : `qsub ${file}`;

/**
 * Command that builds POTCAR by joining the per-element files in POSCAR species order. It contains no POTCAR content.
 * `labels` are the directory names under your licensed POTCAR library (for example "Ti_pv"); `dir` is a shell variable.
 */
export function potcarCommand(labels: readonly string[], dir = '$POTCAR_LIBRARY'): string {
  if (labels.length === 0) return '';
  const files = labels.map((l) => `"${dir}/${l}/POTCAR"`).join(' ');
  return `cat ${files} > POTCAR`;
}

export const POTCAR_NOTE =
  'POTCAR files are licensed by VASP Software GmbH. This site never contains, generates or uploads POTCAR content. Build POTCAR on your own machine from your licensed library, with the elements in the same order as the species line of POSCAR.';
