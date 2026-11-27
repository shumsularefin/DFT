import { useMemo, useState, type ReactNode } from 'react';
import type { Concept } from '../../lib/learning/graph';
import { choose, pickQuestion, MAX_WRONG_STREAK, type Arm, type Decision } from '../../lib/learning/policy';
import type { Question } from '../../lib/learning/questions';
import { mulberry32 } from '../../lib/learning/random';
import type { LearnerState } from '../../lib/learning/state';
import { MAX_HINTS, buildContext, dueCount, stateOf } from '../../lib/learning/session';
import { answerQuestion, learnerStore } from '../../stores/learner';
import { useLearner } from '../../stores/useLearner';
import { useFigures } from './useFigures';
import QuestionCard, { type QuestionResult } from './QuestionCard';
import './practice.css';

export const SESSION_LENGTH = 10;

interface TopicLink {
  href: string;
  title: string;
}
interface Props {
  bank: Question[];
  concepts: Concept[];
  /** Concept id to the first topic page that teaches it. */
  topics: Record<string, TopicLink>;
  /** "How this works", shown under the session card (Astro slot "how"). */
  how?: ReactNode;
  /** "The three pieces, in plain words", shown under the mastery card (Astro slot "pieces"). */
  pieces?: ReactNode;
}

interface Current {
  q: Question;
  arm: Arm | null;
  why: string;
  startHints: number;
  /** Answers given before this card opened; makes the React key unique per card. */
  n: number;
}
interface Suggestion {
  concept: string;
  q: Question | null;
}

export default function Practice({ bank, concepts, topics, how, pieces }: Props) {
  const { learner, persisted } = useLearner();
  const figures = useFigures(); // starts loading when the page opens, well before the first question
  const label = useMemo(() => Object.fromEntries(concepts.map((c) => [c.id, c.label])), [concepts]);
  const [phase, setPhase] = useState<'start' | 'asking' | 'between' | 'end' | 'suggest'>('start');
  const [cur, setCur] = useState<Current | null>(null);
  const [suggest, setSuggest] = useState<Suggestion | null>(null);
  const [done, setDone] = useState<{ q: Question; correct: boolean; hints: number }[]>([]);
  const [lastWrong, setLastWrong] = useState<{ q: Question; hints: number } | null>(null);
  const [empty, setEmpty] = useState(false);
  const due = dueCount(learner, bank, Date.now());

  const why = (d: Decision, q: Question, prev: Question | undefined): string => {
    const c = label[q.concepts[0] as string] ?? q.concepts[0];
    const after = prev ? ` after ${label[prev.concepts[0] as string] ?? prev.concepts[0]}` : '';
    const base: Record<string, string> = {
      'review-due': `Due for review: you have seen this one before, and now is a good time to check it again.`,
      'new-easy': `An easier question on ${c}${after}, to build confidence.`,
      'new-target': `Next step on ${c}${after}: a question near your current level.`,
      'new-stretch': `A stretch question on ${c}${after}: a little harder than your level.`,
      'suggest-topic': `A question on ${c}, the idea you are ready for next.`,
    };
    const guard = d.guard ? ` ${d.reason}` : '';
    return (d.arm ? (base[d.arm] ?? d.reason) : d.reason) + guard;
  };

  const next = (skipSuggest = false) => {
    const s = learnerStore.getState();
    const prev = done[done.length - 1]?.q;
    const hintAvailable = !!lastWrong && lastWrong.hints < Math.min(MAX_HINTS, lastWrong.q.hints.length);
    const ctx = buildContext({
      learner: s.learner,
      meta: s.meta,
      bank,
      concepts,
      nowMs: Date.now(),
      hintAvailable,
    });
    const rng = mulberry32((Date.now() ^ (done.length * 2654435761)) >>> 0);
    const d = choose(s.meta.bandit, skipSuggest ? { ...ctx, readyConcepts: [] } : ctx, rng);
    if (d.arm === null) {
      setEmpty(true);
      setPhase('end');
      return;
    }
    if (d.arm === 'hint' && lastWrong) {
      setCur({
        q: lastWrong.q,
        arm: 'hint',
        why: `${MAX_WRONG_STREAK} wrong answers in a row, so you get the same question again with a hint.`,
        startHints: lastWrong.hints + 1,
        n: done.length,
      });
      setPhase('asking');
      return;
    }
    if (d.arm === 'suggest-topic' && d.topic) {
      const pool = ctx.candidates.filter((c) => c.concept === d.topic);
      const pick = pickQuestion({ ...ctx, candidates: pool }, 0.7);
      setSuggest({ concept: d.topic, q: bank.find((x) => x.id === pick?.id) ?? null });
      setPhase('suggest');
      return;
    }
    const q = bank.find((x) => x.id === d.questionId);
    if (!q) {
      setEmpty(true);
      setPhase('end');
      return;
    }
    setCur({ q, arm: d.arm, why: why(d, q, prev), startHints: 0, n: done.length });
    setPhase('asking');
  };

  const start = () => {
    setDone([]);
    setLastWrong(null);
    setEmpty(false);
    next();
  };

  const onResult = (r: QuestionResult) => {
    if (!cur) return;
    answerQuestion(cur.q, { correct: r.correct, hintsUsed: r.hintsUsed, gaveUp: r.gaveUp, arm: cur.arm });
    setDone((d) => [...d, { q: cur.q, correct: r.correct, hints: r.hintsUsed }]);
    setLastWrong(r.correct ? null : { q: cur.q, hints: r.hintsUsed });
    setPhase('between');
  };

  const stop = () => setPhase('end');
  const atLimit = done.length >= SESSION_LENGTH;

  const curConcept = cur ? (label[cur.q.concepts[0] as string] ?? cur.q.concepts[0]) : '';
  const shownNo = done.length + (phase === 'asking' ? 1 : 0);

  return (
    <div className="pr-layout grid g2">
      {/* Two columns that each stack their own cards, so a short session card leaves no hole under it. */}
      <div className="pr-col">
        <div className="pr card" data-testid="practice">
          {!persisted && (
            <p className="pr-warn" role="note">
              Your browser is blocking storage, so practice lasts only until you close this tab.
            </p>
          )}
          {phase === 'start' && (
            <div>
              <h2 className="card-h">Start a session</h2>
              <p className="ck-count pr-meta">
                <span>{bank.length} questions</span>
                <span aria-hidden="true">·</span>
                <span>{concepts.length} ideas</span>
                <span aria-hidden="true">·</span>
                <span>Up to {SESSION_LENGTH} per session</span>
              </p>
              <div className="bar pr-bar" aria-hidden="true">
                <span style={{ width: '0%' }} />
              </div>
              <p data-testid="due-count">
                {due === 0
                  ? 'Nothing is due for review right now.'
                  : `${due} ${due === 1 ? 'question is' : 'questions are'} due for review.`}
              </p>
              <p>
                A session is up to {SESSION_LENGTH} questions. Stop any time, there is no timer and no
                schedule to keep.
              </p>
              <button type="button" className="btn btn-primary" onClick={start}>
                Start a short session
              </button>
            </div>
          )}

          {phase === 'suggest' && suggest && (
            <div data-testid="suggestion">
              <h2 className="card-h">Ready for something new</h2>
              <p className="pr-why">
                Why this: you are ready for <strong>{label[suggest.concept] ?? suggest.concept}</strong>,
                which comes next in the handbook.
              </p>
              {topics[suggest.concept] && (
                <p>
                  Read <a href={topics[suggest.concept]!.href}>{topics[suggest.concept]!.title}</a> first if
                  you like.
                </p>
              )}
              <div className="ck-next">
                {suggest.q && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setCur({
                        q: suggest.q as Question,
                        arm: 'suggest-topic',
                        why: `A question on ${label[suggest.concept] ?? suggest.concept}, the idea you are ready for next.`,
                        startHints: 0,
                        n: done.length,
                      });
                      setPhase('asking');
                    }}
                  >
                    Try a question on it
                  </button>
                )}
                <button type="button" className="btn" onClick={() => next(true)}>
                  Show me something else
                </button>
                <button type="button" className="btn btn-ghost" onClick={stop}>
                  Stop for now
                </button>
              </div>
            </div>
          )}

          {(phase === 'asking' || phase === 'between') && cur && (
            <div>
              <p className="ck-count pr-meta">
                <span>
                  Question {shownNo} of up to {SESSION_LENGTH}
                </span>
                <span aria-hidden="true">·</span>
                <span>{curConcept}</span>
                <span aria-hidden="true">·</span>
                <span>Due for review: {due}</span>
              </p>
              <div className="bar pr-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((shownNo / SESSION_LENGTH) * 100)}%` }} />
              </div>
              <p className="pr-why" data-testid="why">
                Why this item: {cur.why} <span>(This is a rule of thumb, not a test.)</span>
              </p>
              <QuestionCard
                key={`${cur.q.id}-${cur.n}`}
                question={cur.q}
                figure={figures?.[cur.q.id]}
                onResult={onResult}
                startHints={cur.startHints}
              >
                <div className="ck-next">
                  {!atLimit && (
                    <button type="button" className="btn btn-primary" onClick={() => next()}>
                      Next question
                    </button>
                  )}
                  <button type="button" className={atLimit ? 'btn btn-primary' : 'btn'} onClick={stop}>
                    {atLimit ? 'Finish the session' : 'Stop for now'}
                  </button>
                </div>
              </QuestionCard>
              {phase === 'asking' && (
                <p className="ck-next">
                  <button type="button" className="btn btn-ghost" onClick={stop}>
                    Stop for now
                  </button>
                </p>
              )}
            </div>
          )}

          {phase === 'end' && (
            <div className="pr-summary" role="status" data-testid="session-summary">
              <h2 className="card-h">Session finished</h2>
              {empty && done.length === 0 && <p>There is nothing to practise right now. Come back later.</p>}
              {done.length > 0 && (
                <>
                  <p>
                    You answered {done.length}, and {done.filter((d) => d.correct).length}{' '}
                    {done.filter((d) => d.correct).length === 1 ? 'was' : 'were'} right. Thanks for
                    practising.
                  </p>
                  <ul aria-label="Ideas you practised">
                    {[...new Set(done.flatMap((d) => d.q.concepts))].map((c) => (
                      <li key={c}>
                        {label[c] ?? c}: {stateOf(learner, c) === 'mastered' ? 'mastered' : 'still learning'}
                        {topics[c] ? (
                          <>
                            {' '}
                            (<a href={topics[c]!.href}>{topics[c]!.title}</a>)
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>{due === 0 ? 'Nothing else is due.' : `${due} still due.`} Come back whenever you like.</p>
              <button type="button" className="btn" onClick={() => setPhase('start')}>
                Back to the start
              </button>
            </div>
          )}
        </div>
        {how}
      </div>

      <div className="pr-col">
        <MasteryCard concepts={concepts} learner={learner} due={due} />
        {pieces}
      </div>
    </div>
  );
}

const STATE_LEVEL = { new: 0, learning: 1, mastered: 3 } as const;

/** The practice page's side card: counts and one row of marks per module, from this browser's estimates. */
function MasteryCard({
  concepts,
  learner,
  due,
}: {
  concepts: Concept[];
  learner: LearnerState;
  due: number;
}) {
  const states = concepts.map((c) => ({ c, s: stateOf(learner, c.id) }));
  const count = (s: string) => states.filter((x) => x.s === s).length;
  const modules = [...new Set(concepts.map((c) => c.module))].sort((a, b) => a - b);
  return (
    <section className="card pr-mastery" aria-labelledby="pr-mastery-h">
      <h2 className="card-h" id="pr-mastery-h">
        Mastery map
        <span className="right pr-muted">{concepts.length} ideas</span>
      </h2>
      <ul className="grid g3 pr-tiles" aria-label="Your ideas">
        <li className="tile">
          <p className="v">{count('mastered')}</p>
          <p className="k">Mastered</p>
        </li>
        <li className="tile">
          <p className="v">{count('learning')}</p>
          <p className="k">Learning</p>
        </li>
        <li className="tile">
          <p className="v">{due}</p>
          <p className="k">Due for review</p>
        </li>
      </ul>
      <ul className="pr-grid">
        {modules.map((m) => {
          const row = states.filter((x) => x.c.module === m);
          const n = (s: string) => row.filter((x) => x.s === s).length;
          return (
            <li key={m}>
              <span className="pr-grid-label">Module {m}</span>
              <span className="pr-cells" aria-hidden="true">
                {row.map((x) => (
                  <i key={x.c.id} data-l={STATE_LEVEL[x.s]} title={`${x.c.label}: ${x.s}`} />
                ))}
              </span>
              <span className="sr-only">
                {n('mastered')} mastered, {n('learning')} learning, {n('new')} not started.
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pr-legend">
        <span>
          <i data-l="0" aria-hidden="true" /> not started
        </span>
        <span>
          <i data-l="1" aria-hidden="true" /> learning
        </span>
        <span>
          <i data-l="3" aria-hidden="true" /> mastered
        </span>
        <a href="/progress/">Full map and your data</a>
      </p>
      <p className="pr-note">Estimates from your answers on this device. A rule of thumb, not a grade.</p>
    </section>
  );
}
