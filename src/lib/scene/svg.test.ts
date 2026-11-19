import { describe, expect, it } from 'vitest';
import { getScene, lookupStructure } from './library';
import { projectScene } from './project';
import { resolveScene, structureOf } from './resolve';
import { escapeXml, projectionToSvg } from './svg';

const svgOf = (id: string) => {
  const spec = getScene(id);
  return projectionToSvg(
    projectScene(resolveScene(spec, lookupStructure), structureOf(spec, lookupStructure).lattice),
    spec.alt,
    id,
  );
};

describe('projectionToSvg', () => {
  it('escapes text', () => expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;'));
  it('names the picture with the text alternative', () => {
    const s = svgOf('fcc');
    expect(s).toContain('role="img"');
    expect(s).toContain(`<title id="fcc-t">${escapeXml(getScene('fcc').alt)}</title>`);
  });
  it('fcc conventional cell draws 14 atoms (boundary images included)', () => {
    expect(svgOf('fcc').match(/class="sc-atom"/g)).toHaveLength(14);
  });
  it('magnetic scene: up and down differ by head shape and a + or - label', () => {
    const s = svgOf('afm-g');
    expect(s).toContain('sc-open');
    expect(s).toContain('>+</text>');
    expect(s).toContain('>−</text>');
    // 8 sites on a 3 x 3 x 3 grid of drawn positions (boundary images repeat the signs): 14 up, 13 down in G-type
    expect((s.match(/>\+<\/text>/g) ?? []).length).toBe(14);
    expect((s.match(/>\u2212<\/text>/g) ?? []).length).toBe(13);
  });
  it('contains no em dash', () => expect(svgOf('afm-a')).not.toContain(String.fromCharCode(0x2014)));
});
