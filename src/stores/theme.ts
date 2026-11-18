import { createStore } from 'zustand/vanilla';
import { getJSON, remove, setJSON } from '../lib/storage';

export type Theme = 'light' | 'dark';

const stored = (): Theme | null => {
  const t = getJSON<unknown>('theme', null);
  return t === 'light' || t === 'dark' ? t : null;
};

/** `explicit` is null until the reader chooses; then the system preference decides. */
export const themeStore = createStore<{ explicit: Theme | null }>(() => ({ explicit: stored() }));

export function systemTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const effectiveTheme = (): Theme => themeStore.getState().explicit ?? systemTheme();

export function setTheme(theme: Theme): void {
  themeStore.setState({ explicit: theme });
  setJSON('theme', theme);
}

export function toggleTheme(): void {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

/** Back to following the system preference (the palette's `/theme system`). */
export function clearTheme(): void {
  themeStore.setState({ explicit: null });
  remove('theme');
  delete document.documentElement.dataset.theme;
}
