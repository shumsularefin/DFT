import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, ratio } from './contrast.mjs';

const css = fs.readFileSync('src/styles/tokens.css', 'utf8');

describe('contrast', () => {
  it('black on white is 21:1 and identical colours are 1:1 (WCAG 2.1 definition)', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('the shipped tokens pass in both themes', () => {
    expect(check(css).failures).toEqual([]);
  });

  it('reports a deliberately bad pair', () => {
    const bad = css.replace('--text-muted: #4b5563;', '--text-muted: #c0c0c0;');
    const { failures } = check(bad);
    expect(failures.some((f) => f.startsWith('light: text-muted on bg'))).toBe(true);
  });

  it('flags a media block that drifts from the dark theme block', () => {
    const drift = css.replace('--surface: #161b23;', '--surface: #161b24;');
    expect(check(drift).failures.some((f) => f.includes('differ'))).toBe(true);
  });
});
