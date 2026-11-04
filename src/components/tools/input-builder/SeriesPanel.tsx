import { useMemo, useState } from 'react';
import {
  MAX_RUNS,
  ZIP_WORKER_THRESHOLD,
  totalBytes,
  zipProject,
  zipProjectAsync,
  buildProject,
  encutSeries,
  kmeshSeries,
  parseMesh,
  treeLines,
  type Project,
  type ProjectInput,
} from '../../../lib/vasp/series';
import {
  entriesFromPreset,
  magmomFromSpecies,
  removeEntry,
  suggestEncut,
  upsert,
} from '../../../lib/vasp/builder';
import { parseKpoints, type Mesh } from '../../../lib/vasp/kpoints';
import { parseIncar } from '../../../lib/vasp/incar';
import { validate } from '../../../lib/vasp/validate';
import { presetOf, useBuilder } from './store';
import { downloadBlob } from './hooks';
import StructureStep from './StructureStep';

const positive = (s: string): number | undefined => {
  const x = Number(s);
  return s.trim() !== '' && Number.isFinite(x) && x > 0 ? x : undefined;
};
const list = (s: string): number[] | null => {
  const parts = s.split(/[\s,;]+/).filter(Boolean);
  const v = parts.map(Number);
  return parts.length > 0 && v.every((x) => Number.isFinite(x) && x > 0) ? v : null;
};

export default function SeriesPanel() {
  const { structure, enmax, job, magmom, version, rule, set } = useBuilder();
  const [doEncut, setDoEncut] = useState(true);
  const [doK, setDoK] = useState(true);
  const [kMode, setKMode] = useState<'resolution' | 'mesh'>('resolution');
  const [resText, setResText] = useState('0.06 0.05 0.04 0.03 0.025 0.02');
  const [meshText, setMeshText] = useState('4x4x4\n6x6x6\n8x8x8\n10x10x10');
  const [encutMeshText, setEncutMeshText] = useState('');
  const [fixedText, setFixedText] = useState('');
  const [spin, setSpin] = useState(false);
  const [msg, setMsg] = useState('');

  const enm = positive(enmax);
  const sug = enm ? suggestEncut('convergence', enm) : null;
  const fixedEncut = positive(fixedText) ?? sug?.value;

  const built = useMemo((): { project?: Project; errors: string[]; issues: string[] } => {
    const errors: string[] = [];
    if (!structure) return { errors: ['Load a structure first.'], issues: [] };
    if (!enm) return { errors: ['Type the largest ENMAX from your POTCAR (in eV).'], issues: [] };
    if (!fixedEncut) errors.push('Give the fixed ENCUT used by the k-mesh runs.');
    let encuts: number[] = [];
    let kruns: ReturnType<typeof kmeshSeries> = [];
    try {
      if (doEncut) encuts = encutSeries(enm);
      if (doK) {
        if (kMode === 'resolution') {
          const r = list(resText);
          if (!r) errors.push('Resolutions must be positive numbers separated by spaces.');
          else kruns = kmeshSeries({ lattice: structure.lattice, resolutions: r, rule });
        } else {
          const meshes = meshText
            .split(/\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map(parseMesh);
          if (meshes.length === 0 || meshes.some((m) => !m))
            errors.push('Write one mesh per line, like 6x6x6.');
          else kruns = kmeshSeries({ meshes: meshes as Mesh[] });
        }
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
    const mid = kmeshSeries({ lattice: structure.lattice, resolutions: [0.04], rule })[0]!.mesh;
    const encutMesh = encutMeshText.trim() ? parseMesh(encutMeshText) : mid;
    if (!encutMesh) errors.push('The fixed mesh for ENCUT runs must look like 8x8x8.');
    let entries = entriesFromPreset(presetOf('convergence'), 'default', { enmax: enm });
    if (spin) {
      const m = magmomFromSpecies(structure, magmom);
      if (!m)
        errors.push(
          'Spin-polarised runs need a MAGMOM per species. Set it in the single-calculation Settings step.',
        );
      else entries = upsert(entries, 'MAGMOM', m);
    } else {
      entries = removeEntry(upsert(entries, 'ISPIN', '1'), 'MAGMOM');
    }
    if (errors.length > 0 || !encutMesh || !fixedEncut) return { errors, issues: [] };
    const input: ProjectInput = { structure, entries, job, encuts, encutMesh, kruns, fixedEncut };
    try {
      const project = buildProject(input);
      const issues: string[] = [];
      for (const f of project.files.filter((x) => x.path.endsWith('/INCAR'))) {
        const k = project.files.find((x) => x.path === f.path.replace(/INCAR$/, 'KPOINTS'))!.content;
        for (const i of validate({
          incar: parseIncar(f.content).entries,
          kpoints: parseKpoints(k),
          structure,
          enmaxEv: enm,
          vaspVersion: version,
        }))
          if (i.severity === 'error') issues.push(`${f.path.split('/')[1]}: ${i.title}. ${i.why}`);
      }
      return { project, errors, issues };
    } catch (e) {
      return { errors: [(e as Error).message], issues: [] };
    }
  }, [
    structure,
    enm,
    fixedEncut,
    doEncut,
    doK,
    kMode,
    resText,
    meshText,
    encutMeshText,
    spin,
    magmom,
    job,
    rule,
    version,
  ]);

  const project = built.project;
  const blocked =
    !project || built.errors.length > 0 || built.issues.length > 0 || project.files.length === 0;
  const tree = project ? treeLines(project.files) : [];
  const preview = project?.files.find((f) => f.path.endsWith('collect.sh'));

  const download = async () => {
    if (!project) return;
    const big = totalBytes(project.files) > ZIP_WORKER_THRESHOLD;
    const data = big ? await zipProjectAsync(project.files) : zipProject(project.files);
    downloadBlob('convergence-series.zip', data as BlobPart, 'application/zip');
    setMsg('Downloaded convergence-series.zip');
  };

  return (
    <div className="ib-series">
      <StructureStep />
      <section aria-labelledby="ib-cs2">
        <h2 id="ib-cs2">2. Convergence series</h2>
        <p>
          Builds one folder per test run, using the <strong>convergence</strong> preset: static runs at a
          fixed structure. Run them all, then pick the smallest setting where the energy per atom stops
          changing.
        </p>
        <p className="ib-note" role="note">
          Heuristic: the series values and the size check are rules of thumb, not predictions. Nothing is
          uploaded and no POTCAR content is made.
        </p>
        <div className="ib-row">
          <div className="ib-field">
            <label htmlFor="cs-enmax">Largest ENMAX in your POTCAR (eV)</label>
            <input
              id="cs-enmax"
              inputMode="decimal"
              value={enmax}
              onChange={(e) => set('enmax', e.target.value)}
              aria-describedby="cs-enmax-help"
            />
            <small id="cs-enmax-help">From grep ENMAX POTCAR on your own machine.</small>
          </div>
          <div className="ib-field">
            <label htmlFor="cs-fixed">Fixed ENCUT for the k-mesh runs (eV)</label>
            <input
              id="cs-fixed"
              inputMode="decimal"
              value={fixedText}
              placeholder={sug ? String(sug.value) : ''}
              onChange={(e) => setFixedText(e.target.value)}
            />
          </div>
          <div className="ib-field">
            <label htmlFor="cs-emesh">Fixed mesh for the ENCUT runs</label>
            <input
              id="cs-emesh"
              value={encutMeshText}
              placeholder="default: resolution 0.04"
              onChange={(e) => setEncutMeshText(e.target.value)}
            />
          </div>
        </div>
        <fieldset className="ib-fieldset">
          <legend>Which series</legend>
          <label>
            <input type="checkbox" checked={doEncut} onChange={(e) => setDoEncut(e.target.checked)} /> ENCUT
            series
            {enm ? ` (${encutSeries(enm).join(', ')} eV)` : ''}
          </label>
          <label>
            <input type="checkbox" checked={doK} onChange={(e) => setDoK(e.target.checked)} /> k-mesh series
          </label>
        </fieldset>
        {doK && (
          <div className="ib-row">
            <div className="ib-field">
              <label htmlFor="cs-kmode">k-mesh series from</label>
              <select
                id="cs-kmode"
                value={kMode}
                onChange={(e) => setKMode(e.target.value as 'resolution' | 'mesh')}
              >
                <option value="resolution">VASPKIT resolutions</option>
                <option value="mesh">Explicit meshes</option>
              </select>
            </div>
            {kMode === 'resolution' ? (
              <div className="ib-field">
                <label htmlFor="cs-res">Resolutions (2 pi / Angstrom)</label>
                <input id="cs-res" value={resText} onChange={(e) => setResText(e.target.value)} />
              </div>
            ) : (
              <div className="ib-field">
                <label htmlFor="cs-meshes">Meshes, one per line</label>
                <textarea
                  id="cs-meshes"
                  rows={4}
                  value={meshText}
                  onChange={(e) => setMeshText(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
        <label>
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Spin-polarised
          (uses the MAGMOM you set for each species in the single-calculation Settings step)
        </label>
        <p>
          Scheduler, cores and executable come from the single-calculation <em>Job script</em> step (currently{' '}
          {job.scheduler === 'slurm' ? 'SLURM' : 'PBS'}, {job.nodes * job.tasksPerNode} cores).
        </p>
      </section>
      <section aria-labelledby="ib-cs3">
        <h2 id="ib-cs3">3. Check and download</h2>
        {built.errors.map((e) => (
          <p key={e} role="alert" className="ib-error">
            {e}
          </p>
        ))}
        {built.issues.map((e) => (
          <p key={e} role="alert" className="ib-error">
            {e}
          </p>
        ))}
        {project?.warnings.map((w) => (
          <p key={w} className="ib-warn" role="note">
            {w}
          </p>
        ))}
        {project && (
          <>
            <p aria-live="polite">
              {project.folders.length} runs (limit {MAX_RUNS}). Folder tree of the zip:
            </p>
            <pre tabIndex={0} aria-label="Folder tree of the zip">
              {tree.join('\n')}
            </pre>
            <div className="ib-actions">
              <button type="button" disabled={blocked} onClick={() => void download()}>
                Download zip
              </button>
            </div>
            {preview && (
              <details>
                <summary>Show collect.sh</summary>
                <pre tabIndex={0} aria-label="collect.sh contents">
                  {preview.content}
                </pre>
              </details>
            )}
          </>
        )}
        <p role="status">{msg}</p>
      </section>
    </div>
  );
}
