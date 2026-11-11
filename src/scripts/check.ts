// Enhances every <Check> on a topic page (M6.4): one question at a time, then a summary with the mastery
// estimate per concept. A topic is marked complete when every one of its concepts reaches mastery.
import type { Question } from '../lib/learning/questions';
import { allMastered, learnerStore, recordAnswer } from '../stores/learner';
import { markComplete } from '../stores/progress';
import { askQuestion } from './quiz-ui';

const pct = (p: number) => `${Math.round(p * 100)} %`;

for (const box of document.querySelectorAll<HTMLElement>('[data-check]')) {
  const data = box.querySelector<HTMLScriptElement>('[data-check-data]');
  const live = box.querySelector<HTMLElement>('[data-check-live]');
  if (!data || !live) continue;
  const qs = JSON.parse(data.textContent ?? '[]') as Question[];
  const topicId = box.dataset.topic ?? '';
  const concepts = (box.dataset.concepts ?? '').split(' ').filter(Boolean);
  box.querySelector<HTMLElement>('.check-static')!.hidden = true;
  live.hidden = false;

  const summary = (right: number) => {
    const s = learnerStore.getState().state;
    live.replaceChildren();
    const p = document.createElement('p');
    p.className = 'quiz-summary';
    p.tabIndex = -1;
    p.textContent = `You answered ${right} of ${qs.length} right.`;
    live.append(p);
    if (concepts.length) {
      const h = document.createElement('p');
      h.textContent = 'Mastery estimate for this topic (95 % counts as mastered):';
      const ul = document.createElement('ul');
      ul.className = 'check-mastery';
      for (const c of concepts) {
        const li = document.createElement('li');
        li.textContent = `${c.replaceAll('-', ' ')}: ${pct(s.concepts[c]?.pL ?? 0.3)}`;
        ul.append(li);
      }
      live.append(h, ul);
    }
    const done = document.createElement('p');
    if (topicId && allMastered(concepts)) {
      markComplete(topicId);
      done.textContent = 'All concepts here are mastered, so this topic is marked complete.';
    } else {
      done.textContent = 'Wrong answers come back for review on the practice page, spaced out over days.';
    }
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn';
    again.textContent = 'Try these questions again';
    again.addEventListener('click', () => run(0, 0));
    const practice = document.createElement('a');
    practice.href = '/practice/';
    practice.textContent = 'Go to practice';
    const row = document.createElement('p');
    row.className = 'quiz-actions';
    row.append(again, practice);
    live.append(done, row);
    if (!learnerStore.getState().persisted) {
      const n = document.createElement('p');
      n.textContent =
        'Your browser blocks storage here, so this progress lasts only until you close the page.';
      live.append(n);
    }
    p.focus();
  };

  const run = (i: number, right: number): void => {
    const q = qs[i]!;
    const last = i === qs.length - 1;
    void askQuestion(live, q, {
      position: `Question ${i + 1} of ${qs.length}.`,
      nextLabel: last ? 'See your summary' : 'Next question',
      onNext: () =>
        last ? summary(right + (lastCorrect ? 1 : 0)) : run(i + 1, right + (lastCorrect ? 1 : 0)),
    }).then((r) => {
      lastCorrect = r.correct;
      recordAnswer({
        questionId: q.id,
        concepts: q.concepts,
        difficulty: q.difficulty,
        correct: r.correct,
        hints: r.hints,
        maxHints: q.hints.length,
        gaveUp: r.gaveUp,
        seconds: r.seconds,
      });
    });
  };
  let lastCorrect = false;
  run(0, 0);
}
