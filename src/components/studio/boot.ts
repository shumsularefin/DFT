// Boots the Material Builder workspace (DFT Studio code) under the site CSP ('self' scripts only): provides
// the globals the Studio scripts expect (THREE, lucide, Plotly, JSZip) from local code, exposes the site bridge, then loads the scripts in order.
import { createIcons } from './iconShim';
import { MiniPlotly } from './miniPlot';
import { MiniZip } from './zipShim';
import { SiteBridge } from './bridge';
import { initMolecule } from './molecule';

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

// A script that throws while it runs still fires onload, so keep the first error raised during start-up
// to report it. Not only errors from the Studio files: WebGL fails inside the three.js chunk.
let scriptError: string | null = null;
const keepError = (e: ErrorEvent) => {
  if (scriptError === null) scriptError = e.message;
};
window.addEventListener('error', keepError);

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

/** Why the viewer did not start, in words a reader can act on. */
function startError(): Error {
  const msg = scriptError ?? 'the 3D viewer did not start';
  return new Error(
    /webgl/i.test(msg)
      ? 'this browser could not start 3D graphics (WebGL). Turn on hardware acceleration, or try another browser'
      : msg,
  );
}

async function boot() {
  const w = window as unknown as Record<string, unknown>;
  // Only the classes the viewer uses (threeSubset.ts), so the lazy three chunk stays inside its budget.
  w.THREE = { ...(await import('./threeSubset')) };
  w.lucide = { createIcons: () => createIcons(document) };
  w.Plotly = MiniPlotly;
  w.JSZip = MiniZip;
  w.SiteBridge = SiteBridge;
  for (const src of SCRIPTS) {
    await load(src);
    // Yield between scripts so no single start-up task blocks input for long.
    await new Promise((r) => setTimeout(r, 0));
    if (src === 'js/vesta.js') {
      const vesta = w.VESTA as { start: () => void } | undefined;
      if (!vesta) throw startError();
      vesta.start();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  // Crystal | Molecule: the Molecule tab, and the switch between the two modes of this one workspace.
  initMolecule();
  window.removeEventListener('error', keepError);
  document.documentElement.dataset.studioReady = 'true';
}

boot().catch((e: unknown) => {
  const el = document.getElementById('studio-boot-error');
  if (el) {
    el.hidden = false;
    el.textContent = `The Material Builder could not start: ${e instanceof Error ? e.message : String(e)}. Reload the page.`;
  }
});
