import { useMemo, useRef, useState } from 'react';
import {
  EOS_FORMS,
  EOS_RULES,
  cubicLatticeConstant,
  eosEnergy,
  fitEos,
  type EosFit,
  type EosForm,
} from '../../../lib/physics/eos';
import {
  eosPointsFromRows,
  eosResultCsv,
  ingestEosCsv,
  ingestEosFiles,
  type EosIngest,
  type EosRow,
} from '../../../lib/vasp/eosInput';
import { MAX_FILE_BYTES } from '../../../lib/vasp/seriesInput';
import { downloadBlob } from '../input-builder/hooks';
import '../convergence/convergence.css';
import './eos.css';
import { svgToPng, svgToString } from '../convergence/exportSvg';
import EosPlot, { H, W } from './EosPlot';

/** Synthetic: a Birch-Murnaghan curve from made-up parameters with fixed sub-meV offsets. Not a real material. */
function sampleCsv(): string {
  const p = { e0: -3.72, v0: 11.95, b0: 0.87, b1: 4.8 };
  const jitter = [0.4, -0.3, 0.2, -0.1, 0.3, -0.4, 0.1];
  return [
    'label,volume,energy,natoms',
    ...[0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06].map((f, i) => {
      const v = Number((p.v0 * f).toFixed(4));
      return `vol_${f.toFixed(3)},${v},${(eosEnergy('birch_murnaghan', v, p) + jitter[i]! / 1000).toFixed(6)},1`;
    }),
  ].join('\n');
}

const CELLS = [
  { id: 'none', label: 'Not cubic (no lattice constant)', n: 0 },
  { id: 'conv', label: 'Simple or conventional cubic cell (V = a^3)', n: 1 },
  { id: 'bcc', label: 'bcc primitive cell (V = a^3 / 2)', n: 2 },
  { id: 'fcc', label: 'fcc primitive cell, also diamond and rock salt (V = a^3 / 4)', n: 4 },
] as const;
type CellId = (typeof CELLS)[number]['id'];

const pm = (v: number | undefined, digits: number) => (v === undefined ? '' : ` +/- ${v.toFixed(digits)}`);

export default function EosTool() {
  const [rows, setRows] = useState<EosRow[]>([]);
  const nextId = useRef(1);
  const [form, setForm] = useState<EosForm>('birch_murnaghan');
  const [natoms, setNatoms] = useState('');
  const [cell, setCell] = useState<CellId>('none');
  const [paste, setPaste] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [sample, setSample] = useState(false);
  const [msg, setMsg] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const add = (r: EosIngest) => {
    setRows((old) => [...old, ...r.rows.map((x) => ({ ...x, id: nextId.current++ }))]);
    setNotes(r.warnings);
  };
  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files: { name: string; text: string }[] = [];
    const early: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        early.push(`${f.name}: larger than 25 MB, skipped.`);
        continue;
      }
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      files.push({ name: rel || f.name, text: await f.text() });
    }
    const r = ingestEosFiles(files);
    setSample(false);
    add({ ...r, warnings: [...early, ...r.warnings] });
  };
  const edit = (id: number, patch: Partial<EosRow>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const model = useMemo((): {
    fit?: EosFit;
    error?: string;
    skipped: number[];
    natoms?: number;
    mismatch: boolean;
  } => {
    const p = eosPointsFromRows(rows);
    const typed = Number(natoms) > 0 ? Number(natoms) : undefined;
    const n = typed ?? p.natoms;
    const base = { skipped: p.skipped, mismatch: p.natomsMismatch, ...(n ? { natoms: n } : {}) };
    if (p.points.length === 0) return base;
    try {
      return { ...base, fit: fitEos(p.points, form, n ? { natoms: n } : {}) };
    } catch (e) {
      return { ...base, error: (e as Error).message };
    }
  }, [rows, form, natoms]);

  const fit = model.fit;
  const n = model.natoms;
  const cellN = CELLS.find((c) => c.id === cell)!.n;
  const lat =
    fit && cellN ? cubicLatticeConstant(fit.params.v0, cellN as 1 | 2 | 4, fit.stderr?.v0) : undefined;
  const gpaErr = fit?.stderr ? (fit.stderr.b0 * fit.b0GPa) / fit.params.b0 : undefined;

  const bg = () => getComputedStyle(document.body).backgroundColor || '#ffffff';
  const exportSvg = () => {
    if (!svgRef.current) return;
    downloadBlob('eos-fit.svg', svgToString(svgRef.current, bg()), 'image/svg+xml');
    setMsg('Downloaded eos-fit.svg');
  };
  const exportPng = async () => {
    if (!svgRef.current) return;
    try {
      downloadBlob('eos-fit.png', await svgToPng(svgToString(svgRef.current, bg()), W, H, 2), 'image/png');
      setMsg('Downloaded eos-fit.png');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="cv">
      <p className="cv-banner" role="note">
        Everything is read in this page and nothing is uploaded. Checks marked <strong>Heuristic</strong> are
        rules of thumb, not published limits.
      </p>
      <section aria-labelledby="eos-in">
        <h2 id="eos-in">1. Your energy-volume points</h2>
        <p>
          Drop the OUTCAR of every volume (each in its own folder, for example <code>vol_0.980/OUTCAR</code>).
          The tool reads the last <code>volume of cell</code> line and the last{' '}
          <code>energy(sigma-&gt;0)</code>. An OSZICAR has no volume, so type it in the table. Or paste the
          output of the <code>collect.sh</code> the Input Builder writes for an EOS series.
        </p>
        <div
          className="cv-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          <label htmlFor="eos-files">
            Choose OUTCAR or OSZICAR files (several at once, or drop them here)
          </label>
          <input id="eos-files" type="file" multiple onChange={(e) => void onFiles(e.target.files)} />
        </div>
        <div className="cv-field">
          <label htmlFor="eos-paste">
            Or paste a table: volume (Å³ per cell), energy (eV per cell), optional atom count. CSV, tab or
            spaces; a header row is optional.
          </label>
          <textarea
            id="eos-paste"
            rows={6}
            spellCheck={false}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </div>
        <div className="cv-actions">
          <button
            type="button"
            onClick={() => {
              add(ingestEosCsv(paste));
              setPaste('');
              setSample(false);
            }}
            disabled={paste.trim() === ''}
          >
            Add pasted table
          </button>
          <button
            type="button"
            onClick={() => {
              setRows([]);
              add(ingestEosCsv(sampleCsv()));
              setSample(true);
            }}
          >
            Load sample data
          </button>
          <button
            type="button"
            onClick={() =>
              setRows((old) => [
                ...old,
                { id: nextId.current++, label: '', volume: '', energy: '', natoms: '' },
              ])
            }
          >
            Add a row
          </button>
          <button
            type="button"
            onClick={() => {
              setRows([]);
              setNotes([]);
              setSample(false);
            }}
            disabled={rows.length === 0}
          >
            Clear table
          </button>
        </div>
        {sample && (
          <p className="cv-sample" role="note" data-testid="sample-banner">
            <strong>Sample data (synthetic).</strong> These points come from made-up parameters with small
            added offsets. They are not a real calculation or a real material.
          </p>
        )}
        {notes.map((t) => (
          <p key={t} className="cv-note" role="alert">
            {t}
          </p>
        ))}
        {model.skipped.length > 0 && (
          <p className="cv-note" role="note">
            Row {model.skipped.join(', ')} left out: it needs a positive volume and an energy.
          </p>
        )}
      </section>

      <section aria-labelledby="eos-opt">
        <h2 id="eos-opt">2. Settings</h2>
        <div className="cv-row">
          <fieldset className="cv-fieldset">
            <legend>Equation of state</legend>
            {(Object.keys(EOS_FORMS) as EosForm[]).map((k) => (
              <label key={k} className="cv-radio">
                <input type="radio" name="eos-form" checked={form === k} onChange={() => setForm(k)} />{' '}
                {EOS_FORMS[k]}
              </label>
            ))}
          </fieldset>
          <div className="cv-field">
            <label htmlFor="eos-nat">Atoms in the cell (for per-atom values)</label>
            <input
              id="eos-nat"
              inputMode="numeric"
              value={natoms}
              placeholder={n ? String(n) : ''}
              onChange={(e) => setNatoms(e.target.value)}
            />
          </div>
          <div className="cv-field">
            <label htmlFor="eos-cell">Cell type, for the lattice constant</label>
            <select id="eos-cell" value={cell} onChange={(e) => setCell(e.target.value as CellId)}>
              {CELLS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {model.mismatch && (
          <p className="cv-note" role="note">
            The rows have different atom counts. Every point of one curve must be the same cell.
          </p>
        )}
      </section>

      <section aria-labelledby="eos-res">
        <h2 id="eos-res">3. Result</h2>
        {model.error && (
          <p className="cv-note" role="alert">
            {model.error}
          </p>
        )}
        {!fit ? (
          !model.error && <p>Add at least {EOS_RULES.minPoints} points above to fit a curve.</p>
        ) : (
          <>
            <dl className="eos-results" data-testid="eos-results" aria-live="polite">
              <dt>Equilibrium volume V0</dt>
              <dd data-testid="v0">
                {fit.params.v0.toFixed(4)}
                {pm(fit.stderr?.v0, 4)} Å³ per cell
                {n ? ` (${(fit.params.v0 / n).toFixed(4)} Å³ per atom)` : ''}
              </dd>
              <dt>Bulk modulus B0</dt>
              <dd data-testid="b0">
                {fit.b0GPa.toFixed(2)}
                {pm(gpaErr, 2)} GPa ({fit.params.b0.toFixed(5)} eV/Å³)
              </dd>
              <dt>Pressure derivative B0&apos;</dt>
              <dd data-testid="b1">
                {fit.params.b1.toFixed(3)}
                {pm(fit.stderr?.b1, 3)} (dimensionless)
              </dd>
              <dt>Minimum energy E0</dt>
              <dd data-testid="e0">
                {fit.params.e0.toFixed(5)}
                {pm(fit.stderr?.e0, 5)} eV per cell
                {n ? ` (${(fit.params.e0 / n).toFixed(5)} eV per atom)` : ''}
              </dd>
              {lat && (
                <>
                  <dt>Cubic lattice constant a</dt>
                  <dd data-testid="lattice">
                    {lat.a.toFixed(4)}
                    {pm(lat.aErr, 4)} Å
                  </dd>
                </>
              )}
              <dt>RMS residual</dt>
              <dd data-testid="rms">
                {(fit.rmsResidual * 1000).toFixed(3)} meV per cell
                {fit.rmsResidualPerAtom !== undefined
                  ? ` (${(fit.rmsResidualPerAtom * 1000).toFixed(3)} meV per atom)`
                  : ''}
              </dd>
              <dt>Fit</dt>
              <dd>
                {EOS_FORMS[fit.form]}, {fit.points.length} points, Levenberg-Marquardt from a parabola start,{' '}
                {fit.converged ? `converged in ${fit.iterations} steps` : 'not converged'}.
                {fit.stderr
                  ? ' Errors are one standard error from the fit.'
                  : ' No errors: no points to spare.'}
              </dd>
            </dl>
            <div data-testid="eos-warnings">
              {fit.warnings.length === 0 ? (
                <p className="cv-advice">No sampling or quality warning for this set.</p>
              ) : (
                fit.warnings.map((w) => (
                  <p
                    key={w.code}
                    className={w.severity === 'warning' ? 'cv-note' : 'cv-advice'}
                    data-code={w.code}
                    role="note"
                  >
                    {w.heuristic && <strong>Heuristic: </strong>}
                    {w.message}
                  </p>
                ))
              )}
            </div>
            <EosPlot
              ref={svgRef}
              fit={fit}
              description={`${fit.points.length} points and the fitted ${EOS_FORMS[fit.form]} curve, minimum at ${fit.params.v0.toFixed(3)} Å³. Lower panel: residuals in meV.`}
            />
            <div className="cv-actions">
              <button type="button" onClick={exportSvg}>
                Export SVG
              </button>
              <button type="button" onClick={() => void exportPng()}>
                Export PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadBlob('eos-fit.csv', eosResultCsv(fit), 'text/csv');
                  setMsg('Downloaded eos-fit.csv');
                }}
              >
                Export CSV
              </button>
            </div>
            <p role="status">{msg}</p>
            <div className="cv-scroll" tabIndex={0} role="region" aria-label="Points and fit table">
              <table className="cv-table">
                <caption>Points and fit (text version of the plot)</caption>
                <thead>
                  <tr>
                    <th scope="col">Point</th>
                    <th scope="col">Volume (Å³)</th>
                    <th scope="col">Energy (eV)</th>
                    <th scope="col">Fit (eV)</th>
                    <th scope="col">Residual (meV)</th>
                  </tr>
                </thead>
                <tbody>
                  {fit.points.map((q, i) => (
                    <tr key={`${q.volume}-${i}`}>
                      <th scope="row">{q.label ?? i + 1}</th>
                      <td>{q.volume}</td>
                      <td>{q.energy}</td>
                      <td>{q.fit.toFixed(6)}</td>
                      <td>{(q.residual * 1000).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="eos-tab">
          <h2 id="eos-tab">Your table (editable)</h2>
          <div className="cv-scroll">
            <table className="cv-table">
              <caption>Input rows: volume in Å³ per cell, energy in eV per cell.</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Volume (Å³)</th>
                  <th scope="col">Energy (eV)</th>
                  <th scope="col">Atoms</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <th scope="row" title={r.label}>
                      {r.label || i + 1}
                    </th>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} volume`}
                        inputMode="decimal"
                        value={r.volume}
                        onChange={(e) => edit(r.id, { volume: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} energy`}
                        inputMode="decimal"
                        value={r.energy}
                        onChange={(e) => edit(r.id, { energy: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} atoms`}
                        inputMode="numeric"
                        value={r.natoms}
                        onChange={(e) => edit(r.id, { natoms: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Remove row ${i + 1}`}
                        onClick={() => setRows((old) => old.filter((o) => o.id !== r.id))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
