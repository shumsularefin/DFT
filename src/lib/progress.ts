// Reading progress: pure functions over a small serialisable state (storage.ts persists it).
export interface Progress {
  /** Topic ids the reader has opened. */
  visited: string[];
  /** Topic ids marked complete (and, from M6.4, mastered through quizzes). */
  completed: string[];
  /** ISO timestamp of the last change; the later one wins nothing, it only orders merges for display. */
  updated: string;
}

export const emptyProgress = (): Progress => ({ visited: [], completed: [], updated: '' });

const add = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export function visit(p: Progress, id: string, now: string): Progress {
  return p.visited.includes(id) ? p : { ...p, visited: add(p.visited, id), updated: now };
}

export function complete(p: Progress, id: string, now: string): Progress {
  if (p.completed.includes(id)) return p;
  return { ...p, visited: add(p.visited, id), completed: add(p.completed, id), updated: now };
}

export function uncomplete(p: Progress, id: string, now: string): Progress {
  if (!p.completed.includes(id)) return p;
  return { ...p, completed: p.completed.filter((x) => x !== id), updated: now };
}

/** Whole-number percent of `total` topics completed, 0 when there are none. Ids not in `known` are ignored. */
export function percent(p: Progress, total: number, known?: readonly string[]): number {
  if (total <= 0) return 0;
  const done = known ? p.completed.filter((id) => known.includes(id)).length : p.completed.length;
  return Math.min(100, Math.round((done / total) * 100));
}

/** Percent complete within one module, given that module's topic ids. */
export function modulePercent(p: Progress, moduleIds: readonly string[]): number {
  return percent(p, moduleIds.length, moduleIds);
}

/** Union of two states (for the optional sync in M6.5): nothing a reader did on either side is lost. */
export function merge(a: Progress, b: Progress): Progress {
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    visited: union(a.visited, b.visited),
    completed: union(a.completed, b.completed),
    updated: a.updated > b.updated ? a.updated : b.updated,
  };
}

/** Defensive read of whatever was stored: anything malformed becomes an empty state. */
export function parseProgress(value: unknown): Progress {
  const v = value as Partial<Progress> | null;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  if (!v || typeof v !== 'object') return emptyProgress();
  return {
    visited: ids(v.visited),
    completed: ids(v.completed),
    updated: typeof v.updated === 'string' ? v.updated : '',
  };
}
