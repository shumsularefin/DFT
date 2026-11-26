// Replaces the lucide UMD script: turns <i data-lucide="name"> into inline SVG (same contract as lucide.createIcons).
import { ICONS } from './icons.generated';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement | SVGElement>('[data-lucide]').forEach((el) => {
    const name = el.getAttribute('data-lucide') ?? '';
    const inner = ICONS[name];
    if (!inner) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const a of Array.from(el.attributes)) if (a.name !== 'class') svg.setAttribute(a.name, a.value);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const cls = (el.getAttribute('class') ?? '').replace(/\blucide(-[a-z0-9-]+)?\b/g, '').trim();
    svg.setAttribute('class', `lucide lucide-${name} ${cls}`.trim());
    svg.innerHTML = inner;
    el.replaceWith(svg);
  });
}
