import { useMemo, useRef, useState } from 'react';
import { analyzeSeries, type EnergyQuantity } from '../../../lib/vasp/convergence';
import { X_LABEL, energyView, explain, formatMeV, toCsv } from '../../../lib/vasp/convergenceView';
import type { SeriesKind } from '../../../lib/vasp/kseries';
import {
  MAX_FILE_BYTES,
  ingestCsv,
  ingestFiles,
  pointsFromRows,
  type Ingest,
  type SeriesRow,
} from '../../../lib/vasp/seriesInput';
import { downloadBlob, useLevel } from '../input-builder/hooks';
import './convergence.css';
import ConvergencePlot, { H, W } from './ConvergencePlot';
import { svgToPng, svgToString } from './exportSvg';

const QUANTITIES: { id: EnergyQuantity; label: string }[] = [
  { id: 'energySigma0', label: 'energy(sigma->0) (default)' },
  { id: 'freeEnergyTOTEN', label: 'free energy TOTEN' },
  { id: 'energyWithoutEntropy', label: 'energy without entropy' },
];
const KINDS: { id: SeriesKind; label: string }[] = [
  { id: 'encut', label: 'ENCUT series' },
  { id: 'kresolution', label: 'k-mesh by resolution' },
  { id: 'kmesh', label: 'k-mesh by divisions' },
];

const SAMPLE = `encut,energy,natoms
400,-3.5150,1
450,-3.5200,1
500,-3.5205,1
550,-3.5206,1
600,-3.5206,1`;

export default function ConvergenceTool() {
  const level = useLevel();
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const nextId = useRef(1);
  const [kind, setKind] = useState<SeriesKind>('encut');
  const [quantity, setQuantity] = useState<EnergyQuantity>('energySigma0');
  const [threshold, setThreshold] = useState(1);
  const [natoms, setNatoms] = useState('');
  const [enmax, setEnmax] = useState('');
  const [relative, setRelative] = useState(true);
  const [paste, setPaste] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [sample, setSample] = useState(false);
  const [msg, setMsg] = useState('');
  const energyRef = useRef<SVGSVGElement>(null);
  const pressureRef = useRef<SVGSVGElement>(null);

  const add = (r: Ingest) => {
    setRows((old) => [...old, ...r.rows.map((x) => ({ ...x, id: nextId.current++ }))]);
    if (r.kind) setKind(r.kind);
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
    const r = ingestFiles(files);
    add({ ...r, warnings: [...early, ...r.warnings] });
  };
  const onPaste = () => {
    try {
      add(ingestCsv(paste));
      setPaste('');
      setSample(false);
    } catch (e) {
      setNotes([(e as Error).message]);
    }
  };
  const loadSample = () => {
    setRows([]);
    add(ingestCsv(SAMPLE));
    setSample(true);
  };
  const edit = (id: number, patch: Partial<SeriesRow>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((old) => [
      ...old,
      { id: nextId.current++, x: '', energy: '', natoms: '', pressure: '', label: '' },
    ]);

  const nat = Number(natoms) > 0 ? Number(natoms) : undefined;
  const enm = Number(enmax) > 0 ? Number(enmax) : undefined;
  const th = threshold / 1000;

  const model = useMemo(() => {
    const { points, skipped } = pointsFromRows(rows, quantity, nat);
    if (points.length < 1) return { skipped, points };
    const result = analyzeSeries(points, {
      kind,
      thresholdEvPerAtom: th,
      quantity,
      ...(enm ? { enmax: enm } : {}),
    });
    const view = energyView(result, th, relative);
    const text = explain(result, { kind, thresholdEvPerAtom: th, ...(enm ? { enmax: enm } : {}), level });
    return { skipped, points, result, view, text };
  }, [rows, quantity, nat, kind, th, enm, relative, level]);

  const result = model.result;
  const hasPressure =
    !!result && result.points.length >= 2 && result.points.every((p) => p.pressure !== undefined);
  const missingNatoms = rows.length > 0 && !nat && model.points.some((p) => p.natoms === undefined);

  const exportSvg = (which: 'energy' | 'pressure') => {
    const el = (which === 'energy' ? energyRef : pressureRef).current;
    if (!el) return;
    const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
    downloadBlob(`convergence-${which}.svg`, svgToString(el, bg), 'image/svg+xml');
    setMsg(`Downloaded convergence-${which}.svg`);
  };
  const exportPng = async (which: 'energy' | 'pressure') => {
    const el = (which === 'energy' ? energyRef : pressureRef).current;
    if (!el) return;
    const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
    try {
      downloadBlob(`convergence-${which}.png`, await svgToPng(svgToString(el, bg), W, H, 2), 'image/png');
      setMsg(`Downloaded convergence-${which}.png`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="cv">
      <p className="cv-banner" role="note">
        Everything is read in this page and nothing is uploaded. The convergence rule is explained in the
        result panel. The pressure threshold of 5 kB is a <strong>Heuristic</strong>, not a published limit.
      </p>
      <section aria-labelledby="cv-in">
        <h2 id="cv-in">1. Your results</h2>
        <p>
          Drop OSZICAR or OUTCAR files from a series. Name each file or folder after its setting, like{' '}
          <code>encut_450</code> or <code>kpt_0.04</code>, or type the setting in the table below.
        </p>
        <div
          className="cv-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          <label htmlFor="cv-files">
            Choose OSZICAR or OUTCAR files (several at once, or drop them here)
          </label>
          <input id="cv-files" type="file" multiple onChange={(e) => void onFiles(e.target.files)} />
        </div>
        <div className="cv-field">
          <label htmlFor="cv-paste">Or paste a table (CSV, tab or spaces; collect.sh output works)</label>
          <textarea
            id="cv-paste"
            rows={5}
            spellCheck={false}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </div>
        <div className="cv-actions">
          <button type="button" onClick={onPaste} disabled={paste.trim() === ''}>
            Add pasted table
          </button>
          <button type="button" onClick={loadSample}>
            Load sample data
          </button>
          <button type="button" onClick={addRow}>
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
          <p className="cv-sample" role="note">
            <strong>Sample data.</strong> These numbers are invented to show the plot. They are not a real
            calculation.
          </p>
        )}
        {notes.map((n) => (
          <p key={n} className="cv-note" role="alert">
            {n}
          </p>
        ))}
        {model.skipped.length > 0 && (
          <p className="cv-note" role="note">
            Row {model.skipped.join(', ')} left out: it needs a setting (x) and an energy.
          </p>
        )}
      </section>

      <section aria-labelledby="cv-opt">
        <h2 id="cv-opt">2. Settings</h2>
        <div className="cv-row">
          <fieldset className="cv-fieldset">
            <legend>Series type</legend>
            {KINDS.map((k) => (
              <label key={k.id} className="cv-radio">
                <input type="radio" name="cv-kind" checked={kind === k.id} onChange={() => setKind(k.id)} />{' '}
                {k.label}
              </label>
            ))}
          </fieldset>
          <div className="cv-field">
            <label htmlFor="cv-q">Energy quantity</label>
            <select
              id="cv-q"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value as EnergyQuantity)}
            >
              {QUANTITIES.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <div className="cv-field">
            <label htmlFor="cv-nat">Atoms in the cell (for rows without a count)</label>
            <input
              id="cv-nat"
              inputMode="numeric"
              value={natoms}
              onChange={(e) => setNatoms(e.target.value)}
            />
          </div>
          <div className="cv-field">
            <label htmlFor="cv-enmax">Largest ENMAX in your POTCAR (eV, optional)</label>
            <input
              id="cv-enmax"
              inputMode="decimal"
              value={enmax}
              onChange={(e) => setEnmax(e.target.value)}
            />
          </div>
          <div className="cv-field">
            <label htmlFor="cv-th">
              Threshold: <output htmlFor="cv-th">{threshold.toFixed(1)}</output> meV/atom
            </label>
            <input
              id="cv-th"
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </div>
          <label className="cv-radio">
            <input type="checkbox" checked={relative} onChange={(e) => setRelative(e.target.checked)} /> Show
            energy relative to the last point
          </label>
        </div>
        {missingNatoms && (
          <p className="cv-note" role="note">
            Some rows have no atom count, so their energies are used as given. Type the number of atoms above.
          </p>
        )}
      </section>

      <section aria-labelledby="cv-res">
        <h2 id="cv-res">3. Result</h2>
        {!result || !model.view || !model.text ? (
          <p>Add results above to see the plot.</p>
        ) : (
          <>
            <div className="cv-explain" aria-live="polite" data-testid="explanation">
              <p>
                <strong>{model.text.headline}</strong>
              </p>
              {model.text.details.map((d) => (
                <p key={d}>{d}</p>
              ))}
              {model.text.advice.map((d) => (
                <p key={d} className="cv-advice">
                  {d}
                </p>
              ))}
            </div>
            <ConvergencePlot
              ref={energyRef}
              title="Energy convergence"
              xLabel={X_LABEL[kind]}
              yLabel={model.view.yLabel}
              points={model.view.points}
              band={{
                ...model.view.band,
                label: `Threshold band: +/- ${threshold.toFixed(1)} meV/atom around the last point`,
              }}
              convergedIndex={model.view.convergedIndex}
              reverseX={kind === 'kresolution'}
              description={`${result.points.length} points. ${model.text.headline}`}
            />
            <div className="cv-actions">
              <button type="button" onClick={() => exportSvg('energy')}>
                Export energy SVG
              </button>
              <button type="button" onClick={() => void exportPng('energy')}>
                Export energy PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadBlob('convergence.csv', toCsv(result, kind), 'text/csv');
                  setMsg('Downloaded convergence.csv');
                }}
              >
                Export table CSV
              </button>
            </div>
            {hasPressure && (
              <>
                <ConvergencePlot
                  ref={pressureRef}
                  title="Pressure convergence"
                  xLabel={X_LABEL[kind]}
                  yLabel="External pressure (kB)"
                  points={result.points.map((p, i) => ({
                    x: p.x,
                    y: p.pressure!,
                    tooltip: `x = ${p.x}: pressure ${p.pressure} kB`,
                    converged: result.pressure?.convergedIndex != null && i >= result.pressure.convergedIndex,
                  }))}
                  convergedIndex={result.pressure?.convergedIndex ?? null}
                  reverseX={kind === 'kresolution'}
                  description="Pressure of each run. Heuristic threshold of 5 kB between points."
                />
                <div className="cv-actions">
                  <button type="button" onClick={() => exportSvg('pressure')}>
                    Export pressure SVG
                  </button>
                  <button type="button" onClick={() => void exportPng('pressure')}>
                    Export pressure PNG
                  </button>
                </div>
              </>
            )}
            <p role="status">{msg}</p>
            <table className="cv-table">
              <caption>Results per point (text version of the plot)</caption>
              <thead>
                <tr>
                  <th scope="col">{X_LABEL[kind]}</th>
                  <th scope="col">Energy (eV/atom)</th>
                  <th scope="col">From last point</th>
                  <th scope="col">Pressure (kB)</th>
                  <th scope="col">Converged</th>
                </tr>
              </thead>
              <tbody>
                {result.points.map((p, i) => (
                  <tr key={`${p.x}-${i}`}>
                    <th scope="row">{p.x}</th>
                    <td>{result.perAtom[i]!.toFixed(5)}</td>
                    <td>{formatMeV(result.diffs[i]!)}</td>
                    <td>{p.pressure ?? 'n/a'}</td>
                    <td>{result.convergedIndex !== null && i >= result.convergedIndex ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="cv-tab">
          <h2 id="cv-tab">Your table (editable)</h2>
          <div className="cv-scroll">
            <table className="cv-table">
              <caption>Input rows. Energies are total energy of the cell in eV.</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Setting (x)</th>
                  <th scope="col">Energy (eV)</th>
                  <th scope="col">Atoms</th>
                  <th scope="col">Pressure (kB)</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <th scope="row" title={r.label}>
                      {i + 1}
                    </th>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} setting`}
                        value={r.x}
                        onChange={(e) => edit(r.id, { x: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} energy`}
                        value={r.energies?.[quantity] !== undefined ? String(r.energies[quantity]) : r.energy}
                        onChange={(e) => {
                          const { energies: _drop, ...rest } = r;
                          void _drop;
                          setRows((old) =>
                            old.map((o) => (o.id === r.id ? { ...rest, energy: e.target.value } : o)),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} atoms`}
                        value={r.natoms}
                        onChange={(e) => edit(r.id, { natoms: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Row ${i + 1} pressure`}
                        value={r.pressure}
                        onChange={(e) => edit(r.id, { pressure: e.target.value })}
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
