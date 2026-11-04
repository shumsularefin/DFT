// Colours for atoms and orbits (M5.5) and the contrast check that guards them.
// @source S-057 (Okabe-Ito colour-blind-safe palette), S-056 (WCAG 2.1 relative luminance and contrast ratio)

/** Okabe-Ito order. Colours are assigned to elements by order of first appearance, so colour never carries chemistry. */
export const ATOM_PALETTE: readonly string[] = [
  '#0072b2',
  '#d55e00',
  '#009e73',
  '#cc79a7',
  '#f0e442',
  '#56b4e9',
  '#e69f00',
  '#595959',
];

/** Page backgrounds the colours are drawn against (the `bg` token of each theme, src/styles/tokens.css). */
export const LIGHT_BG = '#ffffff';
export const DARK_BG = '#0e1218';

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new RangeError(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 black to 1 white). */
export function relativeLuminance(hex: string): number {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The lowest contrast of a colour against the two page backgrounds. */
export const worstContrast = (hex: string): number =>
  Math.min(contrastRatio(hex, LIGHT_BG), contrastRatio(hex, DARK_BG));

/**
 * Colour for the i-th distinct element. Several palette colours stay below 3:1 against one of the two page backgrounds
 * (yellow, sky blue and orange on white, grey on dark), so the scenes draw every atom with a thin outline in the text
 * colour, and the legend always names the element: colour is never the only cue (WCAG 1.4.1, 1.4.11).
 */
export const atomColor = (index: number): string => ATOM_PALETTE[index % ATOM_PALETTE.length]!;

/** Colours of the elements in order of first appearance. */
export function speciesColors(species: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of species) if (!m.has(s)) m.set(s, atomColor(m.size));
  return m;
}

/** Colours that stay under 3:1 against the given background, so the caller knows an outline is doing the work. */
export const lowContrastOn = (bg: string): string[] => ATOM_PALETTE.filter((c) => contrastRatio(c, bg) < 3);
