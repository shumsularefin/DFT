import { describe, expect, it } from 'vitest';
import { ELEMENT_COLORS, UNKNOWN_ELEMENT_COLOR, VESTA_LIGHTS, elementColor } from './vestaStyle';

describe('VESTA style (D-122)', () => {
  it('colours elements as the Studio viewer does', () => {
    expect(elementColor('O')).toBe('#e62222');
    expect(elementColor('Cu')).toBe('#c88033');
    expect(elementColor('La')).toBe('#70d4ff');
    expect(elementColor('Fe1')).toBe(ELEMENT_COLORS.Fe);
    expect(elementColor('Xx')).toBe(UNKNOWN_ELEMENT_COLOR);
    // a real two-letter element missing from the table is unknown, not the one-letter element (Po is not P)
    expect(elementColor('Po')).toBe(UNKNOWN_ELEMENT_COLOR);
    expect(elementColor('Ar 3')).toBe(ELEMENT_COLORS.Ar);
  });
  it('every colour is #rrggbb', () => {
    for (const c of Object.values(ELEMENT_COLORS)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('keeps the Studio light rig', () => {
    expect(VESTA_LIGHTS.ambient.intensity).toBe(0.58);
    expect(VESTA_LIGHTS.key.intensity).toBe(0.72);
    expect(VESTA_LIGHTS.fill.color).toBe(0xdbeafe);
  });
});
