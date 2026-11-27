// Colours the mastery map and its list from the learner state on this device, applies the module filter,
// and lights up an idea's prerequisites and dependents when it is pointed at or focused.
import { learnerStore } from '../stores/learner';
import { stateOf, type MasteryState } from '../lib/learning/session';

const TEXT: Record<MasteryState, string> = { new: 'not started', learning: 'learning', mastered: 'mastered' };
const $$ = <T extends Element>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];

const lanes = document.querySelector<HTMLElement>('.map-lanes');
const nodes = lanes ? $$<HTMLElement>('.map-node', lanes) : [];

function render(): void {
  const { learner } = learnerStore.getState();
  const counts: Record<MasteryState, number> = { new: 0, learning: 0, mastered: 0 };
  const seen = new Set<string>();
  for (const el of $$<HTMLElement>('[data-concept]')) {
    const id = el.dataset.concept as string;
    const st = stateOf(learner, id);
    el.dataset.state = st;
    if (el.tagName.toLowerCase() === 'li') {
      const s = el.querySelector('.map-state');
      if (s) s.textContent = ` (${TEXT[st]})`;
      if (!seen.has(id)) {
        seen.add(id);
        counts[st] += 1;
      }
    } else {
      const base = (el.getAttribute('aria-label') ?? '').replace(/, (not started|learning|mastered)$/, '');
      el.setAttribute('aria-label', `${base}, ${TEXT[st]}`);
    }
  }
  for (const lane of $$<HTMLElement>('[data-module-lane]')) {
    const own = $$<HTMLElement>('.map-node', lane);
    const done = own.filter((n) => n.dataset.state === 'mastered').length;
    const out = lane.querySelector('[data-lane-count]');
    if (out) out.textContent = `${done} of ${own.length} mastered`;
  }
  const sum = document.querySelector('[data-map-summary]');
  if (sum) {
    sum.textContent = `${counts.mastered} mastered, ${counts.learning} learning, ${counts.new} not started, of ${seen.size} ideas.`;
  }
}

function filter(value: string): void {
  const show = (m: string | undefined) => value === 'all' || m === value;
  for (const el of $$<HTMLElement>('[data-module-lane]')) el.hidden = !show(el.dataset.moduleLane);
  for (const el of $$<HTMLElement>('[data-module-section]')) el.hidden = !show(el.dataset.moduleSection);
}

/* Relations: data-pre lists an idea's prerequisites; dependents are worked out once here. */
const pre = new Map(nodes.map((n) => [n.dataset.concept!, (n.dataset.pre ?? '').split(' ').filter(Boolean)]));
const post = new Map<string, string[]>();
for (const [id, ps] of pre) for (const p of ps) post.set(p, [...(post.get(p) ?? []), id]);

function clear(): void {
  if (!lanes) return;
  delete lanes.dataset.focus;
  for (const n of nodes) delete n.dataset.rel;
}
function light(el: HTMLElement): void {
  if (!lanes) return;
  clear();
  const id = el.dataset.concept!;
  const mark = (ids: string[] | undefined, rel: string) => {
    for (const n of nodes) if (ids?.includes(n.dataset.concept!)) n.dataset.rel = rel;
  };
  mark(pre.get(id), 'pre');
  mark(post.get(id), 'post');
  el.dataset.rel = 'self';
  lanes.dataset.focus = id;
}

learnerStore.subscribe(render);
render();
document.querySelector<HTMLSelectElement>('[data-map-filter]')?.addEventListener('change', (e) => {
  filter((e.target as HTMLSelectElement).value);
});
for (const n of nodes) {
  n.addEventListener('pointerenter', () => light(n));
  n.addEventListener('focus', () => light(n));
  n.addEventListener('blur', clear);
}
lanes?.addEventListener('pointerleave', clear);
