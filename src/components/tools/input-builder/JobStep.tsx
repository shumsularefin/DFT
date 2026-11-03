import { useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { buildFiles, potcarLabels } from '../../../lib/vasp/builder';
import {
  POTCAR_NOTE,
  jobScript,
  parallelSuggestions,
  potcarCommand,
  type Executable,
  type Launcher,
  type Scheduler,
} from '../../../lib/vasp/jobscript';
import { canDownload, issuesOf, kpointsOf, presetOf, shareOf, useBuilder } from './store';
import { copyText, downloadBlob } from './hooks';

export default function JobStep() {
  const s = useBuilder();
  const { job } = s;
  const [msg, setMsg] = useState('');
  const issues = issuesOf(s);
  const ok = canDownload(s, issues);
  const sug = parallelSuggestions(job);
  const setJob = (patch: Partial<typeof job>) => s.set('job', { ...job, ...patch });
  const num = (v: string) => Math.max(1, Math.floor(Number(v) || 1));

  const files = () =>
    s.structure
      ? buildFiles({
          structure: s.structure,
          entries: s.entries,
          kpoints: kpointsOf(s).text,
          job,
          presetTitle: presetOf(s.presetId).title,
          vaspVersion: s.version,
        })
      : [];

  const say = (t: string) => setMsg(t);
  const one = (name: string) => {
    const f = files().find((x) => x.name === name);
    if (f) downloadBlob(f.name, f.text);
  };
  const zip = () => {
    const data: Record<string, Uint8Array> = {};
    for (const f of files()) data[f.name] = strToU8(f.text);
    downloadBlob('vasp-inputs.zip', zipSync(data) as BlobPart, 'application/zip');
    say('Downloaded vasp-inputs.zip');
  };
  const share = async () => {
    const frag = shareOf(s);
    history.replaceState(null, '', `#${frag}`);
    say(
      (await copyText(location.href))
        ? 'Share link copied'
        : 'Link is in the address bar; copy it from there',
    );
  };
  const labels = s.structure ? potcarLabels(s.structure) : [];

  return (
    <section aria-labelledby="ib-s6">
      <h2 id="ib-s6">6. Job script and download</h2>
      <div className="ib-row">
        <div className="ib-field">
          <label htmlFor="ib-sched">Scheduler</label>
          <select
            id="ib-sched"
            value={job.scheduler}
            onChange={(e) => setJob({ scheduler: e.target.value as Scheduler })}
          >
            <option value="slurm">SLURM</option>
            <option value="pbs">PBS</option>
          </select>
        </div>
        <div className="ib-field">
          <label htmlFor="ib-jname">Job name</label>
          <input id="ib-jname" value={job.jobName} onChange={(e) => setJob({ jobName: e.target.value })} />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-nodes">Nodes</label>
          <input
            id="ib-nodes"
            inputMode="numeric"
            value={job.nodes}
            onChange={(e) => setJob({ nodes: num(e.target.value) })}
          />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-tpn">Tasks per node</label>
          <input
            id="ib-tpn"
            inputMode="numeric"
            value={job.tasksPerNode}
            onChange={(e) => setJob({ tasksPerNode: num(e.target.value) })}
          />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-wall">Walltime (HH:MM:SS)</label>
          <input id="ib-wall" value={job.walltime} onChange={(e) => setJob({ walltime: e.target.value })} />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-part">{job.scheduler === 'slurm' ? 'Partition' : 'Queue'} (optional)</label>
          <input id="ib-part" value={job.partition} onChange={(e) => setJob({ partition: e.target.value })} />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-exe">Executable</label>
          <select
            id="ib-exe"
            value={job.executable}
            onChange={(e) => setJob({ executable: e.target.value as Executable })}
          >
            <option value="vasp_std">vasp_std</option>
            <option value="vasp_gam">vasp_gam</option>
            <option value="vasp_ncl">vasp_ncl</option>
          </select>
        </div>
        <div className="ib-field">
          <label htmlFor="ib-launch">Launcher</label>
          <select
            id="ib-launch"
            value={job.launcher}
            onChange={(e) => setJob({ launcher: e.target.value as Launcher })}
          >
            <option value="srun">srun</option>
            <option value="mpirun">mpirun</option>
          </select>
        </div>
      </div>
      <div className="ib-field">
        <label htmlFor="ib-mods">Modules to load (one per line)</label>
        <textarea
          id="ib-mods"
          rows={3}
          value={job.modules.join('\n')}
          onChange={(e) => setJob({ modules: e.target.value.split('\n') })}
        />
      </div>
      <p className="ib-small">
        Heuristic parallel settings for {job.nodes * job.tasksPerNode} cores: KPAR that divides the cores (
        {sug.kpar.join(', ') || 'none in 2 to 8'}); NCORE that divides the cores per node (
        {sug.ncore.join(', ') || 'none'}). The best pair depends on your machine, so test a short run.
      </p>

      <h3>Job script</h3>
      <pre className="ib-pre" tabIndex={0} aria-label="Job script">
        {jobScript(job)}
      </pre>
      <button
        type="button"
        onClick={async () => say((await copyText(jobScript(job))) ? 'Job script copied' : 'Could not copy')}
      >
        Copy job script
      </button>

      <h3>POTCAR</h3>
      <p>{POTCAR_NOTE}</p>
      {labels.length > 0 && (
        <>
          <p>Species order: {labels.join(', ')}. Run this where your POTCAR library lives:</p>
          <pre className="ib-pre" tabIndex={0} aria-label="POTCAR command">
            {potcarCommand(labels)}
          </pre>
          <button
            type="button"
            onClick={async () =>
              say((await copyText(potcarCommand(labels))) ? 'POTCAR command copied' : 'Could not copy')
            }
          >
            Copy POTCAR command
          </button>
        </>
      )}

      <h3>Download</h3>
      {!ok && (
        <p className="ib-error">
          Download is blocked: fix the errors, fill the placeholders, or tick the box in step 4.
        </p>
      )}
      <div className="ib-row">
        <button type="button" disabled={!ok} onClick={zip}>
          Download zip
        </button>
        {['INCAR', 'KPOINTS', 'POSCAR', 'job.sh'].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!ok || (n === 'KPOINTS' && !kpointsOf(s).text)}
            onClick={() => one(n)}
          >
            Download {n}
          </button>
        ))}
        <button type="button" onClick={() => void share()}>
          Copy share link
        </button>
      </div>
      <p role="status" aria-live="polite" className="ib-small">
        {msg}
      </p>
      <p className="ib-small">
        The share link holds settings and, when it is 2 KB or less, the structure. Nothing is uploaded.
      </p>
    </section>
  );
}
