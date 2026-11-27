// The live topic stage (M16.2): the server-rendered stage (poster, captions, descriptions, state list) comes alive here.
// It loads the scene module, builds frames on every control change, draws them with Viewer3D, follows the reader's
// section, and keeps the text equivalents (description, readouts, live caption) in step. Vanilla DOM, no framework (D-116).
// Loaded lazily by the boot script; three.js arrives with it, never with the page.
import { loadScene } from '../scenes/index';
import {
  withDefaults,
  type CameraSpec,
  type ParamDef,
  type Params,
  type SceneDef,
  type SceneFrame,
} from '../types';
import { Viewer3D } from '../Viewer3D';
import { parseIndices } from '../views';
import { activeState, stepState } from './sync';

export interface StageStateData {
  id: string;
  section?: string;
  params: Params;
  layers?: string[];
  camera?: CameraSpec;
  caption: string;
}
export interface StageData {
  scene: string;
  states: StageStateData[];
}

const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));

export function hasWebGL(doc: Document): boolean {
  try {
    const c = doc.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const q = <T extends Element>(root: ParentNode, sel: string) => root.querySelector<T>(sel);

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export class StageApp {
  private viewer: Viewer3D;
  private def!: SceneDef;
  private params: Params = {};
  private stateIndex = -1;
  private pinned = false;
  private frame: SceneFrame | undefined;
  private pending = false;
  private playing: string | null = null;
  private playTimer = 0;
  private lastTick = 0;
  private cleanups: (() => void)[] = [];
  private inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  private outputs = new Map<string, HTMLOutputElement>();
  private readonly doc: Document;
  private readonly view: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly data: StageData,
  ) {
    this.doc = root.ownerDocument;
    this.view = q<HTMLElement>(root, '[data-stage-view]')!;
    this.viewer = new Viewer3D(q<HTMLElement>(root, '[data-stage-canvas]')!);
  }

  async start(): Promise<void> {
    this.def = await loadScene(this.data.scene);
    await yieldTask();
    this.buildControls();
    this.buildLayersMenu();
    this.wireToolbar();
    this.wireStates();
    this.wireKeys();
    this.wirePick();
    this.viewer.onContextLost = () => this.root.classList.remove('is-live');
    this.viewer.onCamera = () => this.updateCameraReadout();
    this.viewer.start();
    await yieldTask();
    const initial = this.pickFromScroll();
    this.applyState(initial, false);
    this.root.classList.add('is-live');
    this.root.setAttribute('data-stage-ready', 'true');
    this.wireSync();
  }

  /* States */

  private applyState(i: number, animate: boolean): void {
    const st = this.data.states[i];
    if (!st) return;
    this.stateIndex = i;
    this.params = withDefaults(this.def, st.params);
    for (const p of this.def.params) this.setInput(p);
    this.stopPlay();
    this.rebuild(st.camera ?? true, st.layers ?? null, animate);
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-state]'))
      b.setAttribute('aria-current', b.dataset.state === String(i) ? 'step' : 'false');
    const cap = q<HTMLElement>(this.root, '[data-stage-caption]');
    if (cap) cap.textContent = st.caption;
    this.root.setAttribute('data-state', st.id);
    const count = q<HTMLElement>(this.root, '[data-stage-count]');
    if (count) count.textContent = `${i + 1} of ${this.data.states.length}`;
  }

  private rebuild(camera: CameraSpec | boolean, groups: string[] | null | undefined, animate: boolean): void {
    const t0 = performance.now();
    this.frame = this.def.build(this.params);
    const ms = performance.now() - t0;
    this.root.setAttribute('data-build-ms', ms.toFixed(1));
    const vis = groups === undefined ? (this.viewer.groupList.length ? this.currentGroups() : null) : groups;
    // a parameter change keeps the reader's direction and zoom but frames the new picture (M16.5)
    if (camera === false || camera === true)
      this.viewer.setFrame(this.frame, vis, camera === true ? true : 'refit', true);
    else {
      this.viewer.setFrame(this.frame, vis, false);
      if (this.frame.ortho !== undefined) this.viewer.setOrtho(this.frame.ortho);
      this.viewer.goTo(camera, animate);
    }
    this.syncLayersMenu();
    this.updateText();
  }

  private currentGroups(): string[] | null {
    const all = this.frame?.layers.map((l) => l.group) ?? [];
    const vis = [...new Set(all)].filter((g) => this.viewer.isVisible(g));
    return vis.length === new Set(all).size ? null : vis;
  }

  private updateText(): void {
    const f = this.frame;
    if (!f) return;
    const d = q<HTMLElement>(this.root, '[data-stage-describe]');
    if (d) d.textContent = f.describe;
    const dl = q<HTMLElement>(this.root, '[data-stage-readouts]');
    if (dl) {
      dl.replaceChildren();
      for (const r of f.readouts ?? []) {
        const div = el(this.doc, 'div');
        div.append(el(this.doc, 'dt', {}, r.label), el(this.doc, 'dd', {}, r.value));
        dl.append(div);
      }
    }
    const axes = q<HTMLElement>(this.root, '[data-stage-axes]');
    if (axes) {
      axes.hidden = !f.axes;
      axes.textContent = f.axes ? `Axes: x ${f.axes[0]}, y ${f.axes[1]}, z ${f.axes[2]}` : '';
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-needs-lattice]')) b.hidden = !f.lattice;
  }

  private scheduleRebuild(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.rebuild(false, undefined, false);
    });
  }

  /* Controls generated from the scene's parameters */

  private buildControls(): void {
    const box = q<HTMLElement>(this.root, '[data-stage-controls]');
    if (!box) return;
    box.replaceChildren();
    const uid = this.root.id || 'stage';
    for (const p of this.def.params) {
      const id = `${uid}-p-${p.id}`;
      const row = el(this.doc, 'div', { class: `stage-param stage-param-${p.kind}` });
      const label = el(this.doc, 'label', { for: id }, p.label);
      if (p.kind === 'select') {
        const s = el(this.doc, 'select', { id });
        for (const o of p.options) s.append(el(this.doc, 'option', { value: o.value }, o.label));
        s.addEventListener('change', () => this.change(p.id, s.value));
        row.append(label, s);
        this.inputs.set(p.id, s);
      } else if (p.kind === 'toggle') {
        const c = el(this.doc, 'input', { id, type: 'checkbox' });
        c.addEventListener('change', () => this.change(p.id, c.checked));
        row.append(c, label);
        this.inputs.set(p.id, c);
      } else {
        const min = p.kind === 'time' ? 0 : p.min;
        const max = p.kind === 'time' ? p.period : p.max;
        const step = p.kind === 'slider' ? p.step : p.kind === 'step' ? 1 : p.period / 100;
        const r = el(this.doc, 'input', {
          id,
          type: 'range',
          min: String(min),
          max: String(max),
          step: String(step),
        });
        const out = el(this.doc, 'output', { for: id });
        r.addEventListener('input', () => this.change(p.id, Number(r.value)));
        row.append(label, r, out);
        this.inputs.set(p.id, r);
        this.outputs.set(p.id, out);
        if (p.kind === 'step' || p.kind === 'time') {
          const play = el(
            this.doc,
            'button',
            { type: 'button', class: 'btn btn-small', 'aria-pressed': 'false', 'data-play': p.id },
            'Play',
          );
          play.addEventListener('click', () => (this.playing === p.id ? this.stopPlay() : this.startPlay(p)));
          if (p.kind === 'step') {
            const prev = el(
              this.doc,
              'button',
              { type: 'button', class: 'btn btn-small', 'aria-label': `${p.label}: previous` },
              'Previous',
            );
            const next = el(
              this.doc,
              'button',
              { type: 'button', class: 'btn btn-small', 'aria-label': `${p.label}: next` },
              'Next',
            );
            prev.addEventListener('click', () =>
              this.change(p.id, Math.max(p.min, Number(this.params[p.id]) - 1)),
            );
            next.addEventListener('click', () =>
              this.change(p.id, Math.min(p.max, Number(this.params[p.id]) + 1)),
            );
            row.append(prev, play, next);
          } else row.append(play);
        }
      }
      if (p.physics) row.dataset.physics = 'true';
      box.append(row);
    }
  }

  private setInput(p: ParamDef): void {
    const input = this.inputs.get(p.id);
    const v = this.params[p.id];
    if (!input || v === undefined) return;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = !!v;
    else input.value = String(v);
    const out = this.outputs.get(p.id);
    if (out) out.textContent = this.formatValue(p, v);
  }

  private formatValue(p: ParamDef, v: Params[string]): string {
    if (p.kind === 'slider')
      return `${Number(v).toFixed(p.digits ?? Math.max(0, -Math.floor(Math.log10(p.step || 1))))}${p.unit ? ` ${p.unit}` : ''}`;
    if (p.kind === 'step') return `${v} of ${p.max}`;
    if (p.kind === 'time') return `${((Number(v) / p.period) * 100).toFixed(0)}%`;
    return String(v);
  }

  private change(id: string, v: Params[string]): void {
    const p = this.def.params.find((x) => x.id === id);
    if (!p) return;
    this.params[id] = v;
    this.setInput(p);
    this.scheduleRebuild();
  }

  private startPlay(p: ParamDef & { kind: 'step' | 'time' }): void {
    this.stopPlay();
    this.playing = p.id;
    const btn = q<HTMLButtonElement>(this.root, `[data-play="${p.id}"]`);
    btn?.setAttribute('aria-pressed', 'true');
    if (btn) btn.textContent = 'Pause';
    this.lastTick = performance.now();
    const tick = (now: number) => {
      if (this.playing !== p.id) return;
      const dt = (now - this.lastTick) / 1000;
      if (p.kind === 'time') {
        this.lastTick = now;
        this.change(p.id, (Number(this.params[p.id]) + dt) % p.period);
      } else if (dt >= (p.interval ?? 0.7)) {
        this.lastTick = now;
        const n = Number(this.params[p.id]) + 1;
        if (n > p.max) return this.stopPlay();
        this.change(p.id, n);
      }
      this.playTimer = requestAnimationFrame(tick);
    };
    this.playTimer = requestAnimationFrame(tick);
  }

  private stopPlay(): void {
    if (!this.playing) return;
    const btn = q<HTMLButtonElement>(this.root, `[data-play="${this.playing}"]`);
    btn?.setAttribute('aria-pressed', 'false');
    if (btn) btn.textContent = 'Play';
    this.playing = null;
    cancelAnimationFrame(this.playTimer);
  }

  /* Layers menu */

  private buildLayersMenu(): void {
    const box = q<HTMLElement>(this.root, '[data-stage-layers]');
    if (!box) return;
    box.replaceChildren();
    const frame = this.def.build(withDefaults(this.def, {}));
    const seen = new Map<string, string>();
    for (const l of frame.layers) if (!seen.has(l.group)) seen.set(l.group, l.name ?? l.group);
    for (const st of this.data.states) for (const g of st.layers ?? []) if (!seen.has(g)) seen.set(g, g);
    const uid = this.root.id || 'stage';
    for (const [g, name] of seen) {
      const id = `${uid}-l-${g}`;
      const row = el(this.doc, 'div', { class: 'stage-layer' });
      const c = el(this.doc, 'input', { id, type: 'checkbox', 'data-layer': g });
      c.checked = true;
      c.addEventListener('change', () => {
        const groups = [...box.querySelectorAll<HTMLInputElement>('[data-layer]')]
          .filter((x) => x.checked)
          .map((x) => x.dataset.layer!);
        this.viewer.setGroups(groups.length === seen.size ? null : groups);
      });
      row.append(c, el(this.doc, 'label', { for: id }, name.replace(/-/g, ' ')));
      box.append(row);
    }
  }

  private syncLayersMenu(): void {
    for (const c of this.root.querySelectorAll<HTMLInputElement>('[data-layer]'))
      c.checked = this.viewer.isVisible(c.dataset.layer!);
  }

  /* Toolbar: views, projection, reset, pin */

  private wireToolbar(): void {
    const on = (sel: string, fn: (b: HTMLElement) => void) => {
      for (const b of this.root.querySelectorAll<HTMLElement>(sel)) b.addEventListener('click', () => fn(b));
    };
    on('[data-act="reset"]', () => this.viewer.reset());
    on('[data-view]', (b) => {
      this.viewer.goTo(b.dataset.view as CameraSpec);
      this.announce(`View ${b.getAttribute('aria-label') ?? b.textContent ?? ''}.`);
    });
    on('[data-act="ortho"]', (b) => {
      const on = !this.viewer.isOrtho;
      this.viewer.setOrtho(on);
      b.setAttribute('aria-pressed', String(on));
    });
    on('[data-act="pin"]', (b) => {
      this.pinned = !this.pinned;
      b.setAttribute('aria-pressed', String(this.pinned));
      this.announce(
        this.pinned
          ? 'The 3D view stays where it is while you read.'
          : 'The 3D view follows the section you read.',
      );
    });
    const form = q<HTMLFormElement>(this.root, '[data-stage-indices]');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = q<HTMLInputElement>(form, 'input');
      const kind = (q<HTMLSelectElement>(form, 'select')?.value ?? 'direction') as 'direction' | 'plane';
      const idx = parseIndices(input?.value ?? '');
      const msg = q<HTMLElement>(form, '[data-indices-msg]');
      if (!idx) {
        if (msg) msg.textContent = 'Type three integers, for example 1 1 0.';
        return;
      }
      const ok = this.viewer.viewIndices(kind, idx);
      if (msg)
        msg.textContent = ok
          ? `Looking along ${kind === 'direction' ? `[${idx.join(' ')}]` : `the normal of (${idx.join(' ')})`}.`
          : 'This view has no lattice.';
    });
    const proj = q<HTMLElement>(this.root, '[data-act="ortho"]');
    proj?.setAttribute('aria-pressed', String(this.viewer.isOrtho));
  }

  private updateCameraReadout(): void {
    const b = q<HTMLElement>(this.root, '[data-act="ortho"]');
    b?.setAttribute('aria-pressed', String(this.viewer.isOrtho));
  }

  private wireStates(): void {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-state]')) {
      b.disabled = false;
      b.addEventListener('click', () => {
        this.applyState(Number(b.dataset.state), true);
        this.announce(this.data.states[Number(b.dataset.state)]?.caption ?? '');
      });
    }
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-step]'))
      b.addEventListener('click', () => {
        const i = stepState(this.data.states.length, this.stateIndex, Number(b.dataset.step));
        this.applyState(i, true);
        this.announce(this.data.states[i]?.caption ?? '');
      });
  }

  private announce(text: string): void {
    const live = q<HTMLElement>(this.root, '[data-stage-live]');
    if (live) live.textContent = text;
  }

  /* Keyboard: the view is a focusable region with its own keys (listed in the Keys panel) */

  private wireKeys(): void {
    const v = this.viewer;
    const fn = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const k = e.key;
      const big = e.shiftKey ? 15 : 5;
      if (e.shiftKey && k.startsWith('Arrow')) {
        const d = 0.05;
        v.pan(
          k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0,
          k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0,
        );
      } else if (k === 'ArrowLeft') v.rotate(-big, 0);
      else if (k === 'ArrowRight') v.rotate(big, 0);
      else if (k === 'ArrowUp') v.rotate(0, big);
      else if (k === 'ArrowDown') v.rotate(0, -big);
      else if (k === '+' || k === '=') v.zoom(1 / 1.15);
      else if (k === '-' || k === '_') v.zoom(1.15);
      else if (k === 'q' || k === 'Q') v.roll(-big);
      else if (k === 'e' || k === 'E') v.roll(big);
      else if (k === 'r' || k === 'R') v.reset();
      else if (k === 'o' || k === 'O') {
        v.setOrtho(!v.isOrtho);
        this.announce(v.isOrtho ? 'Orthographic view.' : 'Perspective view.');
      } else if (k === 'PageDown' || k === ']') {
        this.applyState(stepState(this.data.states.length, this.stateIndex, 1), true);
        this.announce(this.data.states[this.stateIndex]?.caption ?? '');
      } else if (k === 'PageUp' || k === '[') {
        this.applyState(stepState(this.data.states.length, this.stateIndex, -1), true);
        this.announce(this.data.states[this.stateIndex]?.caption ?? '');
      } else return;
      e.preventDefault();
    };
    this.view.addEventListener('keydown', fn);
    this.cleanups.push(() => this.view.removeEventListener('keydown', fn));
  }

  /* Picking: a click that did not drag reads what is under the pointer */

  private wirePick(): void {
    let down: { x: number; y: number } | null = null;
    const canvasBox = q<HTMLElement>(this.root, '[data-stage-canvas]')!;
    canvasBox.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    canvasBox.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const hit = this.viewer.pick(e.clientX, e.clientY);
      const out = q<HTMLElement>(this.root, '[data-stage-pick]');
      if (!out) return;
      if (!hit) {
        out.textContent = '';
        this.viewer.setHighlight([]);
        return;
      }
      const at = hit.position.map((x) => x.toFixed(2)).join(', ');
      out.textContent =
        hit.value !== undefined
          ? `Value ${hit.value.toPrecision(3)} at (${at}).`
          : `${hit.label} at (${at}).`;
      if (hit.kind === 'atoms') this.viewer.setHighlight([`${hit.group}:${hit.index}`]);
    });
  }

  /* Follow the reader */

  private sectionOrder(): string[] {
    return [...this.doc.querySelectorAll<HTMLElement>('section.topic-section[id]')].map((s) => s.id);
  }

  private pickFromScroll(): number {
    const order = this.sectionOrder();
    const tops: Record<string, number> = {};
    for (const id of order) {
      const h = this.doc.getElementById(`${id}-h`) ?? this.doc.getElementById(id);
      if (h) tops[id] = h.getBoundingClientRect().top;
    }
    return activeState(this.data.states, tops, this.doc.defaultView?.innerHeight ?? 800, order);
  }

  private wireSync(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    let queued = false;
    const onScroll = () => {
      if (queued || this.pinned) return;
      queued = true;
      win.requestAnimationFrame(() => {
        queued = false;
        const i = this.pickFromScroll();
        if (i !== this.stateIndex) this.applyState(i, true);
      });
    };
    win.addEventListener('scroll', onScroll, { passive: true });
    this.cleanups.push(() => win.removeEventListener('scroll', onScroll));
  }

  dispose(): void {
    this.stopPlay();
    for (const c of this.cleanups.splice(0)) c();
    this.viewer.dispose();
    this.root.classList.remove('is-live');
  }
}

/** Boot entry: read the stage data, check WebGL, start the live view. Falls back to the poster with a reason. */
export async function mountStage(root: HTMLElement): Promise<StageApp | null> {
  const json = root.querySelector('script[type="application/json"][data-stage-data]');
  if (!json?.textContent) return null;
  const data = JSON.parse(json.textContent) as StageData;
  if (!hasWebGL(root.ownerDocument)) {
    root.classList.add('no-webgl');
    const note = root.querySelector<HTMLElement>('[data-stage-nogl]');
    if (note) note.hidden = false;
    return null;
  }
  const app = new StageApp(root, data);
  await app.start();
  return app;
}
