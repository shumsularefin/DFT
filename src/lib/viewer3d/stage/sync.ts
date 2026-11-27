// Which stage state follows the reader (M16.2, D-115). Pure: the caller measures where each section heading sits.
// The active section is the last one whose heading has scrolled above the line at `line` (0.4 = 40% down the viewport);
// the state is the first one tied to that section. Sections without a state keep the state of the section before them.

export interface SyncState {
  section?: string;
}

/**
 * @param states the stage states in reading order
 * @param tops the top of each section heading relative to the viewport (px), keyed by section id; absent when not on the page
 * @param viewport the viewport height (px)
 * @param order section ids in page order (the order headings appear)
 * @returns the index of the state to show
 */
export function activeState(
  states: readonly SyncState[],
  tops: Readonly<Record<string, number | undefined>>,
  viewport: number,
  order: readonly string[],
  line = 0.4,
): number {
  const limit = viewport * line;
  let current = -1;
  for (let i = 0; i < order.length; i++) {
    const t = tops[order[i]!];
    if (t !== undefined && t <= limit) current = i;
  }
  // walk back from the current section to the nearest one that has a state
  for (let i = current; i >= 0; i--) {
    const k = states.findIndex((s) => s.section === order[i]);
    if (k >= 0) return k;
  }
  return 0;
}

/** Clamp a state index after a step key or a button. */
export const stepState = (n: number, i: number, d: number): number => Math.max(0, Math.min(n - 1, i + d));

/** Width of the stage column after a splitter drag, as a fraction of the row, kept between the limits. */
export function splitFraction(
  rowLeft: number,
  rowWidth: number,
  pointerX: number,
  min = 0.28,
  max = 0.66,
): number {
  if (rowWidth <= 0) return 0.42;
  const stage = (rowLeft + rowWidth - pointerX) / rowWidth;
  return Math.max(min, Math.min(max, stage));
}
