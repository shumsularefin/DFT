// Undo and redo as an immutable command stack. Every function returns a new history; nothing is mutated.

export interface Entry<T> {
  state: T;
  /** What the command did, for the UI ("Wrapped 2 atoms into the cell"). */
  description: string;
}
export interface History<T> {
  readonly past: readonly Entry<T>[];
  readonly present: Entry<T>;
  readonly future: readonly Entry<T>[];
  /** Maximum number of undo steps kept; the oldest are dropped first. */
  readonly cap: number;
}

export function createHistory<T>(initial: T, cap = 100, description = 'Start'): History<T> {
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError('The history cap must be a positive integer.');
  return { past: [], present: { state: initial, description }, future: [], cap };
}

/** Record a new state. Any redo steps are discarded, as in every editor. */
export function push<T>(h: History<T>, state: T, description: string): History<T> {
  const past = [...h.past, h.present];
  return {
    past: past.slice(Math.max(0, past.length - h.cap)),
    present: { state, description },
    future: [],
    cap: h.cap,
  };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  const prev = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], cap: h.cap };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  const next = h.future[0]!;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), cap: h.cap };
}

/** The description of the step that undo would revert, or that redo would apply. */
export const undoLabel = <T>(h: History<T>): string | undefined =>
  canUndo(h) ? h.present.description : undefined;
export const redoLabel = <T>(h: History<T>): string | undefined => h.future[0]?.description;
