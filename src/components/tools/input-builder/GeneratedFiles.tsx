import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { unfilled } from '../../../lib/vasp/builder';
import { copyText } from './hooks';
import { STEPS, canDownload, countsOf, filesOf, issuesOf, useBuilder } from './store';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One INCAR line split into tag, value and comment spans for the template code colours. */
function IncarLine({ line }: { line: string }) {
  const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)([^!#]*)(.*)$/.exec(line);
  if (/^\s*[#!]/.test(line) || !m) return <span className="c">{line}</span>;
  return (
    <>
      {m[1]}
      <span className="k">{m[2]}</span>
      {m[3]}
      <span className="n">{m[4]}</span>
      {m[5] ? <span className="c">{m[5]}</span> : null}
    </>
  );
}

/** Live preview of the files in the bundle, with the pre-flight summary from the Check step. */
export default function GeneratedFiles() {
  const s = useBuilder();
  const files = useMemo(() => filesOf(s), [s]);
  const issues = useMemo(() => issuesOf(s), [s]);
  const counts = countsOf(issues);
  const open = unfilled(s.entries).length;
  const ok = canDownload(s, issues);
  const names = [...files.map((f) => f.name), ...(s.structure ? [] : ['POSCAR'])];
  const [tab, setTab] = useState('INCAR');
  const [msg, setMsg] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);
  const current = names.includes(tab) ? tab : 'INCAR';
  const file = files.find((f) => f.name === current);
  const lines = file ? file.text.replace(/\n$/, '').split('\n') : [];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = names.indexOf(current);
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % names.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + names.length) % names.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? names.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(names[next]!);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const tone = counts.error > 0 || open > 0 ? 'is-error' : counts.warn > 0 ? 'is-warn' : 'is-ok';
  const preflight = s.structure
    ? `Pre-flight: ${plural(counts.error, 'error')}, ${plural(counts.warn, 'warning')}, ${plural(counts.info, 'note')}${open ? `, ${plural(open, 'unfilled value')}` : ''}`
    : 'Pre-flight: waiting for a structure (step 1)';

  return (
    <section className="card ib-files" aria-labelledby="ib-files-h">
      <h2 id="ib-files-h" className="card-h">
        Generated files
        <button
          type="button"
          className="btn btn-ghost right"
          disabled={!file}
          aria-label={`Copy ${current}`}
          onClick={async () => {
            if (file) setMsg((await copyText(file.text)) ? `${current} copied` : 'Could not copy');
          }}
        >
          <svg className="ib-ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          Copy
        </button>
      </h2>
      <div className="tabbar" role="tablist" aria-label="Generated files" ref={tabsRef} onKeyDown={onKey}>
        {names.map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            id={`ib-tab-${n}`}
            aria-selected={n === current}
            aria-controls="ib-file-panel"
            tabIndex={n === current ? 0 : -1}
            onClick={() => setTab(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div id="ib-file-panel" role="tabpanel" aria-labelledby={`ib-tab-${current}`}>
        {file ? (
          <pre className="code ib-code" tabIndex={0} aria-label={`${current} preview`}>
            {lines.map((l, i) => (
              <span className="ln" key={i}>
                {current === 'INCAR' ? <IncarLine line={l} /> : l || ' '}
              </span>
            ))}
          </pre>
        ) : (
          <p className="ph ib-ph">No structure yet. Paste or choose a POSCAR in step 1.</p>
        )}
      </div>
      <div className={`notice ib-preflight ${tone}`}>
        <span className="ib-dot" aria-hidden="true" />
        <span>
          {preflight}. {ok ? 'Download ready.' : 'Download blocked.'}
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => s.setStep(3)}>
          Open {STEPS[3]}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {msg}
      </p>
    </section>
  );
}
