// Molecule mode of the Material Builder: the same workspace as Crystal mode (viewer, tool strip, panels and
// VASP steps), with a Molecule tab to build an isolated molecule in a vacuum box. Crystal | Molecule switches
// the workspace in place; each mode keeps its own structure, and the address follows (/builder/ or
// /builder/molecule/) so links, reloads and the back button land in the same mode.
import { geometry3d } from '../../lib/chem/geom3d';
import { moleculeInBox, writeMolBlock, writeXyz } from '../../lib/chem/molexport';
import {
  FRAGMENTS,
  attachFragment,
  fragmentOf,
  measure,
  moveAtoms,
  pruneOrders,
  removeAtom,
  setBondOrder,
  setDistance,
  standaloneFragment,
  type EditMol,
} from '../../lib/chem/editor3d';
import {
  MOLECULE_PRESETS,
  SKETCH_LABEL,
  fillHydrogens,
  grapheneFlake,
  graphFromDistances,
  neighbours,
  orderKey,
  orderOf,
  placeBonded,
  radiusOf,
  typicalValence,
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
  undo(): boolean;
  redo(): boolean;
  setBondOrders(map: Record<string, number>, undoable?: boolean): void;
  getBondOrders(): Record<string, number>;
  getElementInfo(el: string): { color: string; r: number };
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
  elements: { Z: number; symbol: string; name: string; category: string; row: number; col: number }[];
}

const PATH: Record<Mode, string> = { crystal: '/builder/', molecule: '/builder/molecule/' };
const TITLE: Record<Mode, string> = { crystal: 'Material Builder', molecule: 'Molecule Builder' };
const MIN_VACUUM = 10;
/** The elements most molecules are built from, shown as chips above the full table. */
const COMMON = ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I', 'Si', 'B'];
const CATEGORY_LABEL: [string, string][] = [
  ['alkali-metal', 'Alkali and alkaline earth'],
  ['transition-metal', 'Transition metal'],
  ['post-transition-metal', 'Post-transition metal'],
  ['metalloid', 'Metalloid'],
  ['nonmetal', 'Nonmetal'],
  ['halogen', 'Halogen'],
  ['noble-gas', 'Noble gas'],
  ['lanthanide', 'Lanthanide and actinide'],
];
const ORDER_NAME: Record<number, string> = { 1: 'single', 1.5: 'aromatic', 2: 'double', 3: 'triple' };

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

/** Black or white text, whichever reads better on a hex colour (WCAG relative luminance). */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#000';
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000' : '#fff';
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
  /** The molecule on screen, with the bond orders that still match bonded atoms. */
  function current(): EditMol & { name: string } {
    const s = V!.getStructure();
    const species = s.atoms.map((a) => a.el);
    const positions = cartesian(s);
    const raw = V!.getBondOrders();
    const orders = new Map<string, number>(Object.entries(raw).map(([k, o]) => [k, Number(o)]));
    return { species, positions, orders: pruneOrders({ species, positions, orders }), name: s.name };
  }
  /**
   * Show an edited molecule and carry its bond orders and selection across: the box recentres the atoms and
   * the POSCAR groups them by element, so each atom is found again by its shifted position.
   */
  function commit(m: EditMol, name: string, select: number[] = [], how: 'edit' | 'undoable' = 'edit') {
    const shift = show(m.species, m.positions, name, how);
    const pos = cartesian(V!.getStructure());
    const index = m.positions.map((p) => nearest(pos, [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]]));
    const map: Record<string, number> = {};
    for (const [key, o] of m.orders) {
      const [a, b] = key.split('-').map(Number) as [number, number];
      const ia = index[a];
      const ib = index[b];
      if (ia !== undefined && ib !== undefined && ia >= 0 && ib >= 0 && ia !== ib) map[orderKey(ia, ib)] = o;
    }
    V!.setBondOrders(map);
    const sel = select.map((k) => index[k]!).filter((k) => k !== undefined && k >= 0);
    if (sel.length) V!.selectAtoms(sel);
  }
  function nearest(pos: Vec3[], p: Vec3): number {
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
  /** The last atom that is not a hydrogen (where Add builds with nothing selected). */
  function lastHeavy(species: readonly string[]): number {
    for (let i = species.length - 1; i >= 0; i--) if (species[i] !== 'H') return i;
    return species.length - 1;
  }

  // ------------------------------------------------------------ selection read-outs
  function selectionText(sel: number[]) {
    const out = $('mol-selected');
    const s = V!.getStructure();
    if (out)
      out.textContent =
        sel.length === 0
          ? 'Nothing selected: new atoms bond to the last heavy atom. Use the Select tool to pick one.'
          : sel.length === 1
            ? `Selected: ${s.atoms[sel[0]!]?.el ?? ''} (atom ${sel[0]! + 1}).`
            : `${sel.length} atoms selected.`;
    const m = current();
    const meas = $('mol-measure');
    if (meas) {
      const r = measure(m.positions, sel);
      const names = sel.map((i) => `${m.species[i]}${i + 1}`).join('-');
      meas.textContent = r
        ? `${names}: ${r.kind} ${r.value.toFixed(r.kind === 'distance' ? 3 : 1)}${r.kind === 'distance' ? ' Å' : '°'}`
        : 'Select 2 atoms for a distance, 3 for an angle, 4 for a dihedral (click them in order).';
    }
    const bi = $('mol-bond-info');
    const len = $<HTMLInputElement>('mol-bond-length');
    const bonded = sel.length === 2 && neighbours(m.species, m.positions, sel[0]!).includes(sel[1]!);
    const o = bonded ? orderOf(m.orders, sel[0]!, sel[1]!) : 0;
    if (bi)
      bi.textContent =
        sel.length !== 2
          ? 'Select two bonded atoms to change their bond.'
          : bonded
            ? `${m.species[sel[0]!]}${sel[0]! + 1}-${m.species[sel[1]!]}${sel[1]! + 1}: ${ORDER_NAME[o] ?? 'single'} bond.`
            : 'These two atoms are not bonded: set their distance to bond them.';
    document
      .querySelectorAll<HTMLElement>('[data-bond-order]')
      .forEach((b) => b.setAttribute('aria-pressed', String(bonded && Number(b.dataset.bondOrder) === o)));
    if (len && sel.length === 2) {
      const r = measure(m.positions, sel);
      if (r) len.value = r.value.toFixed(3);
    }
  }

  // ------------------------------------------------------------ presets
  const presets = $('mol-presets');
  if (presets) {
    presets.innerHTML = [
      ...MOLECULE_PRESETS.map((p) => ({ id: p.id, label: p.label })),
      { id: 'flake', label: 'Graphene flake (molecule)' },
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
    const orders = new Map<string, number>();
    for (const b of r.graph.bonds) {
      const o = b.order === 'aromatic' ? 1.5 : b.order;
      if (o !== 1) orders.set(orderKey(b.a, b.b), o);
    }
    if (how === 'fresh') {
      const shift = show(r.species, r.positions, p.label, 'fresh');
      const pos = cartesian(V!.getStructure());
      const index = r.positions.map((q) => nearest(pos, [q[0] + shift[0], q[1] + shift[1], q[2] + shift[2]]));
      const map: Record<string, number> = {};
      for (const [key, o] of orders) {
        const [a, b] = key.split('-').map(Number) as [number, number];
        map[orderKey(index[a]!, index[b]!)] = o;
      }
      V!.setBondOrders(map);
    } else commit({ species: r.species, positions: r.positions, orders }, p.label, [], 'undoable');
    status(`${p.label}: ${r.notes[0] ?? SKETCH_LABEL}`);
  }
  // ------------------------------------------------------------ element picker
  const elements = w.SiteBridge?.elements ?? [];
  const elInfo = (el: string) => elements.find((e) => e.symbol === el);
  function pick(el: string) {
    picked = el;
    document
      .querySelectorAll<HTMLElement>('#mol-common [data-el], #mol-pt-grid [data-el]')
      .forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.el === el)));
    for (const id of ['mol-add', 'mol-swap', 'mol-single']) {
      const btn = $(id);
      if (!btn) continue;
      btn.textContent =
        id === 'mol-add' ? `Add ${el}` : id === 'mol-swap' ? `Change to ${el}` : `Start from one ${el}`;
    }
    const card = $('mol-el-card');
    const e = elInfo(el);
    if (card && e) {
      const v = typicalValence(el);
      const bg = V!.getElementInfo(el).color;
      card.innerHTML = `<span class="mol-el-sym" style="background:${esc(bg)};color:${inkOn(bg)}">${esc(el)}</span><dl><dt>Name</dt><dd>${esc(e.name)} (Z = ${e.Z})</dd><dt>Covalent radius</dt><dd>${radiusOf(el).toFixed(2)} Å</dd><dt>Usual bonds</dt><dd>${v === null ? 'no fixed number' : v}</dd></dl>`;
    }
  }
  const common = $('mol-common');
  if (common) {
    common.innerHTML = COMMON.map((el) => {
      const e = elInfo(el);
      return `<button type="button" class="mol-chip" data-el="${el}" title="${esc(e?.name ?? el)}" aria-label="${el}, ${esc(e?.name ?? el)}" aria-pressed="false"><span class="mol-dot" style="background:${esc(V.getElementInfo(el).color)}"></span>${el}</button>`;
    }).join('');
  }
  const grid = $('mol-pt-grid');
  if (grid) {
    grid.innerHTML = elements
      .map(
        (e) =>
          `<button type="button" class="pt-cell" style="grid-row:${e.row};grid-column:${e.col}" data-el="${e.symbol}" data-cat="${esc(e.category)}" title="${esc(e.name)} (Z = ${e.Z}), ${esc(e.category.replace(/-/g, ' '))}" aria-label="${e.symbol}, ${esc(e.name)}" aria-pressed="false">${e.symbol}</button>`,
      )
      .join('');
  }
  const legend = $('mol-pt-legend');
  if (legend)
    legend.innerHTML = CATEGORY_LABEL.map(([c, l]) => `<span data-cat="${c}">${esc(l)}</span>`).join('');
  for (const host of [common, grid])
    host?.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-el]');
      if (b) pick(b.dataset.el!);
    });
  $<HTMLInputElement>('mol-el-search')?.addEventListener('input', (ev) => {
    const q = (ev.target as HTMLInputElement).value.trim().toLowerCase();
    let only: string | null = null;
    let hits = 0;
    grid?.querySelectorAll<HTMLElement>('[data-el]').forEach((c) => {
      const e = elInfo(c.dataset.el!);
      const hit = !q || c.dataset.el!.toLowerCase() === q || (e?.name.toLowerCase().includes(q) ?? false);
      c.classList.toggle('is-dim', !hit);
      if (hit && q) {
        hits += 1;
        only = c.dataset.el!;
      }
    });
    // A search that leaves one element (or an exact symbol) picks it.
    const exact = elements.find((e) => e.symbol.toLowerCase() === q);
    if (exact) pick(exact.symbol);
    else if (hits === 1 && only) pick(only);
  });
  pick(picked);

  // ------------------------------------------------------------ building
  $('mol-add')?.addEventListener('click', () => {
    const m = current();
    const sel = V.getSelection();
    // Bond to the selected atom; with nothing selected, to the last atom that is not a hydrogen.
    const anchor = sel.length ? sel[sel.length - 1]! : lastHeavy(m.species);
    const p: Vec3 = anchor >= 0 ? placeBonded(m.species, m.positions, anchor, picked) : [0, 0, 0];
    commit(
      { species: [...m.species, picked], positions: [...m.positions, p], orders: m.orders },
      `Added ${picked}`,
      [m.species.length],
    );
    status(`Added ${picked}, now selected. Add again to keep building from it.`);
  });

  $('mol-swap')?.addEventListener('click', () => {
    const sel = V.getSelection();
    if (!sel.length) return status('Select one or more atoms first (Select tool, then click an atom).');
    const m = current();
    sel.forEach((i) => (m.species[i] = picked));
    commit(m, `Changed ${sel.length} atom(s) to ${picked}`, sel);
    status(
      `Changed ${sel.length} atom(s) to ${picked}. Bond lengths are not adjusted: use Bonds to set one.`,
    );
  });

  function deleteSelected() {
    const sel = V!.getSelection();
    let m: EditMol = current();
    if (!sel.length) return status('Select the atoms to delete first (Select tool, then click an atom).');
    if (sel.length >= m.species.length) return status('A molecule needs at least one atom.');
    for (const k of [...sel].sort((a, b) => b - a)) m = removeAtom(m, k);
    commit(m, `Deleted ${sel.length} atom(s)`);
    status(`Deleted ${sel.length} atom(s).`);
  }
  $('mol-delete')?.addEventListener('click', deleteSelected);

  $('mol-hydrogens')?.addEventListener('click', () => {
    const m = current();
    const h = fillHydrogens(m.species, m.positions, m.orders);
    if (!h.length) return status('Every atom already has its usual number of bonds.');
    commit(
      { species: [...m.species, ...h.map(() => 'H')], positions: [...m.positions, ...h], orders: m.orders },
      `Added ${h.length} H`,
    );
    status(`Added ${h.length} hydrogen atom(s), counting the bond orders you set. ${SKETCH_LABEL}`);
  });

  $('mol-strip-h')?.addEventListener('click', () => {
    let m: EditMol = current();
    const hs = m.species.map((e, i) => (e === 'H' ? i : -1)).filter((i) => i >= 0);
    if (!hs.length) return status('There are no hydrogens to remove.');
    if (hs.length === m.species.length) return status('A molecule needs at least one atom.');
    for (const k of hs.reverse()) m = removeAtom(m, k);
    commit(m, `Removed ${hs.length} H`);
    status(`Removed ${hs.length} hydrogen atom(s). Add hydrogens puts them back where they fit.`);
  });

  $('mol-single')?.addEventListener('click', () => {
    show([picked], [[0, 0, 0]], `${picked} atom`, 'undoable');
    V.selectAtoms([0]);
    status(`Started from one ${picked} atom. Add atoms, rings or groups to it, or add hydrogens.`);
  });

  $('mol-undo')?.addEventListener('click', () => {
    if (!V.undo()) status('Nothing to undo.');
  });
  $('mol-redo')?.addEventListener('click', () => {
    if (!V.redo()) status('Nothing to redo.');
  });

  // ------------------------------------------------------------ rings and groups
  const frags = $('mol-fragments');
  if (frags) {
    const btn = (f: (typeof FRAGMENTS)[number]) =>
      `<button type="button" class="v-btn" data-frag="${f.id}">${esc(f.label)}</button>`;
    frags.innerHTML =
      `<span class="mol-frag-kind">Rings</span>` +
      FRAGMENTS.filter((f) => f.kind === 'ring')
        .map(btn)
        .join('') +
      `<span class="mol-frag-kind">Groups</span>` +
      FRAGMENTS.filter((f) => f.kind === 'group')
        .map(btn)
        .join('');
    frags.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-frag]');
      if (!b) return;
      const f = FRAGMENTS.find((x) => x.id === b.dataset.frag)!;
      const m = current();
      const sel = V.getSelection();
      if (!m.species.length) {
        commit(standaloneFragment(f.id), f.label, [], 'undoable');
        return status(`${f.label} on its own. ${SKETCH_LABEL}`);
      }
      const anchor = sel.length ? sel[sel.length - 1]! : lastHeavy(m.species);
      const r = attachFragment(m, anchor, f.id);
      commit(r.mol, `Added ${f.label}`, [r.attach]);
      status(`Added ${f.label} to ${m.species[anchor]}${anchor + 1}. ${SKETCH_LABEL}`);
    });
  }

  // ------------------------------------------------------------ bonds
  document.querySelectorAll<HTMLElement>('[data-bond-order]').forEach((b) =>
    b.addEventListener('click', () => {
      const sel = V.getSelection();
      if (sel.length !== 2) return status('Select exactly two bonded atoms first.');
      const m = current();
      const o = Number(b.dataset.bondOrder);
      try {
        const next = setBondOrder(m, sel[0]!, sel[1]!, o);
        const map: Record<string, number> = {};
        for (const [k, v] of next.orders) map[k] = v;
        V.setBondOrders(map, true);
        V.selectAtoms(sel);
        status(
          `Set a ${ORDER_NAME[o]} bond. Hydrogens and the MOL file follow it; the length stays at the single-bond radii.`,
        );
      } catch {
        status('These two atoms are not bonded: set their distance first to bond them.');
      }
    }),
  );
  $('mol-set-length')?.addEventListener('click', () => {
    const sel = V.getSelection();
    if (sel.length !== 2) return status('Select exactly two atoms first.');
    const d = Number($<HTMLInputElement>('mol-bond-length')?.value);
    if (!(d >= 0.5 && d <= 6)) return status('Give a distance between 0.5 and 6 Å.');
    const m = current();
    const pos = setDistance(m.positions, m.species, sel[0]!, sel[1]!, d);
    commit({ ...m, positions: pos }, `Set distance ${d.toFixed(3)} Å`, sel);
    status(`Set the distance to ${d.toFixed(3)} Å, moving the second atom's side.`);
  });

  // ------------------------------------------------------------ select and move
  const select = (idx: number[], msg: string) => {
    V.selectAtoms(idx);
    status(msg);
  };
  $('mol-sel-all')?.addEventListener('click', () => {
    const n = current().species.length;
    select(
      Array.from({ length: n }, (_, i) => i),
      `Selected all ${n} atoms.`,
    );
  });
  $('mol-sel-frag')?.addEventListener('click', () => {
    const m = current();
    const sel = V.getSelection();
    if (!sel.length) return status('Select one atom first; this adds everything bonded to it.');
    const all = new Set<number>();
    for (const i of sel) for (const j of fragmentOf(m.species, m.positions, i)) all.add(j);
    select([...all], `Selected ${all.size} linked atom(s).`);
  });
  $('mol-sel-h')?.addEventListener('click', () => {
    const m = current();
    const hs = m.species.map((e, i) => (e === 'H' ? i : -1)).filter((i) => i >= 0);
    select(hs, `Selected ${hs.length} hydrogen atom(s).`);
  });
  $('mol-sel-none')?.addEventListener('click', () => select([], 'Selection cleared.'));
  $('mol-move')?.addEventListener('click', () => {
    const sel = V.getSelection();
    if (!sel.length) return status('Select the atoms to move first.');
    const v = ['mol-dx', 'mol-dy', 'mol-dz'].map(
      (id) => Number($<HTMLInputElement>(id)?.value) || 0,
    ) as unknown as Vec3;
    if (!v.some((x) => x !== 0)) return status('Give a shift in x, y or z first (Å).');
    const m = current();
    commit({ ...m, positions: moveAtoms(m.positions, sel, v) }, `Moved ${sel.length} atom(s)`, sel);
    status(`Moved ${sel.length} atom(s) by (${v.map((x) => x.toFixed(2)).join(', ')}) Å.`);
  });
  // Delete or Backspace removes the selected atoms in molecule mode (not while typing in a field).
  document.addEventListener('keydown', (ev) => {
    if (mode() !== 'molecule' || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return;
    const t = ev.target as HTMLElement | null;
    if (
      t &&
      (t.closest('input, textarea, select, [contenteditable="true"]') ||
        (!root.contains(t) && t !== document.body))
    )
      return;
    if (!V.getSelection().length) return;
    ev.preventDefault();
    deleteSelected();
  });

  $('mol-box')?.addEventListener('click', () => {
    const m = current();
    commit(m, m.name);
    status(`Molecule centred in a cubic box with ${vacuum()} Å of vacuum to each periodic image.`);
  });

  // ------------------------------------------------------------ export
  $('mol-xyz')?.addEventListener('click', () => {
    const { species, positions, name } = current();
    download('molecule.xyz', writeXyz(species, positions, name));
  });
  $('mol-mol')?.addEventListener('click', () => {
    const { species, positions, orders, name } = current();
    download('molecule.mol', writeMolBlock(graphFromDistances(species, positions, orders), positions, name));
  });
  $('mol-to-crystal')?.addEventListener('click', () => setMode('crystal', { push: true, carry: true }));

  V.onSelect(selectionText);
  V.onChange(() => {
    if (mode() === 'molecule') {
      info();
      selectionText(V.getSelection());
    }
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
