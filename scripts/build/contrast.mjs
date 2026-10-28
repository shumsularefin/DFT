// WCAG 2.x contrast check for the colour tokens in src/styles/tokens.css, both themes.
// Usage: node scripts/build/contrast.mjs [tokens.css]. Exits 1 if any pair fails.
// Formula: relative luminance and contrast ratio as defined in WCAG 2.1 (success criterion 1.4.3, 1.4.11).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// [foreground token, background token, minimum ratio, why]
export const PAIRS = [
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'surface', 4.5, 'text on cards'],
  ['text', 'surface-2', 4.5, 'text on raised surfaces'],
  ['text-muted', 'bg', 4.5, 'secondary text'],
  ['text-muted', 'surface', 4.5, 'secondary text on cards'],
  ['text-muted', 'surface-2', 4.5, 'secondary text on raised surfaces'],
  ['accent', 'bg', 4.5, 'links'],
  ['accent', 'surface', 4.5, 'links on cards'],
  ['accent-contrast', 'accent', 4.5, 'text on accent buttons'],
  ['danger', 'bg', 4.5, 'danger text'],
  ['danger', 'surface', 4.5, 'danger text on cards'],
  ['warn', 'bg', 4.5, 'warning text'],
  ['warn', 'surface', 4.5, 'warning text on cards'],
  ['ok', 'bg', 4.5, 'success text'],
  ['ok', 'surface', 4.5, 'success text on cards'],
  ['border-strong', 'bg', 3, 'control borders'],
  ['border-strong', 'surface', 3, 'control borders on cards'],
  ['focus', 'bg', 3, 'focus ring'],
  ['focus', 'surface', 3, 'focus ring on cards'],
  ['accent', 'surface-2', 3, 'accent UI parts on raised surfaces'],
  ['danger', 'surface-2', 3, 'callout bars'],
  ['warn', 'surface-2', 3, 'callout bars'],
  ['ok', 'surface-2', 3, 'callout bars'],
];

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}

export function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function block(css, opening) {
  const start = css.search(opening);
  if (start < 0) throw new Error(`tokens block not found: ${opening}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const tokens = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
    tokens[m[1]] = m[2];
  return tokens;
}

export function readThemes(css) {
  return {
    light: block(css, /^:root \{/m),
    dark: block(css, /^:root\[data-theme='dark'\] \{/m),
    darkMedia: block(css, /:root:not\(\[data-theme='light'\]\) \{/),
  };
}

export function check(css, pairs = PAIRS) {
  const themes = readThemes(css);
  const failures = [];
  const rows = [];
  if (JSON.stringify(themes.dark) !== JSON.stringify(themes.darkMedia)) {
    failures.push('dark theme block and prefers-color-scheme block differ');
  }
  for (const theme of ['light', 'dark']) {
    for (const [fg, bg, min, why] of pairs) {
      const a = themes[theme][fg];
      const b = themes[theme][bg];
      if (!a || !b) {
        failures.push(`${theme}: token missing for ${fg}/${bg}`);
        continue;
      }
      const r = ratio(a, b);
      rows.push({ theme, fg, bg, min, r, why });
      if (r < min) failures.push(`${theme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1 (${why})`);
    }
  }
  return { rows, failures };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { rows, failures } = check(fs.readFileSync(process.argv[2] ?? 'src/styles/tokens.css', 'utf8'));
  for (const r of rows) {
    console.log(
      `${r.theme.padEnd(5)} ${(r.fg + ' on ' + r.bg).padEnd(30)} ${r.r.toFixed(2).padStart(6)}:1  (min ${r.min})`,
    );
  }
  if (failures.length) {
    console.error('\nContrast failures:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nContrast OK');
}
