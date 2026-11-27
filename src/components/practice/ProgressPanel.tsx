import { useRef, useState, useSyncExternalStore } from 'react';
import { milestones, streak } from '../../lib/learning/activity';
import { dayNumber, stateOf } from '../../lib/learning/session';
import { modulePercent, modulesDone } from '../../lib/progress';
import { exportData, importData, resetAll, setHideStreaks } from '../../stores/learner';
import { useLearner } from '../../stores/useLearner';
import { progressServerSnapshot, progressStore } from '../../stores/progress';
import '../ui/Badge.css';
import './practice.css';

interface Props {
  /** Topic ids per module, for the per-module bars and the "first module finished" milestone. */
  modules: string[][];
  /** Display name per entry of `modules`, such as "4. Kohn-Sham and the SCF loop". */
  names?: string[];
  /** Published concept ids, for the "ideas mastered" tile. */
  concepts?: string[];
}

/** Summary tiles, per-module bars, streak (optional), milestones and the data controls. All from this browser. */
export default function ProgressPanel({ modules, names = [], concepts = [] }: Props) {
  const { activity, persisted, learner } = useLearner();
  const progress = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressServerSnapshot,
  );
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = streak(activity.days, dayNumber(Date.now()));
  const done = modulesDone(progress, modules);
  const marks = milestones(activity.answers, done);
  const allIds = modules.flat();
  const topicTotal = allIds.length;
  const topicsDone = progress.completed.filter((id) => allIds.includes(id)).length;
  const mastered = concepts.filter((c) => stateOf(learner, c) === 'mastered').length;

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dft-handbook-progress.json';
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Exported. The file is on your device only.');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = importData(await f.text());
    setMsg(
      r.ok
        ? 'Imported. Your progress was replaced by the file.'
        : `Not imported: ${r.error} Nothing was changed.`,
    );
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="pp stack" data-testid="progress-panel">
      {!persisted && (
        <p className="pr-warn" role="note">
          Your browser is blocking storage, so progress lasts only until you close this tab. Export it to keep
          it.
        </p>
      )}

      <ul className="grid g4 pp-tiles" aria-label="Summary">
        <li className="tile">
          <p className="k">Topics completed</p>
          <p className="v" data-testid="tile-topics">
            {topicsDone}/{topicTotal}
          </p>
          <p className="sub">
            {topicTotal ? Math.round((topicsDone / topicTotal) * 100) : 0}% of the handbook
          </p>
        </li>
        <li className="tile">
          <p className="k">Questions answered</p>
          <p className="v" data-testid="tile-answers">
            {activity.answers}
          </p>
          <p className="sub">Topic checks and practice</p>
        </li>
        <li className="tile">
          <p className="k">Ideas mastered</p>
          <p className="v" data-testid="tile-mastered">
            {mastered}/{concepts.length}
          </p>
          <p className="sub">An estimate from your answers</p>
        </li>
        <li className="tile">
          <p className="k">Practice run</p>
          <p className="v" data-testid="tile-run">
            {activity.hideStreaks ? 'Hidden' : `${run} ${run === 1 ? 'day' : 'days'}`}
          </p>
          <p className="sub">Rest days do not break it</p>
        </li>
      </ul>

      <section className="card" aria-labelledby="pp-modules-h">
        <h2 className="card-h" id="pp-modules-h">
          Modules
          <span className="right pp-muted">
            {done} of {modules.filter((m) => m.length > 0).length} finished
          </span>
        </h2>
        <ul className="module-bars" data-testid="module-bars">
          {modules.map((ids, i) => {
            const pct = ids.length ? modulePercent(progress, ids) : 0;
            const name = names[i] ?? `Module ${i + 1}`;
            return (
              <li key={name}>
                <div className="row">
                  <span>{name}</span>
                  <span>{pct}%</span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid g2">
        <section className="card" aria-labelledby="pp-practice-h">
          <h2 className="card-h" id="pp-practice-h">
            Your practice
            <a className="right btn btn-ghost" href="/practice/">
              Practise now
            </a>
          </h2>
          <p data-testid="answers">
            {activity.answers === 0
              ? 'No answers yet. Questions at the end of each topic, and the practice page, fill this in.'
              : `You have answered ${activity.answers} ${activity.answers === 1 ? 'question' : 'questions'}.`}
          </p>
          {!activity.hideStreaks && (
            <p data-testid="streak">
              {run > 0
                ? `Practice run: ${run} ${run === 1 ? 'day' : 'days'}. One rest day a week is built in, so a break does not end it.`
                : 'Your next answer starts a new run. Rest days are part of learning.'}
            </p>
          )}
          <label className="pp-check">
            <input
              type="checkbox"
              checked={activity.hideStreaks}
              onChange={(e) => setHideStreaks(e.target.checked)}
            />{' '}
            Hide the practice run
          </label>

          <h3 className="pp-sub">Milestones</h3>
          <ul className="pp-marks" data-testid="milestones">
            {marks.map((m) => (
              <li key={m.id} className="row">
                <span className={`badge${m.reached ? ' badge-verified' : ''}`}>
                  {m.reached ? 'Reached' : 'Ahead'}
                </span>
                <span className="sr-only">: </span>
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="pp-data-h">
          <h2 className="card-h" id="pp-data-h">
            Your data
          </h2>
          <p>
            Everything on this page is stored in this browser only. Nothing is uploaded and there is no
            account, unless you turn on the optional sync where it is offered. You can take a copy, bring one
            back, or erase it all.
          </p>
          <div className="qc-actions">
            <button type="button" className="btn btn-primary" onClick={download}>
              Export as JSON
            </button>
            <label className="btn pp-file">
              Import from JSON
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void onFile(e.target.files?.[0])}
                data-testid="import-file"
              />
            </label>
            {!confirm && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
                Erase my progress
              </button>
            )}
          </div>
          {confirm && (
            <div
              role="alertdialog"
              aria-label="Confirm erase"
              className="pr-warn"
              data-testid="confirm-erase"
            >
              <p>
                This erases your answers, estimates, practice run and topic progress on this device. It cannot
                be undone.
              </p>
              <div className="qc-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    resetAll();
                    setConfirm(false);
                    setMsg('Erased. You are starting fresh.');
                  }}
                >
                  Yes, erase everything
                </button>
                <button type="button" className="btn" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p role="status" data-testid="data-msg">
            {msg}
          </p>
        </section>
      </div>
    </div>
  );
}
