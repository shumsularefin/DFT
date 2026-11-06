import { useId, useMemo, useState } from 'react';
import LabShell from './LabShell';
import { readOutput, DEFAULT_NELM, type Health } from '../../lib/vasp/outputReader';
import oszicarExample from '../../lib/vasp/__fixtures__/oszicar-spin.txt?raw';
import outcarExample from '../../lib/vasp/__fixtures__/outcar-v54.txt?raw';
import './OutputReader.css';

const MAX_BYTES = 50 * 1024 * 1024;
const MARK: Record<Health, string> = {
  ok: 'Looks healthy',
  warn: 'Check this',
  bad: 'Problem',
  info: 'Note',
};

/** Lab "output-reader": annotate an OSZICAR or OUTCAR locally (never uploaded) with the M4.1 parsers. */
export default function OutputReader() {
  const uid = useId();
  const [text, setText] = useState('');
  const [example, setExample] = useState<'' | 'OSZICAR' | 'OUTCAR'>('');
  const [ediffg, setEdiffg] = useState('-0.02');
  const [nelm, setNelm] = useState(String(DEFAULT_NELM));
  const [error, setError] = useState('');

  const opts = useMemo(() => {
    const e = Number(ediffg);
    const n = Number(nelm);
    return {
      ediffg: ediffg.trim() !== '' && Number.isFinite(e) ? e : undefined,
      nelm: Number.isInteger(n) && n > 0 ? n : DEFAULT_NELM,
    };
  }, [ediffg, nelm]);
  const report = useMemo(() => (text.trim() ? readOutput(text, opts) : null), [text, opts]);
  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const notesByLine = useMemo(() => {
    const m = new Map<number, { text: string; health: Health }[]>();
    for (const n of report?.notes ?? []) m.set(n.line, [...(m.get(n.line) ?? []), n]);
    return m;
  }, [report]);

  const onFile = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(
        `This file is ${(f.size / 1e6).toFixed(0)} MB. Paste the part you need (the reader handles up to 50 MB).`,
      );
      return;
    }
    setExample('');
    setText(await f.text());
  };
  const load = (k: 'OSZICAR' | 'OUTCAR') => {
    setError('');
    setExample(k);
    setText(k === 'OSZICAR' ? oszicarExample : outcarExample);
  };
  const reset = () => {
    setText('');
    setExample('');
    setEdiffg('-0.02');
    setNelm(String(DEFAULT_NELM));
    setError('');
  };

  // electronic convergence plot: log10 |dE| per electronic step
  const el = report?.electronic.filter((v) => v > 0) ?? [];
  const W = 480;
  const H = 150;
  const lo = el.length ? Math.floor(Math.log10(Math.min(...el))) : 0;
  const hi = el.length ? Math.ceil(Math.log10(Math.max(...el))) : 1;
  const ex = (i: number) => 48 + (i / Math.max(el.length - 1, 1)) * (W - 60);
  const ey = (v: number) => 10 + ((hi - Math.log10(v)) / (hi - lo || 1)) * (H - 30);

  const noted = lines.map((l, i) => ({ l, i: i + 1, notes: notesByLine.get(i + 1) })).filter((x) => x.notes);
  const fail = report?.checks.filter((c) => c.health === 'bad' || c.health === 'warn').length ?? 0;

  return (
    <LabShell
      title="Output reader"
      goal="Read an OSZICAR or OUTCAR line by line: what each number means and whether it looks healthy."
      badge="computed"
      onReset={reset}
      controls={
        <>
          <div className="or-input">
            <label htmlFor={`${uid}-file`}>
              Open a file from your computer (read in this browser, never uploaded)
            </label>
            <input id={`${uid}-file`} type="file" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
          </div>
          <div className="or-input">
            <label htmlFor={`${uid}-text`}>Or paste OSZICAR or OUTCAR text</label>
            <textarea
              id={`${uid}-text`}
              rows={6}
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setExample('');
                setText(e.currentTarget.value);
              }}
            />
          </div>
          <div className="or-row">
            <button type="button" className="btn" onClick={() => load('OSZICAR')}>
              Synthetic OSZICAR example
            </button>
            <button type="button" className="btn" onClick={() => load('OUTCAR')}>
              Synthetic OUTCAR example
            </button>
          </div>
          <div className="or-row">
            <label className="or-num">
              EDIFFG of the run
              <input
                type="number"
                step="0.01"
                value={ediffg}
                onChange={(e) => setEdiffg(e.currentTarget.value)}
              />
            </label>
            <label className="or-num">
              NELM of the run
              <input
                type="number"
                step="1"
                min="1"
                value={nelm}
                onChange={(e) => setNelm(e.currentTarget.value)}
              />
            </label>
          </div>
        </>
      }
      readouts={
        report
          ? [
              { label: 'File type', value: report.kind === 'unknown' ? 'not recognised' : report.kind },
              { label: 'Ionic steps', value: String(report.ionic.length) },
              { label: 'Lines explained', value: String(report.notes.length) },
              { label: 'Checks to look at', value: String(fail) },
            ]
          : []
      }
      notice="In OSZICAR, look at how many electronic steps each ionic step needed: a step that needs NELM did not converge. In OUTCAR, the three things to find first are 'reached required accuracy', the largest force compared with |EDIFFG|, and the entropy term per atom."
      description={
        report
          ? `${report.kind} read: ${report.ionic.length} ionic steps, ${report.notes.length} lines explained, ${fail} checks flagged.`
          : 'No file loaded yet.'
      }
    >
      {error && (
        <p className="or-error" role="alert">
          {error}
        </p>
      )}
      {example && (
        <p className="or-banner" role="note">
          Synthetic example written by hand to show the format. It is not the output of a real calculation.
        </p>
      )}
      {!report && <p>Open a file, paste text or pick an example.</p>}
      {report?.kind === 'unknown' && (
        <p className="or-error">
          This does not look like an OSZICAR or an OUTCAR. Paste the file as VASP wrote it.
        </p>
      )}
      {report && report.kind !== 'unknown' && (
        <>
          <h4>Checks</h4>
          <ul className="or-checks">
            {report.checks.map((c) => (
              <li key={c.label} className={`or-${c.health}`}>
                <span className="or-mark">{MARK[c.health]}:</span> <strong>{c.label}</strong> {c.value}.{' '}
                <span className="or-why">{c.why}</span>
              </li>
            ))}
          </ul>
          {el.length > 1 && (
            <figure className="or-fig">
              <figcaption>Electronic convergence: |dE| per electronic step, logarithmic axis</figcaption>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
                {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).map((e) => (
                  <g key={e}>
                    <line x1={48} x2={W - 12} y1={ey(10 ** e)} y2={ey(10 ** e)} stroke="var(--border)" />
                    <text x={44} y={ey(10 ** e) + 4} textAnchor="end" fontSize="12" fill="currentColor">
                      {`1e${e}`}
                    </text>
                  </g>
                ))}
                <path
                  d={el.map((v, i) => `${i ? 'L' : 'M'}${ex(i).toFixed(1)},${ey(v).toFixed(1)}`).join('')}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
                <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="currentColor">
                  electronic step 1 to {el.length}, all ionic steps in a row
                </text>
              </svg>
            </figure>
          )}
          {report.ionic.length > 0 && (
            <table className="or-table">
              <caption>Ionic steps</caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Energy (eV)</th>
                  {report.kind === 'OSZICAR' && <th scope="col">Electronic steps</th>}
                  {report.ionic.some((s) => s.mag !== undefined) && <th scope="col">Moment</th>}
                </tr>
              </thead>
              <tbody>
                {report.ionic.map((s) => (
                  <tr key={s.step}>
                    <td>{s.step}</td>
                    <td>{s.energy}</td>
                    {report.kind === 'OSZICAR' && <td>{s.nElectronic}</td>}
                    {report.ionic.some((x) => x.mag !== undefined) && <td>{s.mag ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h4>Line by line</h4>
          <ul className="or-lines">
            {noted.slice(0, 400).map(({ l, i, notes }) => (
              <li key={i}>
                <code>
                  {i}: {l.trim().slice(0, 120)}
                </code>
                {notes!.map((n, k) => (
                  <p key={k} className={`or-${n.health}`}>
                    <span className="or-mark">{MARK[n.health]}:</span> {n.text}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {noted.length > 400 && <p>Showing the first 400 explained lines of {noted.length}.</p>}
          <p className="or-honest">
            The healthy or not marks use the VASP defaults and the author&apos;s rules of thumb (Heuristic).
            Some OUTCAR lines are not recognised; only the lines listed here were read.
          </p>
        </>
      )}
    </LabShell>
  );
}
