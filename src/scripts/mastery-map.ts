// Colours the mastery map and its list from the learner state on this device, and applies the module filter.
import { learnerStore } from '../stores/learner';
import { stateOf, type MasteryState } from '../lib/learning/session';
import { flowEdgePath, flowLayout } from '../lib/learning/layout';

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

/* Lay the map out for the width it has (and only the ideas the filter shows), so it never needs a
   sideways scrollbar and its height follows what is shown. */
const scroller = document.querySelector<HTMLElement>('[data-map-scroll]');
const svg = scroller?.querySelector<SVGSVGElement>('.map-svg');
const nodes = $$<SVGElement>('.map-node');
const edges = $$<SVGPathElement>('.map-edges path');
const base = nodes.map((el) => ({
  id: el.dataset.concept as string,
  layer: Number(el.dataset.layer),
  row: Number(el.dataset.row),
}));
let current = 'all';
let laidOutFor = '';

function layout(): void {
  if (!scroller || !svg) return;
  const width = scroller.clientWidth;
  if (!width || laidOutFor === `${width}:${current}`) return;
  laidOutFor = `${width}:${current}`;
  const visible = new Set(nodes.filter((el) => el.style.display !== 'none').map((el) => el.dataset.concept!));
  const f = flowLayout(base, width, visible);
  const pos = new Map(f.nodes.map((n) => [n.id, n]));
  for (const el of nodes) {
    const p = pos.get(el.dataset.concept!);
    if (p) el.setAttribute('transform', `translate(${p.x} ${p.y})`);
  }
  for (const el of edges) {
    const a = pos.get(el.dataset.from!);
    const b = pos.get(el.dataset.to!);
    if (a && b) el.setAttribute('d', flowEdgePath(a, b));
  }
  svg.setAttribute('width', String(f.width));
  svg.setAttribute('height', String(f.height));
  svg.setAttribute('viewBox', `0 0 ${f.width} ${f.height}`);
}

function filter(value: string): void {
  const show = (m: string | undefined) => value === 'all' || m === value;
  for (const el of nodes) el.style.display = show(el.dataset.module) ? '' : 'none';
  for (const el of edges) {
    el.style.display = show(el.dataset.fromModule) && show(el.dataset.toModule) ? '' : 'none';
  }
  for (const el of $$<HTMLElement>('[data-module-section]')) el.hidden = !show(el.dataset.moduleSection);
  current = value;
  layout();
}

learnerStore.subscribe(render);
render();
document.querySelector<HTMLSelectElement>('[data-map-filter]')?.addEventListener('change', (e) => {
  filter((e.target as HTMLSelectElement).value);
});

layout();
if (scroller && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layout()).observe(scroller);
