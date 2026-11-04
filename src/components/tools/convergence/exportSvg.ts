// Export helpers for the plot: serialise an SVG with its computed styles inlined, rasterise it, download files.
const PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'fill-opacity',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
] as const;

/** Standalone SVG text: the page's CSS variables are replaced by the colours they resolve to, fonts fall back to system fonts. */
export function svgToString(svg: SVGSVGElement, background: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const target = dst[i];
    if (!target) return;
    const cs = getComputedStyle(el);
    for (const p of PROPS) {
      let v = cs.getPropertyValue(p);
      if (p === 'font-family' && v) v = `${v}, system-ui, sans-serif`;
      if (v) (target as SVGElement).style.setProperty(p, v);
    }
    target.removeAttribute('class');
    target.removeAttribute('tabindex');
  });
  const box = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', background);
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

/** PNG blob at `scale` x the SVG's own size. */
export function svgToPng(svgText: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = width * scale;
      c.height = height * scale;
      const ctx = c.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The SVG could not be drawn'));
    };
    img.src = url;
  });
}
