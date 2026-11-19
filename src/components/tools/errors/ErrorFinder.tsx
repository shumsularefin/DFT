import { useId, useMemo, useState } from 'react';
import { ERRORS, ERROR_CATEGORIES } from '../../../lib/errors/data';
import { byCategory, findErrors, type ErrorEntry, type ErrorMatch } from '../../../lib/errors/match';
import { useLevel } from '../input-builder/hooks';
import './errors.css';

const MAX_CHARS = 100_000;
const EXAMPLES = [
  'ZBRENT: fatal error in bracketing',
  'BRMIX: very serious problems the old and the new charge density differ',
  'my magnetic moment goes to zero',
  'relaxation never finishes',
];
const SOURCE_NAME = (id: string) =>
  id.startsWith('w-') ? `Workflow Handbook, error row ${Number(id.slice(2))}` : `Field Handbook, ${id}`;

type H = 'h2' | 'h3' | 'h4';
function Entry({
  entry,
  kind,
  level,
  Head,
  Sub,
}: {
  entry: ErrorEntry;
  kind?: ErrorMatch['kind'];
  level: string;
  Head: H;
  Sub: H;
}) {
  const showCauses = level !== 'beginner';
  const pro = level === 'pro';
  return (
    <article className="ef-card" aria-labelledby={`ef-${entry.id}`}>
      <Head id={`ef-${entry.id}`} className="ef-title">
        {entry.title}
      </Head>
      {kind && (
        <p className="ef-kind">
          {kind === 'exact'
            ? 'Matched a message printed by VASP'
            : 'Possible match from your words (check it fits)'}
        </p>
      )}
      <p>{entry.plain}</p>
      {showCauses && (
        <>
          <Sub className="ef-sub">Likely causes, most likely first</Sub>
          <ol>
            {entry.causes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </>
      )}
      <Sub className="ef-sub">What to try, in order</Sub>
      <ol>
        {entry.fixes.map((f) => (
          <li key={f.text}>
            {f.text}
            {showCauses && f.incar && (
              <>
                {' '}
                <code className="ef-incar">
                  {Object.entries(f.incar)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(', ')}
                </code>
              </>
            )}
          </li>
        ))}
      </ol>
      {pro && (
        <>
          <Sub className="ef-sub">Where it shows up</Sub>
          <ul>
            {entry.symptoms.map((s) => (
              <li key={s}>
                <code>{s}</code>
              </li>
            ))}
          </ul>
          <p className="ef-src">Source: {entry.sources.map(SOURCE_NAME).join('; ')}.</p>
        </>
      )}
    </article>
  );
}

/** Error finder: paste a log excerpt or describe a symptom. Matching runs in this page; nothing is uploaded. */
/** `headingLevel` is the level of each result title: 2 on a page whose title is h1, 3 inside a topic section. */
export default function ErrorFinder({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const Head: H = headingLevel === 2 ? 'h2' : 'h3';
  const Sub: H = headingLevel === 2 ? 'h3' : 'h4';
  const level = useLevel();
  const id = useId();
  const [text, setText] = useState('');
  const results = useMemo(() => findErrors(text.slice(0, MAX_CHARS), ERRORS), [text]);
  const groups = useMemo(() => byCategory(ERRORS, ERROR_CATEGORIES), []);
  const typed = text.trim() !== '';

  return (
    <div className="ef">
      <div className="ef-input">
        <label htmlFor={`${id}-t`}>Paste a log excerpt, or describe what you see</label>
        <textarea
          id={`${id}-t`}
          rows={6}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${id}-h`}
          placeholder="For example: ZBRENT: fatal error in bracketing"
        />
        <p id={`${id}-h`} className="ef-note">
          Matching happens in this page. Nothing you paste is uploaded or saved. Your text is checked against
          messages printed by VASP first, then against symptoms described in words.
        </p>
        <div className="ef-examples" role="group" aria-label="Examples to try">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="ef-chip" onClick={() => setText(ex)}>
              {ex.length > 38 ? `${ex.slice(0, 36)}...` : ex}
            </button>
          ))}
          {typed && (
            <button type="button" className="ef-chip" onClick={() => setText('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="ef-results" role="region" aria-live="polite" aria-label="Matches">
        {typed && results.length > 0 && (
          <>
            <p className="ef-count">
              {results.length} possible {results.length === 1 ? 'match' : 'matches'}, best first.
            </p>
            {results.map((r) => (
              <Entry key={r.entry.id} entry={r.entry} kind={r.kind} level={level} Head={Head} Sub={Sub} />
            ))}
          </>
        )}
        {typed && results.length === 0 && (
          <p className="ef-none">
            Nothing matched. VASP prints errors to the screen log (often <code>vasp.out</code> or the
            scheduler log), not to OUTCAR, so check you pasted from there. You can also browse by category
            below.
          </p>
        )}
      </div>

      <details className="ef-browse" open={typed && results.length === 0}>
        <summary>Browse all {ERRORS.length} entries by category</summary>
        {groups.map((g) => (
          <section key={g.id} aria-label={g.label}>
            <Head className="ef-title">{g.label}</Head>
            <ul>
              {g.entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="ef-link"
                    onClick={() => setText(e.messages[0] ?? e.keywords[0] ?? e.title)}
                  >
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </details>
    </div>
  );
}
