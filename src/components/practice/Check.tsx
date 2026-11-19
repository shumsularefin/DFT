import { useState } from 'react';
import type { Question } from '../../lib/learning/questions';
import { stateOf, topicMastered } from '../../lib/learning/session';
import { answerQuestion, learnerStore } from '../../stores/learner';
import { useLearner } from '../../stores/useLearner';
import { markComplete } from '../../stores/progress';
import QuestionCard, { type QuestionResult } from './QuestionCard';
import './practice.css';

interface Props {
  questions: Question[];
  topicId?: string;
  topicConcepts?: string[];
  labels?: Record<string, string>;
}

const STATE_TEXT = { new: 'not started', learning: 'learning', mastered: 'mastered' } as const;

/** The questions at the end of a topic, one at a time. Answers update the learner state on this device. */
export default function Check({ questions, topicId, topicConcepts = [], labels = {} }: Props) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { learner, persisted } = useLearner();
  const q = questions[i];
  const last = i >= questions.length;

  const onResult = (r: QuestionResult) => {
    if (!q) return;
    answerQuestion(q, { correct: r.correct, hintsUsed: r.hintsUsed, gaveUp: r.gaveUp });
    if (r.correct) setRight((n) => n + 1);
    if (topicId && topicMastered(learnerStore.getState().learner, topicConcepts)) {
      markComplete(topicId);
      setCompleted(true);
    }
  };

  const restart = () => {
    setI(0);
    setRight(0);
  };

  if (questions.length === 0) return <p>No questions for this topic yet.</p>;
  return (
    <div className="ck" data-testid="check">
      {!persisted && (
        <p className="pr-warn" role="note">
          Your browser is blocking storage, so answers count only until you close this tab.
        </p>
      )}
      {!last && q && (
        <>
          <p className="ck-count">
            Question {i + 1} of {questions.length}. Your answers stay in this browser.
          </p>
          <QuestionCard key={q.id} question={q} onResult={onResult}>
            <div className="ck-next">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setI(i + 1);
                }}
              >
                {i + 1 < questions.length ? 'Next question' : 'See where you are'}
              </button>
            </div>
          </QuestionCard>
        </>
      )}
      {last && (
        <div className="ck-summary" role="status" data-testid="check-summary">
          <p>
            You got {right} of {questions.length} right on this pass. That is a snapshot, not a grade.
          </p>
          {topicConcepts.length > 0 && (
            <ul aria-label="Your estimate for each idea in this topic">
              {topicConcepts.map((c) => (
                <li key={c}>
                  {labels[c] ?? c}: {STATE_TEXT[stateOf(learner, c)]}
                  {learner.concepts[c] ? ` (about ${Math.round(learner.concepts[c]!.pL * 100)}% sure)` : ''}
                </li>
              ))}
            </ul>
          )}
          {completed && <p>You have the ideas in this topic, so it is marked complete.</p>}
          <p className="pr-note">
            The percentages are a rough estimate from a simple model (Bayesian knowledge tracing). They can be
            wrong and never leave your browser.
          </p>
          <button type="button" className="btn" onClick={restart}>
            Go through them again
          </button>{' '}
          <a href="/practice/">Practice more on the practice page</a>
        </div>
      )}
    </div>
  );
}
