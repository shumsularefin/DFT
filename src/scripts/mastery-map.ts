// Colours the mastery map and its list from the learner state on this device, and applies the module filter.
import { learnerStore } from '../stores/learner';
import { stateOf, type MasteryState } from '../lib/learning/session';

const TEXT: Record<MasteryState, string> = { new: 'not started', learning: 'learning', mastered: 'mastered' };
const $$ = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

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
  const sum = document.querySelector('[data-map-summary]');
  if (sum) {
    sum.textContent = `${counts.mastered} mastered, ${counts.learning} learning, ${counts.new} not started, of ${seen.size} ideas.`;
  }
}

function filter(value: string): void {
  const show = (m: string | undefined) => value === 'all' || m === value;
  for (const el of $$<SVGElement>('.map-node')) el.style.display = show(el.dataset.module) ? '' : 'none';
  for (const el of $$<SVGElement>('.map-edges path')) {
    el.style.display = show(el.dataset.fromModule) && show(el.dataset.toModule) ? '' : 'none';
  }
  for (const el of $$<HTMLElement>('[data-module-section]')) el.hidden = !show(el.dataset.moduleSection);
}

learnerStore.subscribe(render);
render();
document.querySelector<HTMLSelectElement>('[data-map-filter]')?.addEventListener('change', (e) => {
  filter((e.target as HTMLSelectElement).value);
});
