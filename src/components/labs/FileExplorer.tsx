import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { annotate, mergeAnnotations, type Annotation, type FileKind } from '../../lib/vasp/annotate';
import TagCard from '../tools/input-builder/TagCard';
import { useLevel } from '../tools/input-builder/hooks';
import '../tools/input-builder/input-builder.css';
import './FileExplorer.css';

interface Props {
  kind: FileKind;
  text: string;
  /** Extra or replacement annotations; they win over the defaults on the same line. */
  annotations?: Annotation[];
}

/** Shows a VASP file; each annotated line is a button that opens an explanation at the reader's level. */
export default function FileExplorer({ kind, text, annotations }: Props) {
  const level = useLevel();
  const panelId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const lines = useMemo(() => text.replace(/\n$/, '').split(/\r?\n/), [text]);
  const notes = useMemo(() => mergeAnnotations(annotate(kind, text), annotations), [kind, text, annotations]);
  const byLine = useMemo(() => {
    const m = new Map<number, Annotation[]>();
    for (const a of notes) m.set(a.line, [...(m.get(a.line) ?? []), a]);
    return m;
  }, [notes]);
  const order = useMemo(() => [...byLine.keys()].sort((a, b) => a - b), [byLine]);

  const move = (to: number) => {
    const target = order[Math.max(0, Math.min(order.length - 1, to))];
    if (target !== undefined) refs.current.get(target)?.focus();
  };
  const onKey = (e: KeyboardEvent, line: number) => {
    const i = order.indexOf(line);
    const dest: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: order.length - 1 };
    const d = dest[e.key];
    if (d !== undefined) {
      e.preventDefault();
      move(d);
    } else if (e.key === 'Escape' && open !== null) {
      e.preventDefault();
      const was = open;
      setOpen(null);
      refs.current.get(was)?.focus();
    }
  };
  const choose = (line: number) => {
    setOpen(open === line ? null : line);
    setTag(null);
  };

  const shown = open !== null ? (byLine.get(open) ?? []) : [];
  const levelText = (a: Annotation) =>
    level === 'pro'
      ? [a.intermediate ?? a.beginner, a.pro].filter(Boolean).join(' ')
      : level === 'intermediate'
        ? (a.intermediate ?? a.beginner)
        : a.beginner;

  return (
    <div className="fx">
      <figure className="fx-file" style={{ margin: 0 }}>
        <figcaption className="fx-name">{kind}</figcaption>
        <ol className="fx-lines" aria-label={`${kind} lines`}>
          {lines.map((ln, i) => {
            const n = i + 1;
            const has = byLine.has(n);
            return (
              <li key={n}>
                {has ? (
                  <button
                    type="button"
                    className={`fx-row${byLine.get(n)!.some((a) => a.known === false) ? ' is-unknown' : ''}`}
                    ref={(el) => {
                      if (el) refs.current.set(n, el);
                      else refs.current.delete(n);
                    }}
                    aria-expanded={open === n}
                    aria-controls={panelId}
                    onClick={() => choose(n)}
                    onKeyDown={(e) => onKey(e, n)}
                  >
                    <span className="fx-num" aria-hidden="true">
                      {n}
                    </span>
                    <span>{ln || ' '}</span>
                    <span className="sr-only">
                      Line {n}: {byLine.get(n)![0]!.label}
                    </span>
                  </button>
                ) : (
                  <div className="fx-row">
                    <span className="fx-num" aria-hidden="true">
                      {n}
                    </span>
                    <span>{ln || ' '}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </figure>
      <div
        className="fx-panel"
        id={panelId}
        role="region"
        aria-label={`Explanation for ${kind}`}
        aria-live="polite"
      >
        {shown.length === 0 ? (
          <p className="fx-hint">
            {order.length === 0
              ? 'No lines in this file have an explanation yet.'
              : 'Choose a highlighted line to read what it means. Arrow keys move between lines, Enter opens one and Escape closes it.'}
          </p>
        ) : (
          <>
            {shown.map((a, k) => (
              <div key={k}>
                <h3>
                  Line {a.line}: {a.label}
                </h3>
                <p>{levelText(a)}</p>
                {a.why && (
                  <dl>
                    <dt>Why this value</dt>
                    <dd>{a.why}</dd>
                  </dl>
                )}
                {a.whatIf && (
                  <dl>
                    <dt>What if it were different</dt>
                    <dd>{a.whatIf}</dd>
                  </dl>
                )}
                {a.tag && a.known && (
                  <details onToggle={() => setTag(a.tag!)}>
                    <summary>Full tag card for {a.tag}</summary>
                    <TagCard name={tag ?? a.tag} level={level} onSelect={setTag} />
                  </details>
                )}
              </div>
            ))}
            <button
              type="button"
              className="fx-close"
              onClick={() => {
                const was = open;
                setOpen(null);
                if (was !== null) refs.current.get(was)?.focus();
              }}
            >
              Close explanation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
