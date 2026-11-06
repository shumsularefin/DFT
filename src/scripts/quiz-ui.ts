// One interactive question (M6.4), shared by the topic <Check> and /practice/. Vanilla DOM, no framework,
// so it fits the content-page budget. Everything is keyboard operable with native controls.
import { grade, type Response } from '../lib/learning/grade';
import type { Question } from '../lib/learning/questions';
import { mulberry32 } from '../lib/learning/random';

export interface QuizResult {
  correct: boolean;
  hints: number;
  gaveUp: boolean;
  seconds: number;
}

let uid = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A stable shuffle per question, never equal to the correct order when there are two or more items. */
function shuffled(q: Question, n: number): number[] {
  let h = 0;
  for (const ch of q.id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const r = mulberry32(h);
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift()!);
  return idx;
}

/**
 * Renders `q` into `root` and resolves when the learner has answered (or chosen "I am not sure").
 * After that, explanations for every option are shown and `next` (if given) becomes the Next button.
 */
export function askQuestion(
  root: HTMLElement,
  q: Question,
  opts: {
    position?: string;
    nextLabel?: string;
    onNext?: () => void;
    reason?: string;
    showHints?: number;
  } = {},
): Promise<QuizResult> {
  const id = `quiz-${++uid}`;
  const started = performance.now();
  root.replaceChildren();
  const form = el('form', { class: 'quiz', novalidate: '' });
  const fs = el('fieldset', { class: 'quiz-fieldset' });
  const legend = el('legend', { class: 'quiz-prompt' });
  if (opts.position) legend.append(el('span', { class: 'quiz-position' }, opts.position + ' '));
  legend.append(q.prompt);
  fs.append(legend);
  if (opts.reason) fs.append(el('p', { class: 'quiz-reason' }, `Why this question: ${opts.reason}.`));

  const inputs: HTMLInputElement[] = [];
  let order: number[] = [];
  const orderList = el('ol', { class: 'quiz-order' });

  if (q.type === 'single' || q.type === 'multi') {
    const list = el('div', { class: 'quiz-options' });
    q.options.forEach((o, i) => {
      const lab = el('label', { class: 'quiz-option' });
      const input = el('input', {
        type: q.type === 'single' ? 'radio' : 'checkbox',
        name: id,
        value: String(i),
      });
      inputs.push(input);
      lab.append(input, el('span', {}, o.text));
      list.append(lab);
    });
    if (q.type === 'multi') fs.append(el('p', { class: 'quiz-help' }, 'Choose every answer that applies.'));
    fs.append(list);
  } else if (q.type === 'numeric') {
    const lab = el(
      'label',
      { class: 'quiz-numeric', for: `${id}-n` },
      `Your answer${q.unit ? ` (${q.unit})` : ''}`,
    );
    const input = el('input', { id: `${id}-n`, type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    inputs.push(input);
    fs.append(lab, input);
  } else {
    order = shuffled(q, q.options.length);
    fs.append(el('p', { class: 'quiz-help' }, 'Put the items in order with the Up and Down buttons.'));
    const draw = () => {
      orderList.replaceChildren(
        ...order.map((oi, pos) => {
          const li = el('li', { class: 'quiz-order-item' });
          li.append(el('span', {}, q.options[oi]!.text));
          const up = el('button', { type: 'button', 'aria-label': `Move "${q.options[oi]!.text}" up` }, 'Up');
          const down = el(
            'button',
            { type: 'button', 'aria-label': `Move "${q.options[oi]!.text}" down` },
            'Down',
          );
          up.disabled = pos === 0;
          down.disabled = pos === order.length - 1;
          const move = (d: number) => {
            [order[pos], order[pos + d]] = [order[pos + d]!, order[pos]!];
            draw();
            (
              orderList.children[pos + d]?.querySelector(
                d < 0 ? 'button' : 'button:last-child',
              ) as HTMLElement | null
            )?.focus();
          };
          up.addEventListener('click', () => move(-1));
          down.addEventListener('click', () => move(1));
          li.append(up, down);
          return li;
        }),
      );
    };
    draw();
    fs.append(orderList);
  }
  form.append(fs);

  const hintsBox = el('div', { class: 'quiz-hints', 'aria-live': 'polite' });
  const message = el('p', { class: 'quiz-message', role: 'status' });
  const actions = el('div', { class: 'quiz-actions' });
  const check = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Check answer');
  const hintBtn = el('button', { type: 'button', class: 'btn' });
  const unsure = el('button', { type: 'button', class: 'btn btn-ghost' }, 'I am not sure');
  actions.append(check, hintBtn, unsure);
  form.append(hintsBox, actions, message);
  const feedback = el('div', { class: 'quiz-feedback', tabindex: '-1' });
  root.append(form, feedback);

  let hints = 0;
  const drawHintBtn = () => {
    const left = q.hints.length - hints;
    hintBtn.textContent = left > 0 ? `Show a hint (${left} left)` : 'No more hints';
    hintBtn.disabled = left === 0;
  };
  const showHint = () => {
    if (hints >= q.hints.length) return;
    hintsBox.append(el('p', { class: 'quiz-hint' }, `Hint ${hints + 1}: ${q.hints[hints]}`));
    hints++;
    drawHintBtn();
  };
  drawHintBtn();
  hintBtn.addEventListener('click', showHint);
  for (let i = 0; i < (opts.showHints ?? 0); i++) showHint();

  const response = (): Response | string => {
    if (q.type === 'single') {
      const i = inputs.findIndex((x) => x.checked);
      return i < 0 ? 'Choose an answer first, or press "I am not sure".' : { type: 'single', choice: i };
    }
    if (q.type === 'multi') {
      const choices = inputs.flatMap((x, i) => (x.checked ? [i] : []));
      return choices.length
        ? { type: 'multi', choices }
        : 'Choose at least one answer, or press "I am not sure".';
    }
    if (q.type === 'numeric') {
      const v = Number(inputs[0]!.value.trim().replace(',', '.'));
      return inputs[0]!.value.trim() === '' || !Number.isFinite(v)
        ? 'Type a number, for example 1.5.'
        : { type: 'numeric', value: v };
    }
    return { type: 'order', order: order.slice() };
  };

  return new Promise((resolve) => {
    const finish = (correct: boolean, gaveUp: boolean) => {
      fs.disabled = true;
      actions.remove();
      message.textContent = '';
      feedback.replaceChildren(explain(q, correct, gaveUp));
      if (opts.onNext) {
        const next = el(
          'button',
          { type: 'button', class: 'btn btn-primary quiz-next' },
          opts.nextLabel ?? 'Next question',
        );
        next.addEventListener('click', opts.onNext);
        feedback.append(next);
      }
      feedback.focus();
      resolve({ correct, hints, gaveUp, seconds: (performance.now() - started) / 1000 });
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = response();
      if (typeof r === 'string') {
        message.textContent = r;
        return;
      }
      finish(grade(q, r).correct, false);
    });
    unsure.addEventListener('click', () => finish(false, true));
  });
}

function explain(q: Question, correct: boolean, gaveUp: boolean): HTMLElement {
  const box = el('div', { class: `quiz-result ${correct ? 'is-correct' : 'is-wrong'}` });
  const head = el('p', { class: 'quiz-verdict' });
  head.append(
    el('span', { class: 'quiz-mark', 'aria-hidden': 'true' }, correct ? '✓' : '○'),
    correct ? 'Correct.' : gaveUp ? 'No problem, here is the answer.' : 'Not quite.',
  );
  box.append(head);
  if (q.type === 'numeric') {
    box.append(
      el('p', {}, `The answer is ${q.answer}${q.unit ? ` ${q.unit}` : ''} (within ${q.tolerance}).`),
    );
  } else {
    if (q.type === 'order') box.append(el('p', {}, 'The correct order is:'));
    const list = el(q.type === 'order' ? 'ol' : 'ul', { class: 'quiz-explanations' });
    for (const o of q.options) {
      const li = el('li', { class: o.correct || q.type === 'order' ? 'opt-right' : 'opt-wrong' });
      const tag = q.type === 'order' ? '' : o.correct ? 'Right answer: ' : 'Not this one: ';
      li.append(el('strong', {}, `${tag}${o.text}.`), ' ', o.why);
      list.append(li);
    }
    box.append(list);
  }
  return box;
}
