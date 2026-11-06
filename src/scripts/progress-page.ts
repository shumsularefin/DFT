// /progress/ (M6.4): paints the build-time mastery map from the learner state, shows the gentle streak and
// milestones, and offers export, import and reset.
import { isMastered } from '../lib/learning/bkt';
import { band } from '../lib/learning/mapLayout';
import { milestones, streak } from '../lib/learning/streak';
import { exportLearner, importLearner, learnerStore, resetLearner, setHideStreak } from '../stores/learner';
import { progressStore } from '../stores/progress';

const $ = <T extends Element>(s: string) => document.querySelector<T>(s);
const raw = $<HTMLScriptElement>('[data-progress-data]');
const { topicsByModule } = JSON.parse(raw?.textContent ?? '{}') as {
  topicsByModule: Record<string, string[]>;
};
const STATE_TEXT = { new: 'Not started', learning: 'In progress', mastered: 'Mastered' } as const;

function paint() {
  const { state, persisted } = learnerStore.getState();
  for (const node of document.querySelectorAll<SVGAElement>('[data-node]')) {
    const id = node.dataset.node!;
    const pL = state.concepts[id]?.pL;
    const b = band(state.concepts[id] ? pL : undefined);
    node.dataset.state = b;
    const text = b === 'new' ? STATE_TEXT.new : `${STATE_TEXT[b]}, ${Math.round(pL! * 100)} %`;
    // The visible text (label, then state) is the link's accessible name.
    node.querySelector('[data-state-text]')!.textContent = text;
    const row = document.querySelector(`[data-row="${id}"]`);
    if (row) {
      row.querySelector('[data-cell-state]')!.textContent = STATE_TEXT[b];
      row.querySelector('[data-cell-pl]')!.textContent =
        b === 'new' ? 'none yet' : `${Math.round(pL! * 100)} %`;
    }
  }

  const completed = new Set(progressStore.getState().completed);
  const modulesDone = Object.values(topicsByModule).filter(
    (ids) => ids.length > 0 && ids.every((id) => completed.has(id)),
  ).length;
  const list = $<HTMLUListElement>('[data-milestones]');
  if (list)
    list.replaceChildren(
      ...milestones(state, modulesDone, isMastered).map((m) => {
        const li = document.createElement('li');
        li.textContent = `${m.label}: ${m.reached ? 'reached' : 'not yet'}`;
        return li;
      }),
    );

  const hide = $<HTMLInputElement>('[data-hide-streak]');
  if (hide) hide.checked = state.settings.hideStreak;
  const st = $<HTMLElement>('[data-streak]');
  if (st) {
    const { days, restDaysUsed } = streak(state.activeDays, Date.now());
    st.hidden = state.settings.hideStreak;
    st.textContent =
      days === 0
        ? 'Practise on any day to start a streak. Rest days are part of learning: one day off in any seven keeps the streak going.'
        : `${days} day${days === 1 ? '' : 's'} of practice in a row${restDaysUsed ? `, with ${restDaysUsed} rest day${restDaysUsed === 1 ? '' : 's'} built in` : ''}. One day off in any seven keeps it going.`;
  }
  const notice = $<HTMLElement>('[data-progress-notice]');
  if (notice && !persisted) {
    notice.hidden = false;
    notice.textContent =
      'Your browser blocks storage here, so this progress lasts only until you close the page.';
  }
}

learnerStore.subscribe(paint);
progressStore.subscribe(paint);
paint();

for (const r of document.querySelectorAll<HTMLInputElement>('input[name="module-filter"]'))
  r.addEventListener('change', () => {
    const m = r.value;
    for (const e of document.querySelectorAll<HTMLElement | SVGElement>(
      '[data-node], [data-row], .map-module',
    ))
      (e as HTMLElement).style.display = m === 'all' || (e as HTMLElement).dataset.module === m ? '' : 'none';
    for (const p of document.querySelectorAll<SVGPathElement>('.map-edges path'))
      p.style.display = m === 'all' ? '' : 'none';
  });

$<HTMLInputElement>('[data-hide-streak]')?.addEventListener('change', (e) =>
  setHideStreak((e.target as HTMLInputElement).checked),
);

const status = $<HTMLElement>('[data-data-status]')!;
$('[data-export]')?.addEventListener('click', () => {
  const blob = new Blob([exportLearner()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dft-handbook-learning.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status.textContent = 'Exported dft-handbook-learning.json.';
});
$<HTMLInputElement>('[data-import]')?.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const err =
    file.size > 5_000_000
      ? 'This file is too large to be a progress export.'
      : importLearner(await file.text());
  status.textContent = err ?? 'Imported and merged with the data already in this browser.';
  input.value = '';
});
const dialog = $<HTMLDialogElement>('[data-reset-dialog]');
$('[data-reset]')?.addEventListener('click', () => dialog?.showModal());
dialog?.addEventListener('close', () => {
  if (dialog.returnValue === 'reset') {
    resetLearner();
    status.textContent = 'All learning data in this browser was reset.';
  }
});
