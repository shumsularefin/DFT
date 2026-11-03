// Map run folder or file labels to a numeric setting, and order runs by cost. Pure.
// @source S-042 (convergence series naming used in the workflow handbook)
export type SeriesKind = 'encut' | 'kresolution' | 'kmesh';

export interface SeriesLabel {
  kind: SeriesKind;
  x: number;
}

/** `encut_450` gives 450; `kpt_0.04` gives resolution 0.04; `k8x8x8` gives 8. Returns null when the label is not recognised. */
export function parseSeriesLabel(label: string): SeriesLabel | null {
  const base = label.split(/[\\/]/).filter(Boolean).pop() ?? label;
  let m = /encut[_-]?(\d+(?:\.\d+)?)/i.exec(base);
  if (m) return { kind: 'encut', x: Number(m[1]) };
  m = /kpt[_-]?(\d*\.?\d+)/i.exec(base);
  if (m) return { kind: 'kresolution', x: Number(m[1]) };
  m = /(?:^|[^a-z])k(\d+)x(\d+)x(\d+)/i.exec(base);
  if (m) return { kind: 'kmesh', x: Number(m[1]) };
  return null;
}

/** Cheapest first: ENCUT ascending, k resolution descending (a smaller spacing costs more), mesh size ascending. */
export function orderByCost<T extends { x: number }>(points: readonly T[], kind: SeriesKind): T[] {
  const sign = kind === 'kresolution' ? -1 : 1;
  return [...points].sort((a, b) => sign * (a.x - b.x));
}
