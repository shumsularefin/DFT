// The side-by-side layout of a topic with a stage (M16.2): Split, Focus 3D and Text only, plus a splitter that sets the
// width of the stage column. Small and free of three.js: it runs as soon as the page loads, before the engine does.
// The choice is remembered per reader (a convenience; the page works the same without storage).
import { splitFraction } from './sync';

export type StageMode = 'split' | 'focus' | 'text';
const KEY_MODE = 'dft:stage-mode';
const KEY_WIDTH = 'dft:stage-width';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: the choice just is not remembered */
  }
}

export function initLayout(stage: HTMLElement, onMode?: (m: StageMode) => void): (m: StageMode) => void {
  const row = stage.closest<HTMLElement>('[data-stage-row]');
  const setMode = (m: StageMode, remember = true) => {
    row?.setAttribute('data-stage-mode', m);
    for (const b of stage.querySelectorAll<HTMLButtonElement>('[data-mode]'))
      b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-stage-show]'))
      b.hidden = m !== 'text';
    if (remember) save(KEY_MODE, m);
    onMode?.(m);
  };
  for (const b of stage.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.addEventListener('click', () => {
      const m = b.dataset.mode as StageMode;
      const current = row?.getAttribute('data-stage-mode');
      setMode(current === m && m !== 'split' ? 'split' : m);
    });
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-stage-show]'))
    b.addEventListener('click', () => setMode('split'));
  const saved = load(KEY_MODE);
  if (saved === 'text' || saved === 'focus') setMode(saved, false);
  else setMode('split', false);
  stage.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && row?.getAttribute('data-stage-mode') === 'focus') setMode('split');
  });

  const split = row?.querySelector<HTMLElement>('[data-stage-splitter]');
  if (row && split) {
    const apply = (f: number, remember: boolean) => {
      row.style.setProperty('--stage-w', `${(f * 100).toFixed(1)}%`);
      split.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      if (remember) save(KEY_WIDTH, f.toFixed(3));
    };
    const w = Number(load(KEY_WIDTH));
    if (w >= 0.28 && w <= 0.66) apply(w, false);
    let dragging = false;
    split.addEventListener('pointerdown', (e) => {
      dragging = true;
      split.setPointerCapture(e.pointerId);
      row.classList.add('is-resizing');
    });
    split.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = row.getBoundingClientRect();
      apply(splitFraction(r.left, r.width, e.clientX), false);
    });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      split.releasePointerCapture(e.pointerId);
      row.classList.remove('is-resizing');
      save(KEY_WIDTH, (Number(split.getAttribute('aria-valuenow')) / 100).toFixed(3));
      window.dispatchEvent(new Event('resize'));
    };
    split.addEventListener('pointerup', end);
    split.addEventListener('pointercancel', end);
    split.addEventListener('keydown', (e) => {
      const now = Number(split.getAttribute('aria-valuenow') || 42) / 100;
      const d = e.key === 'ArrowLeft' ? 0.02 : e.key === 'ArrowRight' ? -0.02 : 0;
      if (e.key === 'Home') apply(0.66, true);
      else if (e.key === 'End') apply(0.28, true);
      else if (d) apply(Math.max(0.28, Math.min(0.66, now + d)), true);
      else return;
      e.preventDefault();
    });
  }
  return setMode;
}
