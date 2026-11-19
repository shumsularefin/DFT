import { useRef, useState, useSyncExternalStore } from 'react';
import { milestones, streak } from '../../lib/learning/activity';
import { dayNumber } from '../../lib/learning/session';
import { modulesDone } from '../../lib/progress';
import { exportData, importData, resetAll, setHideStreaks } from '../../stores/learner';
import { useLearner } from '../../stores/useLearner';
import { progressStore } from '../../stores/progress';
import './practice.css';

interface Props {
  /** Topic ids per module, for the "first module finished" milestone. */
  modules: string[][];
}

/** Streak (optional), milestones and the data controls: export, import, erase. */
export default function ProgressPanel({ modules }: Props) {
  const { activity, persisted } = useLearner();
  const progress = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressStore.getState,
  );
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = streak(activity.days, dayNumber(Date.now()));
  const marks = milestones(activity.answers, modulesDone(progress, modules));

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
    <div className="pp" data-testid="progress-panel">
      {!persisted && (
        <p className="pr-warn" role="note">
          Your browser is blocking storage, so progress lasts only until you close this tab. Export it to keep
          it.
        </p>
      )}

      <h2>Your practice</h2>
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

      <h3>Milestones</h3>
      <ul data-testid="milestones">
        {marks.map((m) => (
          <li key={m.id}>
            {m.reached ? 'Reached' : 'Ahead'}: {m.label}
          </li>
        ))}
      </ul>

      <h2>Your data</h2>
      <p>
        Everything above is stored in this browser only. Nothing is uploaded and there is no account, unless
        you turn on the optional sync where it is offered. You can take a copy, bring one back, or erase it
        all.
      </p>
      <div className="qc-actions">
        <button type="button" className="btn" onClick={download}>
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
          <button type="button" className="btn" onClick={() => setConfirm(true)}>
            Erase my progress
          </button>
        )}
      </div>
      {confirm && (
        <div role="alertdialog" aria-label="Confirm erase" className="pr-warn" data-testid="confirm-erase">
          <p>
            This erases your answers, estimates, practice run and topic progress on this device. It cannot be
            undone.
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
    </div>
  );
}
