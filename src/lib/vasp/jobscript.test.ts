import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOB,
  divisors,
  jobScript,
  parallelSuggestions,
  potcarCommand,
  submitCommand,
  totalCores,
} from './jobscript';

describe('jobScript', () => {
  it('SLURM with srun, exact text', () => {
    const t = jobScript({
      ...DEFAULT_JOB,
      jobName: 'cu-relax',
      nodes: 2,
      tasksPerNode: 16,
      walltime: '12:00:00',
      partition: 'compute',
      modules: ['intel', 'vasp/6.4.2'],
    });
    expect(t).toBe(
      [
        '#!/bin/bash',
        '#SBATCH --job-name=cu-relax',
        '#SBATCH --nodes=2',
        '#SBATCH --ntasks-per-node=16',
        '#SBATCH --time=12:00:00',
        '#SBATCH --partition=compute',
        '#SBATCH --output=%x-%j.out',
        '',
        'cd "$SLURM_SUBMIT_DIR"',
        'module load intel',
        'module load vasp/6.4.2',
        '',
        'srun vasp_std > vasp.out 2>&1',
        '',
      ].join('\n'),
    );
  });
  it('SLURM with mpirun and no partition', () => {
    const t = jobScript({
      ...DEFAULT_JOB,
      nodes: 1,
      tasksPerNode: 8,
      launcher: 'mpirun',
      executable: 'vasp_gam',
    });
    expect(t).toContain('mpirun -np 8 vasp_gam > vasp.out 2>&1');
    expect(t).not.toContain('--partition');
  });
  it('PBS, exact text', () => {
    const t = jobScript({
      ...DEFAULT_JOB,
      scheduler: 'pbs',
      jobName: 'band',
      nodes: 1,
      tasksPerNode: 24,
      walltime: '02:30:00',
      partition: 'batch',
      launcher: 'mpirun',
      executable: 'vasp_ncl',
    });
    expect(t).toBe(
      [
        '#!/bin/bash',
        '#PBS -N band',
        '#PBS -l select=1:ncpus=24:mpiprocs=24',
        '#PBS -l walltime=02:30:00',
        '#PBS -q batch',
        '#PBS -j oe',
        '',
        'cd "$PBS_O_WORKDIR"',
        '',
        'mpirun -np 24 vasp_ncl > vasp.out 2>&1',
        '',
      ].join('\n'),
    );
  });
  it('cleans the job name and keeps newlines out of fields', () => {
    const t = jobScript({ ...DEFAULT_JOB, jobName: 'my job;rm -rf /\n#SBATCH x', modules: ['a\nrm -rf /'] });
    expect(t).toContain('#SBATCH --job-name=my_job_rm_-rf____SBATCH_x\n');
    expect(t.split('\n').filter((l) => l.startsWith('rm'))).toEqual([]);
  });
});

describe('helpers', () => {
  it('divisors and cores', () => {
    expect(divisors(12)).toEqual([1, 2, 3, 4, 6, 12]);
    expect(totalCores({ nodes: 2, tasksPerNode: 16 })).toBe(32);
  });
  it('parallel suggestions only list divisors', () => {
    const s = parallelSuggestions({ nodes: 2, tasksPerNode: 16 });
    expect(s.kpar).toEqual([2, 4, 8]);
    expect(s.ncore).toEqual([2, 4, 8, 16]);
  });
  it('POTCAR command lists files in order and carries no POTCAR content', () => {
    expect(potcarCommand(['Ti_pv', 'O'])).toBe(
      'cat "$POTCAR_LIBRARY/Ti_pv/POTCAR" "$POTCAR_LIBRARY/O/POTCAR" > POTCAR',
    );
    expect(potcarCommand([])).toBe('');
  });
  it('submit commands', () => {
    expect(submitCommand('slurm', 'job.sh')).toBe('sbatch job.sh');
    expect(submitCommand('pbs', 'job.sh')).toBe('qsub job.sh');
  });
});
