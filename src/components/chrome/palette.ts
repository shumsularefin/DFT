// Command palette. Loaded by dynamic import on first open (see src/scripts/chrome.ts), so none of this
// code or the index counts toward a page's initial JavaScript. Vanilla TypeScript, ARIA combobox + listbox.
import { rankCommands, resolveSlash, SETTINGS_COMMANDS, type Command } from '../../lib/commands';
import { normalizeLevel } from '../../lib/levels';
import { setLevel } from '../../stores/level';
import { clearTheme, setTheme } from '../../stores/theme';

const INDEX_URL = '/data/commands/commands.v1.json';
let index: Promise<Command[]> | undefined;
const loadIndex = () =>
  (index ??= fetch(INDEX_URL)
    .then((r) => (r.ok ? (r.json() as Promise<{ version: number; commands: Command[] }>) : Promise.reject()))
    .then((d) => d.commands)
    .catch(() => []));

let dialog: HTMLDialogElement | undefined;
let input: HTMLInputElement;
let list: HTMLUListElement;
let status: HTMLElement;
let all: Command[] = [];
let shown: Command[] = [];
let active = 0;
let opener: HTMLElement | null = null;

const START_IDS = [
  'route:/handbook/',
  'route:/tools/input-builder/',
  'route:/tools/kpath/',
  'route:/tools/convergence/',
  'route:/glossary/',
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function build() {
  dialog = el('dialog', 'palette');
  dialog.setAttribute('aria-label', 'Command palette');
  const row = el('div', 'palette-row');
  row.append(el('span', 'palette-prompt', '>'));
  input = el('input', 'palette-input');
  input.type = 'text';
  input.placeholder = 'Search pages, tools, tags and terms, or type /';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Command palette');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'palette-list');
  input.setAttribute('aria-autocomplete', 'list');
  row.append(input);
  list = el('ul', 'palette-list');
  list.id = 'palette-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Results');
  status = el('p', 'sr-only');
  status.setAttribute('role', 'status');
  const hint = el(
    'p',
    'palette-hint',
    'Enter opens, arrows move, Esc closes. Try /theme dark or /level pro.',
  );
  dialog.append(row, list, status, hint);
  document.body.append(dialog);

  input.addEventListener('input', render);
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      move(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = shown[active];
      if (c) run(c);
    }
  });
  list.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[data-i]');
    const c = li ? shown[Number(li.dataset.i)] : undefined;
    if (c) run(c);
  });
  // Click on the backdrop closes; the dialog itself covers only the panel.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog!.close();
  });
  dialog.addEventListener('close', () => {
    opener?.focus();
    opener = null;
  });
}

function compute(): Command[] {
  const q = input.value.trim();
  if (!q) {
    const start = START_IDS.map((id) => all.find((c) => c.id === id)).filter((c): c is Command => !!c);
    return [...start, ...SETTINGS_COMMANDS.filter((c) => c.action?.startsWith('theme:'))];
  }
  const pool = [...all, ...SETTINGS_COMMANDS];
  if (q.startsWith('/')) {
    const r = resolveSlash(q, all);
    if (r.kind === 'command') return [r.command];
    return withSearch(rankCommands(pool, r.text), r.text);
  }
  return withSearch(rankCommands(pool, q), q);
}

/** Last row: hand the text to the full-text search in the header (Pagefind). */
function withSearch(found: Command[], text: string): Command[] {
  if (!text) return found;
  return [
    ...found,
    {
      id: 'search',
      title: `Search the handbook text for "${text}"`,
      group: 'Pages',
      keywords: [],
      action: `search:${text}`,
    },
  ];
}

function render() {
  shown = compute();
  active = 0;
  list.replaceChildren();
  shown.forEach((c, i) => {
    const li = el('li', 'palette-opt');
    li.id = `palette-opt-${i}`;
    li.setAttribute('role', 'option');
    li.dataset.i = String(i);
    li.append(
      el('span', 'palette-title', c.title),
      el('span', 'palette-group', `[${c.group.toLowerCase()}]`),
    );
    list.append(li);
  });
  move(0);
  status.textContent = `${shown.length} result${shown.length === 1 ? '' : 's'}`;
}

function move(i: number) {
  if (!shown.length) {
    input.removeAttribute('aria-activedescendant');
    return;
  }
  active = (i + shown.length) % shown.length;
  list
    .querySelectorAll('[role=option]')
    .forEach((li, n) => li.setAttribute('aria-selected', String(n === active)));
  const cur = list.children[active] as HTMLElement | undefined;
  input.setAttribute('aria-activedescendant', cur?.id ?? '');
  cur?.scrollIntoView({ block: 'nearest' });
}

function run(c: Command) {
  if (c.href) {
    location.assign(c.href);
    return;
  }
  const [kind = '', value = ''] = (c.action ?? '').split(/:(.*)/s);
  dialog!.close();
  if (kind === 'level') setLevel(normalizeLevel(value));
  else if (kind === 'theme') {
    if (value === 'light' || value === 'dark') setTheme(value);
    else clearTheme();
  } else if (kind === 'search') {
    const box = document.querySelector<HTMLInputElement>('[data-search-input]');
    document.querySelector<HTMLElement>('[data-menu]')?.setAttribute('data-open', '');
    if (box) {
      box.value = value;
      box.focus();
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

export async function openPalette(from?: HTMLElement | null) {
  if (!dialog) build();
  opener = from ?? (document.activeElement as HTMLElement | null);
  if (dialog!.open) return;
  dialog!.showModal();
  input.value = '';
  all = await loadIndex();
  if (!dialog!.open) return;
  render();
  input.focus();
}
