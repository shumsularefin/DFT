// Client behaviour for the site chrome. Vanilla TypeScript, no framework (D-001). Everything here is an
// enhancement: without JavaScript the page is complete and the .js-only controls stay hidden.
import { LEVELS, normalizeLevel, type Level } from '../lib/levels';
import { modulePercent, percent } from '../lib/progress';
import { levelStore, setLevel } from '../stores/level';
import { effectiveTheme, themeStore, toggleTheme } from '../stores/theme';
import { markComplete, markIncomplete, markVisited, progressStore, resetProgress } from '../stores/progress';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));
const root = document.documentElement;
const topicId = document.querySelector<HTMLElement>('[data-topic-id]')?.dataset.topicId;

/* Level */
const levelButtons = $$<HTMLButtonElement>('[data-level-option]');
function renderLevel() {
  const level = levelStore.getState().level;
  root.dataset.level = level;
  for (const b of levelButtons) {
    const on = b.dataset.levelOption === level;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}
levelStore.subscribe(renderLevel);
renderLevel();
for (const b of levelButtons) {
  b.addEventListener('click', () => setLevel(normalizeLevel(b.dataset.levelOption)));
  b.addEventListener('keydown', (e) => {
    const i = LEVELS.indexOf(levelStore.getState().level);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = LEVELS[(i + step + LEVELS.length) % LEVELS.length] as Level;
    setLevel(next);
    levelButtons.find((x) => x.dataset.levelOption === next)?.focus();
  });
}

/* Theme */
const themeButton = $<HTMLButtonElement>('[data-theme-toggle]');
function renderTheme() {
  const explicit = themeStore.getState().explicit;
  if (explicit) root.dataset.theme = explicit;
  themeButton?.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
}
themeStore.subscribe(renderTheme);
renderTheme();
themeButton?.addEventListener('click', toggleTheme);

/* Progress */
const tracker = $<HTMLElement>('[data-progress-tracker]');
const total = Number(tracker?.dataset.total ?? 0);
const ids = (tracker?.dataset.ids ?? '').split(',').filter(Boolean);
function renderProgress() {
  const p = progressStore.getState();
  const pct = percent(p, total, ids);
  const done = p.completed.filter((id) => ids.includes(id)).length;
  $<HTMLElement>('[data-progress-fill]')!.style.width = `${pct}%`;
  const text = `${done} of ${total}`;
  const count = $('[data-progress-count]');
  if (count) count.textContent = text;
  const summary = $('[data-progress-summary]');
  if (summary) summary.textContent = `${text} topics completed.`;
  for (const li of $$<HTMLElement>('[data-topic-item]')) {
    const isDone = p.completed.includes(li.dataset.topicItem!);
    $<HTMLElement>('.tick', li)!.hidden = !isDone;
  }
  for (const el of $$<HTMLElement>('[data-module-pct]')) {
    const ids = (el.dataset.moduleIds ?? '').split(',').filter(Boolean);
    el.textContent = ids.length ? `${modulePercent(p, ids)}%` : '';
  }
  const mark = $<HTMLButtonElement>('[data-mark-complete]');
  if (mark && topicId) {
    const isDone = p.completed.includes(topicId);
    mark.setAttribute('aria-pressed', String(isDone));
    mark.textContent = isDone ? 'Completed. Undo' : 'Mark complete';
  }
}
progressStore.subscribe(renderProgress);
if (topicId) markVisited(topicId);
renderProgress();
$('[data-mark-complete]')?.addEventListener('click', toggleComplete);
function toggleComplete() {
  if (!topicId) return;
  if (progressStore.getState().completed.includes(topicId)) markIncomplete(topicId);
  else markComplete(topicId);
}
const resetBtn = $<HTMLButtonElement>('[data-progress-reset]');
const confirmBox = $<HTMLElement>('[data-progress-confirm]');
resetBtn?.addEventListener('click', () => {
  resetBtn.hidden = true;
  confirmBox!.hidden = false;
  $<HTMLButtonElement>('[data-progress-reset-no]')!.focus();
});
function closeConfirm() {
  confirmBox!.hidden = true;
  resetBtn!.hidden = false;
  resetBtn!.focus();
}
$('[data-progress-reset-no]')?.addEventListener('click', closeConfirm);
$('[data-progress-reset-yes]')?.addEventListener('click', () => {
  resetProgress();
  closeConfirm();
});

/* Mobile menu */
const menuBtn = $<HTMLButtonElement>('[data-menu-button]');
const menu = $<HTMLElement>('[data-menu]');
function setMenu(open: boolean, focus = true) {
  if (!menuBtn || !menu) return;
  menu.toggleAttribute('data-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  if (!focus) return;
  if (open) menu.querySelector<HTMLElement>('a, button, input')?.focus();
  else menuBtn.focus();
}
menuBtn?.addEventListener('click', () => setMenu(menu!.getAttribute('data-open') === null));

/* Sidebar: open on wide screens only, so phones start with a short page */
const sidebar = $<HTMLDetailsElement>('[data-sidebar]');
if (sidebar && matchMedia('(min-width: 64rem)').matches) sidebar.open = true;

/* Help dialog */
const help = $<HTMLDialogElement>('[data-help-dialog]');
$('[data-help-open]')?.addEventListener('click', () => help?.showModal());
$('[data-help-close]')?.addEventListener('click', () => help?.close());

/* Search (Pagefind loads on first focus) */
const searchInput = $<HTMLInputElement>('[data-search-input]');
const panel = $<HTMLElement>('[data-search-results]');
const list = $<HTMLElement>('[data-search-list]');
const status = $<HTMLElement>('[data-search-status]');
type PagefindApi = {
  search(q: string): Promise<{ results: { data(): Promise<PagefindHit> }[] }>;
};
interface PagefindHit {
  url: string;
  excerpt: string;
  meta: { title?: string; module?: string; levels?: string };
}
let pagefind: Promise<PagefindApi> | undefined;
// The index exists only in a built site; the variable keeps the bundler from trying to resolve it.
const PAGEFIND_URL = '/pagefind/pagefind.js';
const loadPagefind = () => (pagefind ??= import(/* @vite-ignore */ PAGEFIND_URL) as Promise<PagefindApi>);

/** Pagefind excerpts are our own text with <mark> tags; escape everything else before showing it. */
function safeExcerpt(html: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const [i, part] of html.split(/<\/?mark>/).entries()) {
    if (!part) continue;
    const text = new DOMParser().parseFromString(part, 'text/html').documentElement.textContent ?? '';
    if (i % 2 === 1) {
      const m = document.createElement('mark');
      m.textContent = text;
      frag.append(m);
    } else frag.append(text);
  }
  return frag;
}

let seq = 0;
async function runSearch(q: string) {
  if (!panel || !list || !status) return;
  const mine = ++seq;
  if (q.trim().length < 2) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  status.textContent = 'Searching...';
  list.replaceChildren();
  try {
    const pf = await loadPagefind();
    const res = await pf.search(q);
    const hits = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
    if (mine !== seq) return;
    status.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'No results.';
    const groups = new Map<string, PagefindHit[]>();
    for (const h of hits) {
      const key = h.meta.module ?? 'Other';
      groups.set(key, [...(groups.get(key) ?? []), h]);
    }
    for (const [name, items] of groups) {
      const h = document.createElement('p');
      h.className = 'search-group';
      h.textContent = name;
      list.append(h);
      for (const hit of items) {
        const a = document.createElement('a');
        a.className = 'search-hit';
        a.href = hit.url;
        const t = document.createElement('strong');
        t.textContent = hit.meta.title ?? hit.url;
        const ex = document.createElement('small');
        ex.append(safeExcerpt(hit.excerpt));
        a.append(t, ex);
        if (hit.meta.levels) {
          const lv = document.createElement('small');
          lv.textContent = hit.meta.levels;
          a.append(lv);
        }
        list.append(a);
      }
    }
  } catch {
    if (mine !== seq) return;
    status.textContent = 'Search is available in the built site (npm run build).';
  }
}
searchInput?.addEventListener('focus', () => void loadPagefind().catch(() => {}), { once: true });
searchInput?.addEventListener('input', () => void runSearch(searchInput.value));
$('[data-search-form]')?.addEventListener('submit', (e) => e.preventDefault());
document.addEventListener('click', (e) => {
  if (panel && !panel.hidden && !(e.target as Element).closest('[data-search]')) panel.hidden = true;
});

/* Keyboard shortcuts (documented in the help dialog) */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (panel && !panel.hidden) {
      panel.hidden = true;
      searchInput?.focus();
    } else if (menu?.hasAttribute('data-open')) setMenu(false);
    return;
  }
  const t = e.target as HTMLElement;
  if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === '/') {
    e.preventDefault();
    if (menu && !menu.hasAttribute('data-open') && menuBtn?.offsetParent) setMenu(true, false);
    searchInput?.focus();
  } else if (e.key === '?') help?.showModal();
  else if (e.key === 't') toggleTheme();
  else if (e.key === 'm') toggleComplete();
  else if (['1', '2', '3'].includes(e.key)) setLevel(LEVELS[Number(e.key) - 1] as Level);
});
