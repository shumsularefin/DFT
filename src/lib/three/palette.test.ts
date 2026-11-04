import { describe, expect, it } from 'vitest';
import {
  ATOM_PALETTE,
  DARK_BG,
  LIGHT_BG,
  atomColor,
  contrastRatio,
  hexToRgb,
  lowContrastOn,
  relativeLuminance,
  speciesColors,
} from './palette';
import fs from 'node:fs';

describe('contrast ratio (WCAG 2.1, S-056)', () => {
  it('black on white is 21:1 and a colour on itself is 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#336699', '#336699')).toBe(1);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 12);
    expect(relativeLuminance('#000000')).toBe(0);
  });
  it('is symmetric and rejects malformed colours', () => {
    expect(contrastRatio('#0072b2', '#ffffff')).toBe(contrastRatio('#ffffff', '#0072b2'));
    expect(() => hexToRgb('red')).toThrow(RangeError);
    expect(hexToRgb('#0072b2')).toEqual([0, 114, 178]);
  });
  it('mid grey #777777 on white is the textbook 4.48:1', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('atom palette (Okabe-Ito, S-057)', () => {
  it('has the eight published colours, all distinct', () => {
    expect(ATOM_PALETTE).toHaveLength(8);
    expect(new Set(ATOM_PALETTE).size).toBe(8);
  });
  it('the page backgrounds are the real theme tokens', () => {
    const css = fs.readFileSync('src/styles/tokens.css', 'utf8').toLowerCase();
    expect(css).toContain(`--bg: ${LIGHT_BG}`);
    expect(css).toContain(`--bg: ${DARK_BG}`);
  });
  it('records which colours need the outline: yellow, sky and orange on light, grey on dark', () => {
    expect(lowContrastOn(LIGHT_BG).sort()).toEqual(['#56b4e9', '#e69f00', '#f0e442']);
    expect(lowContrastOn(DARK_BG)).toEqual(['#595959']);
  });
  it('no colour is low contrast on both themes, so each one reads on at least one', () => {
    const light = new Set(lowContrastOn(LIGHT_BG));
    for (const c of lowContrastOn(DARK_BG)) expect(light.has(c)).toBe(false);
  });
  it('assigns colours by first appearance and wraps', () => {
    const m = speciesColors(['Na', 'Cl', 'Na', 'Cl', 'Ti']);
    expect([...m.keys()]).toEqual(['Na', 'Cl', 'Ti']);
    expect(m.get('Na')).toBe(ATOM_PALETTE[0]);
    expect(m.get('Ti')).toBe(ATOM_PALETTE[2]);
    expect(atomColor(8)).toBe(ATOM_PALETTE[0]);
  });
});
