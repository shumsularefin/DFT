// Colours of the 3D stage (M16.1): theme tones for light and dark pages and the two colour maps. Pure.
// @source S-057 (Okabe-Ito colour-blind-safe palette: atoms, the two signs), S-056 (WCAG contrast, checked in tests)
import { ATOM_PALETTE, DARK_BG, LIGHT_BG } from '../three/palette';
import type { Color } from './types';

export type Theme = 'light' | 'dark';

const TONES: Record<Theme, Record<'ink' | 'muted' | 'accent' | 'pos' | 'neg', string>> = {
  // ink and muted follow --text and --border-strong in tokens.css; pos and neg are Okabe-Ito vermillion and blue
  light: { ink: '#111827', muted: '#6b788c', accent: '#1463d1', pos: '#d55e00', neg: '#0072b2' },
  dark: { ink: '#f1f4f9', muted: '#8492a6', accent: '#6cb4ff', pos: '#f08a3c', neg: '#56b4e9' },
};

export const backgroundOf = (t: Theme): string => (t === 'dark' ? DARK_BG : LIGHT_BG);

/** A colour of the layer contract as #rrggbb for the given theme. */
export function resolveColor(c: Color, theme: Theme): string {
  if (c.startsWith('#')) return c;
  if (/^c[0-7]$/.test(c)) return ATOM_PALETTE[Number(c[1])]!;
  return TONES[theme][c as keyof (typeof TONES)['light']];
}

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Diverging: blue, near-white, orange (the two signs). Sequential: a perceptually ordered dark-blue to yellow ramp.
const DIVERGING = ['#0072b2', '#56b4e9', '#e8eef5', '#f0a35e', '#d55e00'];
const SEQUENTIAL = ['#26185f', '#1f5a8c', '#18877e', '#3fb05a', '#a3c93a', '#f6e04b'];

function ramp(stops: readonly string[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb01(stops[i]!);
  const b = hexToRgb01(stops[i + 1]!);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Map values onto RGB triples (0..1) packed in one array. Diverging maps are symmetric about zero unless a range is given. */
export function colormap(
  values: readonly number[],
  kind: 'diverging' | 'sequential',
  range?: [number, number],
): Float32Array {
  let lo = range?.[0] ?? Infinity;
  let hi = range?.[1] ?? -Infinity;
  if (!range)
    for (const v of values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (kind === 'diverging' && !range) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    lo = -m;
    hi = m;
  }
  const span = hi - lo || 1;
  const out = new Float32Array(values.length * 3);
  const stops = kind === 'diverging' ? DIVERGING : SEQUENTIAL;
  values.forEach((v, i) => out.set(ramp(stops, (v - lo) / span), 3 * i));
  return out;
}
