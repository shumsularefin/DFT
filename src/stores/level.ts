import { createStore } from 'zustand/vanilla';
import { getJSON, setJSON } from '../lib/storage';
import { normalizeLevel, type Level } from '../lib/levels';

export const levelStore = createStore<{ level: Level }>(() => ({
  level: normalizeLevel(getJSON<unknown>('level', 'beginner')),
}));

/** Change the level: persists it (silently nothing if storage is blocked) and the store notifies the page. */
export function setLevel(level: Level): void {
  levelStore.setState({ level: normalizeLevel(level) });
  setJSON('level', levelStore.getState().level);
}
