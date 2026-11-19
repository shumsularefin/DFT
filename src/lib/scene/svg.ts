// SVG markup for a projection (M12.2). One pure string function, used at build time by SceneSvg.astro and in the browser by
// the Scene island, so the first picture needs no three.js and the two paths cannot drift apart.
import type { Primitive, Projection } from './project';

export const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number): string => (Math.round(x * 100) / 100).toString();

function arrowSvg(p: Extract<Primitive, { kind: 'arrow' }>): string {
  const dx = p.x2 - p.x1;
  const dy = p.y2 - p.y1;
  const len = Math.hypot(dx, dy);
  const cls = `sc-${p.tone}`;
  if (len < 1.5) {
    // arrow pointing at or away from the viewer: a ring with a dot (towards) so it still reads as an arrow
    return `<circle class="${cls} sc-stroke" cx="${n(p.x1)}" cy="${n(p.y1)}" r="4" fill="none"/>${
      p.head === 'solid' ? `<circle class="${cls} sc-fill" cx="${n(p.x1)}" cy="${n(p.y1)}" r="1.6"/>` : ''
    }`;
  }
  const ux = dx / len;
  const uy = dy / len;
  const hl = Math.min(9, len * 0.45);
  const hw = hl * 0.45;
  const bx = p.x2 - ux * hl;
  const by = p.y2 - uy * hl;
  const tri = `${n(p.x2)},${n(p.y2)} ${n(bx - uy * hw)},${n(by + ux * hw)} ${n(bx + uy * hw)},${n(by - ux * hw)}`;
  return (
    `<line class="${cls} sc-stroke" x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(bx)}" y2="${n(by)}" stroke-width="1.6"/>` +
    (p.head === 'open'
      ? `<polygon class="${cls} sc-stroke sc-open" points="${tri}" stroke-width="1.4"/>`
      : `<polygon class="${cls} sc-fill" points="${tri}"/>`)
  );
}

function one(p: Primitive): string {
  switch (p.kind) {
    case 'circle':
      return (
        `<circle class="sc-atom" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="${p.fill}"/>` +
        (p.ring ? `<circle class="sc-ring" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r + 4)}"/>` : '')
      );
    case 'line':
      return `<line class="sc-${p.tone} sc-stroke" x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke-width="${p.width}"${p.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
    case 'polygon':
      return `<polygon class="sc-${p.tone} sc-fill" fill-opacity="${p.opacity}" points="${p.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}"/>`;
    case 'arrow':
      return arrowSvg(p);
    case 'text':
      return `<text class="sc-${p.tone} sc-text" x="${n(p.x + 5)}" y="${n(p.y - 5)}">${escapeXml(p.text)}</text>`;
  }
}

/** A complete `<svg>` element. `label` is the accessible name (the scene's text alternative). */
export function projectionToSvg(pr: Projection, label: string, idPrefix = 'scene'): string {
  return (
    `<svg class="scene-svg" viewBox="0 0 ${pr.size} ${pr.size}" role="img" aria-labelledby="${idPrefix}-t" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${idPrefix}-t">${escapeXml(label)}</title>` +
    pr.primitives.map(one).join('') +
    `</svg>`
  );
}
