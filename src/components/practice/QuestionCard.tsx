import { useEffect, useId, useRef, useState } from 'react';
import { grade, type Question, type Response } from '../../lib/learning/questions';
import './practice.css';

export interface QuestionResult {
  correct: boolean;
  hintsUsed: number;
  gaveUp: boolean;
}

interface Props {
  question: Question;
  /** Called once, when the learner answers or says "I am not sure". */
  onResult: (r: QuestionResult) => void;
  /** Hints already shown before the card opened (a retry with a hint). */
  startHints?: number;
  children?: React.ReactNode;
}

const rotate = (items: string[]) => (items.length < 2 ? items : [...items.slice(1), items[0] as string]);

/** One question: stem, hints on request, an "I am not sure" path, and an explanation for every option. */
export default function QuestionCard({ question: q, onResult, startHints = 0, children }: Props) {
  const uid = useId();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [order, setOrder] = useState<string[]>(() => (q.type === 'order' ? rotate(q.items) : []));
  const [hints, setHints] = useState(Math.min(startHints, q.hints.length));
  const [result, setResult] = useState<(QuestionResult & { partial?: number }) | null>(null);
  const [error, setError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const done = result !== null;
  const finish = (r: QuestionResult & { partial?: number }) => {
    setResult(r);
    onResult({ correct: r.correct, hintsUsed: r.hintsUsed, gaveUp: r.gaveUp });
  };

  const response = (): Response | null => {
    switch (q.type) {
      case 'single':
        return picked.length === 1 ? { type: 'single', index: picked[0] as number } : null;
      case 'multi':
        return picked.length > 0 ? { type: 'multi', indices: picked } : null;
      case 'numeric': {
        const v = Number(text.trim().replace(',', '.'));
        return text.trim() !== '' && Number.isFinite(v) ? { type: 'numeric', value: v } : null;
      }
      case 'order':
        return { type: 'order', items: order };
    }
  };

  const submit = () => {
    const r = response();
    if (!r) {
      setError(q.type === 'numeric' ? 'Type a number first.' : 'Choose an answer first.');
      return;
    }
    setError('');
    const g = grade(q, r);
    finish({ correct: g.correct, partial: g.partial, hintsUsed: hints, gaveUp: false });
  };

  const unsure = () => {
    setError('');
    finish({ correct: false, hintsUsed: hints, gaveUp: true });
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    setOrder(next);
  };

  const toggle = (i: number) =>
    setPicked((p) =>
      q.type === 'single' ? [i] : p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort((a, b) => a - b),
    );

  const verdict = !result
    ? ''
    : result.gaveUp
      ? 'Not sure is fine. Here is the answer, and the question will come back for review.'
      : result.correct
        ? 'Correct.'
        : 'Not quite.';

  return (
    <div className="qc" data-question={q.id}>
      {/* M12.3 fills `visual`; the slot sits above the stem so questions do not shift when it arrives. */}
      {q.visual ? <div className="qc-visual" data-visual-slot /> : null}
      <fieldset className="qc-set" disabled={done}>
        <legend className="qc-stem">{q.prompt}</legend>
        {(q.type === 'single' || q.type === 'multi') && (
          <p className="qc-help" id={`${uid}-h`}>
            {q.type === 'single' ? 'Choose one answer.' : 'Choose every answer that is correct.'}
          </p>
        )}
        {(q.type === 'single' || q.type === 'multi') && (
          <ul className="qc-options" aria-describedby={`${uid}-h`}>
            {q.options.map((o, i) => {
              const on = picked.includes(i);
              return (
                <li key={i} className={`qc-opt${done ? (o.correct ? ' is-right' : ' is-wrong') : ''}`}>
                  <label>
                    <input
                      type={q.type === 'single' ? 'radio' : 'checkbox'}
                      name={`${uid}-o`}
                      checked={on}
                      onChange={() => toggle(i)}
                    />
                    <span>{o.text}</span>
                  </label>
                  {done && (
                    <p className="qc-why">
                      <strong>
                        {o.correct ? 'Correct option' : 'Not correct'}
                        {on ? ' (your choice)' : ''}.
                      </strong>{' '}
                      {o.why}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {q.type === 'numeric' && (
          <div className="qc-num">
            <label htmlFor={`${uid}-n`}>Your answer{q.unit ? ` (in ${q.unit})` : ''}</label>
            <input
              id={`${uid}-n`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        )}
        {q.type === 'order' && (
          <div>
            <p className="qc-help">Put the items in the right order. Use the buttons to move an item.</p>
            <ol className="qc-order">
              {order.map((it, i) => (
                <li key={it}>
                  <span>{it}</span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move "${it}" up`}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    aria-label={`Move "${it}" down`}
                  >
                    Down
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </fieldset>

      {hints > 0 && (
        <ol className="qc-hints" aria-label="Hints">
          {q.hints.slice(0, hints).map((h, i) => (
            <li key={i}>
              <strong>Hint {i + 1}.</strong> {h}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="qc-error">
          {error}
        </p>
      )}

      {!done && (
        <div className="qc-actions">
          <button type="button" className="btn btn-primary" onClick={submit}>
            Check my answer
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setHints((h) => h + 1)}
            disabled={hints >= q.hints.length}
          >
            {q.hints.length === 0
              ? 'No hints for this one'
              : hints >= q.hints.length
                ? 'No more hints'
                : `Show a hint (${hints + 1} of ${q.hints.length})`}
          </button>
          <button type="button" className="btn" onClick={unsure}>
            I am not sure
          </button>
        </div>
      )}

      <div ref={resultRef} tabIndex={-1} role="status" className="qc-result" data-testid="qc-result">
        {result && (
          <>
            <p className={`qc-verdict ${result.correct ? 'is-right' : 'is-wrong'}`}>
              <span aria-hidden="true">{result.correct ? '✓ ' : '✗ '}</span>
              {verdict}
            </p>
            {q.type === 'numeric' && (
              <p>
                The expected value is {q.answer}
                {q.unit ? ` ${q.unit}` : ''}, accepting a difference of up to {q.tolerance}.
              </p>
            )}
            {q.type === 'order' && (
              <ol className="qc-order-key" aria-label="Correct order">
                {q.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            )}
            {result.partial !== undefined && !result.correct && !result.gaveUp && (
              <p>You had {Math.round(result.partial * 100)}% of it right.</p>
            )}
            {children}
          </>
        )}
      </div>
    </div>
  );
}
