// Molecule mode of the Material Builder: the same workspace as Crystal mode (viewer, tool strip, panels and
// VASP steps), with a Molecule tab to build an isolated molecule in a vacuum box. Crystal | Molecule switches
// the workspace in place; each mode keeps its own structure, and the address follows (/builder/ or
// /builder/molecule/) so links, reloads and the back button land in the same mode.
import { geometry3d } from '../../lib/chem/geom3d';
import { moleculeInBox, writeMolBlock, writeXyz } from '../../lib/chem/molexport';
import {
  MOLECULE_PRESETS,
  SKETCH_LABEL,
  fillHydrogens,
  grapheneFlake,
  graphFromDistances,
  placeBonded,
} from '../../lib/chem/sketch3d';
import type { Vec3 } from '../../lib/crystal/types';

type Mode = 'crystal' | 'molecule';
interface StudioAtom {
  el: string;
  frac: number[];
}
interface StudioStructure {
  name: string;
  lattice: number[][];
  atoms: StudioAtom[];
}
interface Vesta {
  getStructure(): StudioStructure;
  getSelection(): number[];
  onSelect(fn: (sel: number[]) => void): void;
  onChange(fn: () => void): void;
  snapshot(): unknown;
  restore(s: unknown): void;
  loadText(text: string, name: string, displayName?: string): void;
  loadFresh(text: string, name: string, displayName?: string): void;
  loadSampleKey(key: string): void;
  applyPOSCAR(text: string, note?: string): void;
  selectAtoms(idx: number[]): void;
  openRightTab(t: string): void;
  toast(msg: string): void;
  resize(): void;
}
interface Bridge {
  elements: { Z: number; symbol: string; name: string; row: number; col: number }[];
}

const PATH: Record<Mode, string> = { crystal: '/builder/', molecule: '/builder/molecule/' };
const TITLE: Record<Mode, string> = { crystal: 'Material Builder', molecule: 'Molecule Builder' };
const MIN_VACUUM = 10;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Cartesian positions (angstrom) of the structure's atoms; lattice rows are the cell vectors. */
function cartesian(s: StudioStructure): Vec3[] {
  const L = s.lattice;
  return s.atoms.map((a): Vec3 => {
    const [u, v, w] = [a.frac[0]!, a.frac[1]!, a.frac[2]!];
    const c = (j: number) => u * L[0]![j]! + v * L[1]![j]! + w * L[2]![j]!;
    return [c(0), c(1), c(2)];
  });
}

function formula(species: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const el of species) counts.set(el, (counts.get(el) ?? 0) + 1);
  // Hill order: C, then H, then the rest alphabetically (C absent: all alphabetical).
  const keys = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const ordered = counts.has('C')
    ? ['C', ...(counts.has('H') ? ['H'] : []), ...keys.filter((k) => k !== 'C' && k !== 'H')]
    : keys;
  return ordered.map((k) => `${k}${counts.get(k)! > 1 ? counts.get(k) : ''}`).join('');
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initMolecule(): void {
  const w = window as unknown as { VESTA?: Vesta; SiteBridge?: Bridge };
  const V = w.VESTA;
  const root = $('studio-root');
  if (!V || !root) return;

  let picked = 'C';
  const stash: Partial<Record<Mode, unknown>> = {};
  const status = (msg: string) => {
    const el = $('mol-status');
    if (el) el.textContent = msg;
  };
  const vacuum = () => {
    const v = Number($<HTMLInputElement>('mol-vacuum')?.value);
    return Number.isFinite(v) && v >= MIN_VACUUM ? v : MIN_VACUUM;
  };
  const mode = (): Mode => (root.dataset.mode === 'molecule' ? 'molecule' : 'crystal');

  /** Put a molecule in its box and show it. fresh: no undo step (a new start); otherwise undoable. */
  function show(
    species: string[],
    positions: Vec3[],
    name: string,
    how: 'fresh' | 'undoable' | 'edit',
  ): Vec3 {
    const box = moleculeInBox(species, positions, { vacuumA: vacuum(), comment: name });
    if (how === 'fresh') V!.loadFresh(box.poscar, 'POSCAR', name);
    else if (how === 'undoable') V!.loadText(box.poscar, 'POSCAR', name);
    else V!.applyPOSCAR(box.poscar, `${name}: ${formula(species)}`);
    info();
    // How far the box moved the atoms: the molecule's centre goes to the middle of the cube.
    return [0, 1, 2].map((d) => {
      const v = positions.map((q) => q[d]!);
      return box.edge / 2 - (Math.min(...v) + Math.max(...v)) / 2;
    }) as unknown as Vec3;
  }
  function current() {
    const s = V!.getStructure();
    return { species: s.atoms.map((a) => a.el), positions: cartesian(s), name: s.name };
  }
  /** Index of the atom nearest to p (atoms are reordered by species when the POSCAR is rewritten). */
  function nearestTo(p: Vec3): number {
    const pos = cartesian(V!.getStructure());
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    pos.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  function info() {
    const s = V!.getStructure();
    const f = $('mol-formula');
    if (f) f.textContent = `${formula(s.atoms.map((a) => a.el))}, ${s.atoms.length} atoms`;
    const b = $('mol-box-info');
    const edge = Math.hypot(...(s.lattice[0] ?? [0, 0, 0]));
    if (b) b.textContent = `Cubic box, edge ${edge.toFixed(2)} Å. Use Gamma-only k-points and ISIF = 2.`;
  }
  function selectionText(sel: number[]) {
    const out = $('mol-selected');
    if (!out) return;
    const s = V!.getStructure();
    out.textContent =
      sel.length === 0
        ? 'Pick an atom with the Select tool to build on it.'
        : sel.length === 1
          ? `Selected: ${s.atoms[sel[0]!]?.el ?? ''} (atom ${sel[0]! + 1}).`
          : `${sel.length} atoms selected.`;
  }

  // ------------------------------------------------------------ presets
  const presets = $('mol-presets');
  if (presets) {
    presets.innerHTML = [
      ...MOLECULE_PRESETS.map((p) => ({ id: p.id, label: p.label })),
      { id: 'flake', label: 'Graphene flake' },
    ]
      .map(
        (p) =>
          `<button type="button" class="v-btn justify-center" data-mol-preset="${p.id}">${esc(p.label)}</button>`,
      )
      .join('');
    presets.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-mol-preset]');
      if (b) loadPreset(b.dataset.molPreset!, 'undoable');
    });
  }
  function loadPreset(id: string, how: 'fresh' | 'undoable') {
    if (id === 'flake') {
      const f = grapheneFlake();
      show(f.species, f.positions, 'Graphene flake (coronene)', how);
      status(
        'Coronene, C24H12: a hydrogen-terminated graphene flake. The periodic sheet is in Crystal mode.',
      );
      return;
    }
    const p = MOLECULE_PRESETS.find((x) => x.id === id) ?? MOLECULE_PRESETS[0]!;
    const r = geometry3d(p.graph);
    show(r.species, r.positions, p.label, how);
    status(`${p.label}: ${r.notes[0] ?? SKETCH_LABEL}`);
  }

  // ------------------------------------------------------------ periodic table
  const grid = $('mol-pt-grid');
  const elements = w.SiteBridge?.elements ?? [];
  if (grid) {
    grid.innerHTML = elements
      .map(
        (e) =>
          `<button type="button" class="pt-cell" style="grid-row:${e.row};grid-column:${e.col}" data-el="${e.symbol}" title="${esc(e.name)} (Z = ${e.Z})" aria-label="${e.symbol}, ${esc(e.name)}" aria-pressed="${e.symbol === picked}">${e.symbol}</button>`,
      )
      .join('');
    grid.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-el]');
      if (!b) return;
      picked = b.dataset.el!;
      grid.querySelectorAll('.pt-cell').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      const out = $('mol-picked');
      if (out) out.textContent = picked;
      for (const id of ['mol-add', 'mol-swap']) {
        const btn = $(id);
        if (btn) btn.textContent = id === 'mol-add' ? `Add ${picked}` : `Change to ${picked}`;
      }
    });
  }

  // ------------------------------------------------------------ editing
  $('mol-add')?.addEventListener('click', () => {
    const { species, positions } = current();
    const sel = V.getSelection();
    // Bond to the selected atom; with nothing selected, to the last atom that is not a hydrogen.
    let anchor = sel.length ? sel[sel.length - 1]! : -1;
    if (anchor < 0)
      for (let i = species.length - 1; i >= 0 && anchor < 0; i--) if (species[i] !== 'H') anchor = i;
    if (anchor < 0) anchor = species.length - 1;
    const p: Vec3 = anchor >= 0 ? placeBonded(species, positions, anchor, picked) : [0, 0, 0];
    const shift = show([...species, picked], [...positions, p], `Added ${picked}`, 'edit');
    // The box recentres the molecule and the POSCAR groups atoms by element: find the new atom by position.
    const idx = nearestTo([p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]]);
    if (idx >= 0) V.selectAtoms([idx]);
    status(`Added ${picked}, now selected. Add again to keep building from it.`);
  });

  $('mol-swap')?.addEventListener('click', () => {
    const sel = V.getSelection();
    if (!sel.length) return status('Select one or more atoms first (Select tool, then click an atom).');
    const { species, positions } = current();
    sel.forEach((i) => (species[i] = picked));
    show(species, positions, `Changed ${sel.length} atom(s) to ${picked}`, 'edit');
    status(`Changed ${sel.length} atom(s) to ${picked}. Bond lengths are not adjusted.`);
  });

  $('mol-delete')?.addEventListener('click', () => {
    const sel = V.getSelection();
    const { species, positions } = current();
    if (!sel.length) return status('Select the atoms to delete first (Select tool, then click an atom).');
    if (sel.length >= species.length) return status('A molecule needs at least one atom.');
    const keep = species.map((_, i) => i).filter((i) => !sel.includes(i));
    show(
      keep.map((i) => species[i]!),
      keep.map((i) => positions[i]!),
      `Deleted ${sel.length} atom(s)`,
      'edit',
    );
    status(`Deleted ${sel.length} atom(s).`);
  });

  $('mol-hydrogens')?.addEventListener('click', () => {
    const { species, positions } = current();
    const h = fillHydrogens(species, positions);
    if (!h.length) return status('Every atom already has its usual number of bonds.');
    show([...species, ...h.map(() => 'H')], [...positions, ...h], `Added ${h.length} H`, 'edit');
    status(`Added ${h.length} hydrogen atom(s), assuming single bonds. ${SKETCH_LABEL}`);
  });

  $('mol-single')?.addEventListener('click', () => {
    show([picked], [[0, 0, 0]], `${picked} atom`, 'undoable');
    V.selectAtoms([0]);
    status(`Started from one ${picked} atom. Add atoms to it, or add hydrogens.`);
  });

  $('mol-box')?.addEventListener('click', () => {
    const { species, positions, name } = current();
    show(species, positions, name, 'edit');
    status(`Box fitted with ${vacuum()} Å of vacuum to each periodic image.`);
  });

  // ------------------------------------------------------------ export
  $('mol-xyz')?.addEventListener('click', () => {
    const { species, positions, name } = current();
    download('molecule.xyz', writeXyz(species, positions, name));
  });
  $('mol-mol')?.addEventListener('click', () => {
    const { species, positions, name } = current();
    download('molecule.mol', writeMolBlock(graphFromDistances(species, positions), positions, name));
  });
  $('mol-to-crystal')?.addEventListener('click', () => setMode('crystal', { push: true, carry: true }));

  V.onSelect(selectionText);
  V.onChange(() => {
    if (mode() === 'molecule') info();
  });

  // ------------------------------------------------------------ Crystal | Molecule
  function setMode(next: Mode, opts: { push: boolean; carry?: boolean }) {
    const prev = mode();
    if (prev !== next) {
      if (!opts.carry) stash[prev] = V!.snapshot();
      root!.dataset.mode = next;
      if (!opts.carry) {
        const s = stash[next];
        if (s) V!.restore(s);
        else if (next === 'molecule') loadPreset('ethanol', 'fresh');
        else V!.loadSampleKey('nio_afm');
      }
    }
    for (const a of root!.querySelectorAll<HTMLAnchorElement>('.builder-mode-link')) {
      const own = new URL(a.href, location.href).pathname === PATH[next];
      if (own) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    V!.openRightTab(next === 'molecule' ? 'molecule' : 'supercell');
    document.title = document.title.replace(/^(Material Builder|Molecule Builder)/, TITLE[next]);
    if (opts.push && location.pathname !== PATH[next]) history.pushState({ mode: next }, '', PATH[next]);
    if (next === 'molecule') info();
    V!.resize();
  }

  for (const a of root.querySelectorAll<HTMLAnchorElement>('.builder-mode-link')) {
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault();
      setMode(new URL(a.href, location.href).pathname === PATH.molecule ? 'molecule' : 'crystal', {
        push: true,
      });
    });
  }
  window.addEventListener('popstate', () => {
    setMode(location.pathname.startsWith(PATH.molecule) ? 'molecule' : 'crystal', { push: false });
  });

  // The molecule page starts in molecule mode: the workspace booted on the crystal sample, so swap it for
  // a molecule without leaving an undo step.
  if (mode() === 'molecule') {
    loadPreset('ethanol', 'fresh');
    setMode('molecule', { push: false });
  }
}
