import { createStore } from 'zustand/vanilla';
import { getJSON, remove, setJSON } from '../lib/storage';
import { complete, emptyProgress, parseProgress, uncomplete, visit, type Progress } from '../lib/progress';

export const progressStore = createStore<Progress>(() => parseProgress(getJSON<unknown>('progress', null)));

const commit = (next: Progress) => {
  if (next === progressStore.getState()) return;
  progressStore.setState(next, true);
  setJSON('progress', next);
};
const now = () => new Date().toISOString();

export const markVisited = (id: string) => commit(visit(progressStore.getState(), id, now()));
export const markComplete = (id: string) => commit(complete(progressStore.getState(), id, now()));
export const markIncomplete = (id: string) => commit(uncomplete(progressStore.getState(), id, now()));

export function resetProgress(): void {
  progressStore.setState(emptyProgress(), true);
  remove('progress');
}
