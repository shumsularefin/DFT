// /practice/ session flow (M6.4): the policy picks each item; up to 10 items per session.
import type { CatalogConcept } from '../lib/learning/catalog';
import { buildGraph } from '../lib/learning/graph';
import { choose, dueQuestions, updateArm, type BankItem, type Choice } from '../lib/learning/policy';
import type { Question } from '../lib/learning/questions';
import { mulberry32 } from '../lib/learning/random';
import { learnerStore, recordAnswer, replaceLearner } from '../stores/learner';
import { askQuestion } from './quiz-ui';

const SESSION = 10;
const root = document.querySelector<HTMLElement>('[data-practice]');
const raw = document.querySelector<HTMLScriptElement>('[data-practice-data]');
if (root && raw) {
  const { concepts, bank } = JSON.parse(raw.textContent ?? '{}') as {
    concepts: CatalogConcept[];
    bank: Question[];
  };
  const graph = buildGraph(
    concepts.map((c) => ({ ...c, summary: '', status: 'published', level: c.level as 'beginner' })),
  );
  const byId = new Map(bank.map((q) => [q.id, q]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const items: BankItem[] = bank.map((q) => ({ id: q.id, concepts: q.concepts, difficulty: q.difficulty }));
  const stage = root.querySelector<HTMLElement>('[data-practice-stage]')!;
  const stats = root.querySelector<HTMLElement>('[data-practice-stats]')!;
  const notice = root.querySelector<HTMLElement>('[data-practice-notice]')!;
  const rng = mulberry32((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);

  const drawStats = () => {
    const s = learnerStore.getState().state;
    const due = dueQuestions(s, { now: Date.now(), bank: items, graph, wrongInARow: 0 }).length;
    const seen = Object.keys(s.questions).filter((id) => byId.has(id)).length;
    stats.textContent = `${due} review${due === 1 ? '' : 's'} due now. ${seen} of ${bank.length} questions seen so far.`;
    if (!learnerStore.getState().persisted) {
      notice.hidden = false;
      notice.textContent =
        'Your browser blocks storage here, so practice progress lasts only until you close the page.';
    }
  };
  drawStats();

  const el = (tag: string, text?: string, cls?: string) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };

  let step = 0;
  let right = 0;
  let wrongInARow = 0;
  let hintFor: string | undefined;

  const end = (why: string) => {
    stage.replaceChildren();
    const p = el('p', `${why} You answered ${right} of the questions in this session right.`);
    p.tabIndex = -1;
    const again = el('button', 'Start another session', 'btn btn-primary') as HTMLButtonElement;
    again.type = 'button';
    again.addEventListener('click', start);
    stage.append(p, again);
    drawStats();
    p.focus();
  };

  const next = (): void => {
    if (step >= SESSION) return end('Session complete.');
    const s = learnerStore.getState().state;
    const c: Choice | null = choose(s, { now: Date.now(), bank: items, graph, wrongInARow, hintFor }, rng);
    if (!c) return end('Nothing to practise right now: every question has been seen and no review is due.');
    step++;
    const stop = el('button', 'Stop the session', 'btn btn-ghost') as HTMLButtonElement;
    stop.type = 'button';
    stop.addEventListener('click', () => end('Session stopped.'));

    if (c.arm === 'suggest-topic') {
      const concept = conceptById.get(c.conceptId);
      stage.replaceChildren();
      const h = el('p', `Item ${step} of up to ${SESSION}. Why this item: ${c.reason}.`, 'practice-topic');
      h.tabIndex = -1;
      const body = el(
        'p',
        `Before more questions, read the topic "${concept?.topicTitle ?? concept?.label}".`,
      );
      const row = el('p', undefined, 'quiz-actions');
      if (concept?.href) {
        const a = el('a', 'Open the topic') as HTMLAnchorElement;
        a.href = concept.href;
        a.className = 'btn btn-primary';
        a.addEventListener('click', () =>
          replaceLearner(updateArm(learnerStore.getState().state, 'suggest-topic', 1)),
        );
        row.append(a);
      }
      const skip = el('button', 'Skip, ask me a question', 'btn') as HTMLButtonElement;
      skip.type = 'button';
      skip.addEventListener('click', () => {
        // Mark the concept as visited so it is not suggested again, and count the skip as no reward.
        const st = updateArm(learnerStore.getState().state, 'suggest-topic', 0);
        if (!st.concepts[c.conceptId])
          st.concepts = {
            ...st.concepts,
            [c.conceptId]: { pL: 0.3, theta: 0, attempts: 0, lastSeen: Date.now(), history: [] },
          };
        replaceLearner(st);
        next();
      });
      row.append(skip, stop);
      stage.append(h, body, row);
      h.focus();
      return;
    }

    const q = byId.get(c.questionId)!;
    const wrap = el('div');
    stage.replaceChildren(wrap, stop);
    void askQuestion(wrap, q, {
      position: `Item ${step} of up to ${SESSION}.`,
      reason: c.reason,
      showHints: c.arm === 'hint' ? 1 : 0,
      nextLabel: step >= SESSION ? 'Finish' : 'Next item',
      onNext: next,
    }).then((r) => {
      recordAnswer({
        questionId: q.id,
        concepts: q.concepts,
        difficulty: q.difficulty,
        correct: r.correct,
        hints: r.hints,
        maxHints: q.hints.length,
        gaveUp: r.gaveUp,
        seconds: r.seconds,
        arm: c.arm,
      });
      if (r.correct) right++;
      wrongInARow = r.correct ? 0 : wrongInARow + 1;
      hintFor = r.correct || c.arm === 'hint' ? undefined : q.id;
      drawStats();
    });
  };

  function start() {
    step = 0;
    right = 0;
    wrongInARow = 0;
    hintFor = undefined;
    next();
  }
  root.querySelector('[data-practice-start]')?.addEventListener('click', start);
}
