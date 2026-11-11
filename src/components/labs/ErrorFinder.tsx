import { useId, useMemo, useState } from 'react';
import LabShell from './LabShell';
import { useLevel } from '../tools/input-builder/hooks';
import errors from '../../data/errors.json';
import {
  CATEGORY_LABELS,
  createFinder,
  entryAtLevel,
  incarLines,
  type ErrorEntry,
  type ErrorMatch,
  type MatchKind,
} from '../../lib/vasp/errorFinder';
import type { Level } from '../../lib/levels';
import './ErrorFinder.css';

const ENTRIES = errors as ErrorEntry[];
const MAX_BYTES = 5 * 1024 * 1024;
const KIND_LABEL: Record<MatchKind, string> = {
  exact: 'Exact message',
  token: 'Routine name',
  fuzzy: 'Possible match',
};
const EXAMPLE = ` ZBRENT: fatal error in bracketing
 please rerun with smaller EDIFF, or copy CONTCAR to POSCAR and continue`;

function EntryCard({
  entry,
  level,
  kind,
  line,
}: {
  entry: ErrorEntry;
  level: Level;
  kind?: MatchKind;
  line?: string;
}) {
  const v = entryAtLevel(entry, level);
  return (
    <article className="ef-card" data-entry={entry.id}>
      <h4 className="ef-title">{entry.title}</h4>
      <p className="ef-meta">
        {kind && <span className="ef-kind">{KIND_LABEL[kind]}</span>}
        <span className="ef-cat">{CATEGORY_LABELS[entry.category] ?? entry.category}</span>
      </p>
      {line && (
        <p className="ef-line">
          Matched this line: <code>{line.slice(0, 160)}</code>
        </p>
      )}
      <p>{v.plain}</p>
      <h5>{v.causes.length > 1 ? 'Likely causes' : 'Likely cause'}</h5>
      <ol>
        {v.causes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <h5>What to try, in this order</h5>
      <ol>
        {v.fixes.map((f) => (
          <li key={f.text}>
            {f.text}
            {incarLines(f).length > 0 && (
              <pre className="ef-incar" aria-label="INCAR change">
                {incarLines(f).join('\n')}
              </pre>
            )}
          </li>
        ))}
      </ol>
      {(v.hiddenCauses > 0 || v.hiddenFixes > 0) && (
        <p className="ef-more">
          Switch the level to Intermediate to see{' '}
          {v.hiddenCauses > 0 && `${v.hiddenCauses} more cause${v.hiddenCauses > 1 ? 's' : ''}`}
          {v.hiddenCauses > 0 && v.hiddenFixes > 0 && ' and '}
          {v.hiddenFixes > 0 && `${v.hiddenFixes} more fix${v.hiddenFixes > 1 ? 'es' : ''}`}.
        </p>
      )}
      {v.showMessages && entry.messages.length > 0 && (
        <p className="ef-msgs">
          Messages this entry covers:{' '}
          {entry.messages.map((m) => (
            <code key={m}>{m}</code>
          ))}
        </p>
      )}
      {v.showSources && (
        <p className="ef-src">
          Handbook entries: {entry.sources.join(', ')}. Related: {entry.related.join(', ')}.
        </p>
      )}
    </article>
  );
}

/** Lab "error-finder": paste a log excerpt or type a symptom; matching is local, nothing is uploaded. */
export default function ErrorFinder() {
  const uid = useId();
  const level = useLevel();
  const finder = useMemo(() => createFinder(ENTRIES), []);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const results: ErrorMatch[] = useMemo(() => finder.find(text), [finder, text]);
  const searched = text.trim().length > 0;
  const shown = results.slice(0, 5);
  const byCategory = useMemo(() => {
    const m = new Map<string, ErrorEntry[]>();
    for (const e of ENTRIES) m.set(e.category, [...(m.get(e.category) ?? []), e]);
    return [...m.entries()];
  }, []);
  const opened = ENTRIES.find((e) => e.id === open);

  const onFile = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(
        `This file is ${(f.size / 1e6).toFixed(0)} MB. Paste the last lines instead (the end of vasp.out or the scheduler log).`,
      );
      return;
    }
    setText(await f.text());
  };

  return (
    <LabShell
      title="Error finder"
      goal="Paste the end of your log or type what went wrong, and see likely causes and what to try, in order."
      badge="computed"
      onReset={() => {
        setText('');
        setError('');
        setOpen(null);
      }}
      controls={
        <>
          <div className="ef-input">
            <label htmlFor={`${uid}-text`}>Log excerpt or symptom</label>
            <textarea
              id={`${uid}-text`}
              rows={6}
              spellCheck={false}
              value={text}
              placeholder="for example: ZBRENT: fatal error in bracketing"
              onChange={(e) => setText(e.currentTarget.value)}
            />
          </div>
          <div className="ef-input">
            <label htmlFor={`${uid}-file`}>Or open a log file (read in this browser, never uploaded)</label>
            <input id={`${uid}-file`} type="file" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
          </div>
          <div className="ef-row">
            <button type="button" className="btn" onClick={() => setText(EXAMPLE)}>
              Try an example error message
            </button>
          </div>
          {error && (
            <p className="ef-error" role="alert">
              {error}
            </p>
          )}
        </>
      }
      readouts={searched ? [{ label: 'Matches', value: results.length }] : []}
      notice="Exact messages rank first, then routine names such as ZBRENT, then keyword matches. A log with two errors lists both. The fixes are things to try in order; they are from the author's handbooks and are not guaranteed to work."
      description="A text box for a log excerpt, followed by a ranked list of matching error entries. Each entry shows the likely causes and an ordered list of fixes, with INCAR changes where there are any."
    >
      <div className="ef-results" aria-live="polite">
        {!searched && <p>Type or paste above, or browse every entry by category below.</p>}
        {searched && shown.length > 0 && (
          <>
            <p className="ef-count">
              {results.length === 1
                ? '1 entry matches.'
                : `${results.length} entries match; showing the best ${shown.length}.`}
            </p>
            {shown.map((m) => (
              <EntryCard key={m.entry.id} entry={m.entry} level={level} kind={m.kind} line={m.line} />
            ))}
          </>
        )}
        {searched && shown.length === 0 && (
          <p className="ef-none">
            Nothing matched. Try the single most specific line (the one with the routine name), or browse by
            category below.
          </p>
        )}
      </div>
      <div className="ef-browse">
        <h3>Browse by category</h3>
        {byCategory.map(([cat, list]) => (
          <details key={cat} open={searched && shown.length === 0 && cat === 'start'}>
            <summary>
              {CATEGORY_LABELS[cat] ?? cat} ({list.length})
            </summary>
            <ul>
              {list.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="ef-link"
                    aria-pressed={open === e.id}
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                  >
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {opened && <EntryCard entry={opened} level={level} />}
      </div>
    </LabShell>
  );
}
