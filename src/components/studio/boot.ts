// Boots the Material Builder workspace (DFT Studio code) under the site CSP ('self' scripts only): provides
// the globals the Studio scripts expect (THREE, lucide, Plotly, JSZip) from local code, exposes the site bridge, then loads the scripts in order.
import { createIcons } from './iconShim';
import { MiniPlotly } from './miniPlot';
import { MiniZip } from './zipShim';
import { SiteBridge } from './bridge';

const BASE = '/dft-studio/';
const SCRIPTS = [
  'data/crystals_index.js',
  'data/pp_index.js',
  'data/pp_local.js',
  'js/wasm_engine.js',
  'js/kconv-core.js',
  'js/studio-data.js',
  'js/vesta.js',
  'js/studio.js',
  'js/studio-kconv.js',
  'js/studio-analyze.js',
  'js/site-link.js',
];

function load(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = BASE + src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.body.appendChild(s);
  });
}

async function boot() {
  const w = window as unknown as Record<string, unknown>;
  // Only the classes the viewer uses (threeSubset.ts), so the lazy three chunk stays inside its budget.
  w.THREE = { ...(await import('./threeSubset')) };
  w.lucide = { createIcons: () => createIcons(document) };
  w.Plotly = MiniPlotly;
  w.JSZip = MiniZip;
  w.SiteBridge = SiteBridge;
  for (const src of SCRIPTS) await load(src);
  document.documentElement.dataset.studioReady = 'true';
}

boot().catch((e: unknown) => {
  const el = document.getElementById('studio-boot-error');
  if (el) {
    el.hidden = false;
    el.textContent = `The Material Builder could not start: ${e instanceof Error ? e.message : String(e)}. Reload the page.`;
  }
});
