// Levels are cumulative (D-011): Intermediate shows everything Beginner shows plus more, Pro adds more again.
export const LEVELS = ['beginner', 'intermediate', 'pro'] as const;
export type Level = (typeof LEVELS)[number];

export interface LevelRange {
  /** Visible from this level upward. */
  min?: Level;
  /** Visible up to and including this level. */
  max?: Level;
}

const rank = (l: Level) => LEVELS.indexOf(l);

/** True when content with this range is shown to a reader at `level`. With neither bound it is always shown. */
export function visibleAt(level: Level, { min, max }: LevelRange): boolean {
  if (min && rank(level) < rank(min)) return false;
  if (max && rank(level) > rank(max)) return false;
  return true;
}

/** Levels at which the range is visible, for the `data-visible` attribute the CSS keys on. */
export function visibleLevels(range: LevelRange): Level[] {
  return LEVELS.filter((l) => visibleAt(l, range));
}

/** Anything unrecognised (missing attribute, bad stored value) reads as Beginner. */
export function normalizeLevel(value: unknown): Level {
  return (LEVELS as readonly unknown[]).includes(value) ? (value as Level) : 'beginner';
}
