import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import FileExplorer from './FileExplorer';
import type { Annotation } from '../../lib/vasp/annotate';
import { parseOszicar } from '../../lib/vasp/oszicar';
import {
  DEFAULT_SETTINGS,
  echoedSettings,
  excerptFor,
  noteLabel,
  readOutput,
  type CheckState,
  type FileGuess,
} from '../../lib/vasp/outputReader';
import { OUTPUT_SAMPLES } from '../../lib/vasp/outputSamples';
import './OutputReaderLab.css';

const MAX_BYTES = 30 * 1024 * 1024;
const STATE_WORD: Record<CheckState, string> = {
  ok: 'OK',
  watch: 'Look closer',
  problem: 'Problem',
  unknown: 'Cannot tell',
};
const first = OUTPUT_SAMPLES[0]!;

/** Output reader: explains every recognised line of an OSZICAR or OUTCAR. The file is read in the browser and never uploaded. */
export default function OutputReaderLab() {
  const [text, setText] = useState(first.text);
  const [source, setSource] = useState<string>(first.id); // a sample id, 'paste' or 'file'
  const [fileName, setFileName] = useState('');
  const [ediff, setEdiff] = useState(String(DEFAULT_SETTINGS.ediff));
  const [ediffg, setEdiffg] = useState('');
  const [nelm, setNelm] = useState(String(DEFAULT_SETTINGS.nelm));
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const settings = useMemo(() => {
    const e = Number(ediff);
    const g = ediffg.trim() === '' ? null : Number(ediffg);
    const n = Number(nelm);
    return {
      ediff: Number.isFinite(e) && e > 0 ? e : DEFAULT_SETTINGS.ediff,
      ediffg: g !== null && Number.isFinite(g) && g !== 0 ? g : null,
      nelm: Number.isInteger(n) && n > 0 ? n : DEFAULT_SETTINGS.nelm,
    };
  }, [ediff, ediffg, nelm]);

  const res = useMemo(() => readOutput(text, settings), [text, settings]);
  const view = useMemo(() => excerptFor(text, res.notes), [text, res.notes]);
  const annotations: Annotation[] = useMemo(
    () =>
      view.notes.map((n) => ({
        line: n.line,
        label: noteLabel(n),
        beginner: n.beginner,
        intermediate: n.intermediate,
      })),
    [view.notes],
  );
  const isSample = OUTPUT_SAMPLES.some((s) => s.id === source);
  const kind: FileGuess = res.kind;

  const electronic = useMemo(() => (kind === 'OSZICAR' ? parseOszicar(text).electronic : []), [kind, text]);
  const ionic = useMemo(() => (kind === 'OSZICAR' ? parseOszicar(text).ionic : []), [kind, text]);

  const load = (t: string, src: string, name = '') => {
    setText(t);
    setSource(src);
    setFileName(name);
    const echo = echoedSettings(t);
    if (echo.ediff !== undefined) setEdiff(String(echo.ediff));
    if (echo.ediffg !== undefined) setEdiffg(String(echo.ediffg));
    if (echo.nelm !== undefined) setNelm(String(echo.nelm));
    setMessage(
      echo.ediff !== undefined || echo.ediffg !== undefined
        ? 'The settings below were filled in from the parameter lines echoed in the file. Change them if you know better.'
        : '',
    );
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setMessage(
        `That file is ${(f.size / 1e6).toFixed(0)} MB. Pick an OSZICAR or an OUTCAR smaller than 30 MB.`,
      );
      return;
    }
    load(await f.text(), 'file', f.name);
  };
  const reset = () => {
    load(first.text, first.id);
    setEdiff(String(DEFAULT_SETTINGS.ediff));
    setEdiffg('');
    setNelm(String(DEFAULT_SETTINGS.nelm));
    setMessage('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const s = res.summary;
  const readouts = [
    { label: 'File type', value: kind === 'unknown' ? 'not recognised' : kind },
    { label: 'Ionic steps', value: s.ionicSteps },
    ...(s.electronicPerIonic.length
      ? [{ label: 'Electronic steps per ionic step', value: s.electronicPerIonic.join(', ') }]
      : []),
    ...(s.lastF !== undefined
      ? [{ label: 'Last free energy F', value: s.lastF.toFixed(5), unit: 'eV' }]
      : []),
    ...(s.lastE0 !== undefined
      ? [{ label: 'Last E0 (sigma to 0)', value: s.lastE0.toFixed(5), unit: 'eV' }]
      : []),
    ...(s.lastDE !== undefined ? [{ label: 'Last dE', value: s.lastDE.toExponential(2), unit: 'eV' }] : []),
    ...(s.maxForce !== undefined
      ? [{ label: 'Largest force', value: s.maxForce.toFixed(4), unit: 'eV/A' }]
      : []),
    ...(s.entropyPerAtom !== undefined
      ? [{ label: 'Entropy term per atom', value: (s.entropyPerAtom * 1000).toFixed(2), unit: 'meV' }]
      : []),
    ...(s.mag !== undefined ? [{ label: 'Total magnetization', value: s.mag.toFixed(4), unit: 'muB' }] : []),
  ];

  const logs = electronic.map((e) => Math.log10(Math.max(Math.abs(e.dE), 1e-16)));
  const n = electronic.length;
  const lo = logs.length ? Math.floor(Math.min(...logs, Math.log10(settings.ediff))) - 1 : -8;
  const hi = logs.length ? Math.ceil(Math.max(...logs, Math.log10(settings.ediff))) + 1 : 2;

  const fs = ionic.map((i) => i.f);
  const fLo = fs.length ? Math.min(...fs) : 0;
  const fHi = fs.length ? Math.max(...fs) : 1;
  const fPad = Math.max((fHi - fLo) * 0.2, 0.001);

  const desc = `${kind === 'unknown' ? 'No recognised file.' : `A ${kind} file with ${s.ionicSteps} ionic step${s.ionicSteps === 1 ? '' : 's'}.`} ${res.checks
    .map((c) => `${c.label}: ${STATE_WORD[c.state]}.`)
    .join(
      ' ',
    )} Below the checks is the file, line by line: each recognised line is a button that opens its explanation.`;

  return (
    <LabShell
      title="Output reader"
      goal="Drop in an OSZICAR or OUTCAR and see what every line means and whether the run looks healthy."
      badge="computed"
      onReset={reset}
      controls={
        <div className="or-controls">
          <label className="or-field">
            <span>Example file</span>
            <select
              value={isSample ? source : ''}
              onChange={(e) => {
                const smp = OUTPUT_SAMPLES.find((x) => x.id === e.target.value);
                if (smp) load(smp.text, smp.id);
              }}
            >
              {!isSample && <option value="">(your own text)</option>}
              {OUTPUT_SAMPLES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="or-field">
            <span>Or choose your own OSZICAR or OUTCAR</span>
            <input ref={fileRef} type="file" onChange={onFile} />
          </label>
          <label className="or-field or-wide">
            <span>Or paste the text</span>
            <textarea
              rows={4}
              value={source === 'paste' || source === 'file' ? text : ''}
              placeholder="Paste an OSZICAR or an OUTCAR here"
              onChange={(e) => load(e.target.value, 'paste')}
            />
          </label>
          <div className="or-row">
            <label className="or-field">
              <span>EDIFF (eV)</span>
              <input inputMode="decimal" value={ediff} onChange={(e) => setEdiff(e.target.value)} />
            </label>
            <label className="or-field">
              <span>EDIFFG (blank if unknown)</span>
              <input inputMode="decimal" value={ediffg} onChange={(e) => setEdiffg(e.target.value)} />
            </label>
            <label className="or-field">
              <span>NELM</span>
              <input inputMode="numeric" value={nelm} onChange={(e) => setNelm(e.target.value)} />
            </label>
          </div>
          <p className="or-note">
            Your file is read in this browser tab and is never uploaded. EDIFF, EDIFFG and NELM are used only
            for the checks; OUTCAR files that echo them fill the boxes in.
          </p>
          {message && (
            <p className="or-note" role="status">
              {message}
            </p>
          )}
        </div>
      }
      readouts={readouts}
      notice={`${isSample ? 'This is a sample file with invented numbers, written to the documented line format. It is not a result. ' : fileName ? `File: ${fileName}. ` : ''}A line marked "looks healthy" met a rule from the VASP documentation (for example the loop stopped below EDIFF). A line marked "rule of thumb" is a heuristic from the author's handbook, not a law. "Cannot tell" means the file does not hold what the check needs: OSZICAR has no forces, for instance. A healthy-looking OSZICAR does not replace reading the OUTCAR.`}
      description={desc}
    >
      <div className="or-view">
        {isSample && (
          <p className="or-banner" role="note">
            Sample file: synthetic numbers, for reading practice only.
          </p>
        )}
        {res.warnings.length > 0 && (
          <ul className="or-warn">
            {res.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {res.checks.length > 0 && (
          <ul className="or-checks" aria-label="Checks">
            {res.checks.map((c) => (
              <li key={c.id} className={`or-check or-${c.state}`}>
                <strong>
                  {c.label}: {STATE_WORD[c.state]}
                  {c.heuristic ? ' (rule of thumb)' : ''}
                </strong>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
        {n > 1 && (
          <MiniPlot
            title="Change in energy at each electronic step (log scale)"
            xLabel="electronic step, counted through the file"
            yLabel="log10 of |dE| (eV)"
            xMin={1}
            xMax={Math.max(n, 2)}
            yMin={lo}
            yMax={hi}
            hlines={[Math.log10(settings.ediff)]}
            curves={[
              { xs: electronic.map((_, i) => i + 1), ys: logs, label: 'log10 |dE|', color: '#0072B2' },
            ]}
          />
        )}
        {ionic.length > 1 && (
          <MiniPlot
            title="Free energy F at each ionic step"
            xLabel="ionic step"
            yLabel="F (eV)"
            xMin={1}
            xMax={ionic.length}
            yMin={fLo - fPad}
            yMax={fHi + fPad}
            curves={[
              { xs: ionic.map((i) => i.step), ys: ionic.map((i) => i.f), label: 'F', color: '#D55E00' },
            ]}
          />
        )}
        {view.shortened && (
          <p className="or-note">
            The file has {view.total} lines. Only the recognised lines are shown below, in file order.
          </p>
        )}
        {kind !== 'unknown' && annotations.length > 0 && (
          <FileExplorer
            key={`${source}-${fileName}-${text.length}`}
            kind={kind === 'OSZICAR' ? 'OSZICAR' : 'OUTCAR-excerpt'}
            text={view.text}
            annotations={annotations}
          />
        )}
      </div>
    </LabShell>
  );
}
