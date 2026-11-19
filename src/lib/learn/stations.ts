// Guided path (M12.4): the station format, its validator and the pure resolution of a station's picture.
// No drawing here. A station shows one existing picture (a scene preset from M12.2 or a plot from M12.3), three short
// sentences, one thing to try and a link to the full topic. The numbers in the pictures come from the existing, tested
// modules; this file adds none. Sources are those of the linked topics.
import type { Camera } from '../scene/spec';

export type StationBadge = 'computed' | 'toy-model' | 'illustrative';
type Params = Record<string, unknown>;

export interface SceneVisual {
  kind: 'scene';
  scene: string;
  repeat?: [number, number, number];
  camera?: Camera;
}
export interface PlotVisual {
  kind: 'plot';
  plot: string;
  params: Params;
}
export type StationVisual = SceneVisual | PlotVisual;

/** One option of a choice: a plot option changes params, a scene option may swap the scene, repeat or camera. */
export interface ChoiceOption {
  label: string;
  params?: Params;
  scene?: string;
  repeat?: [number, number, number];
  camera?: Camera;
}
export interface TrySlider {
  kind: 'slider';
  label: string;
  /** The plot parameter the slider sets. */
  param: string;
  min: number;
  max: number;
  step: number;
  value: number;
}
export interface TryChoice {
  kind: 'choice';
  label: string;
  options: ChoiceOption[];
  initial: number;
}
export type StationTry = TrySlider | TryChoice;

export interface Station {
  id: string;
  title: string;
  badge: StationBadge;
  /** Text alternative of the picture. For a scene the preset's own description is shown as well. */
  alt: string;
  sentences: [string, string, string];
  visual: StationVisual;
  try: StationTry;
  /** Handbook topic id, "NN-module/slug". */
  topic: string;
  tool?: { href: string; label: string };
  sources: string[];
}

export const topicHref = (topic: string): string => `/handbook/${topic}/`;

/** What the reader currently sees: the station's visual with the try-this state applied. */
export type Shown =
  | { kind: 'plot'; plot: string; params: Params }
  | { kind: 'scene'; scene: string; repeat?: [number, number, number]; camera?: Camera };

/** `value` is the slider position or the chosen option index. A missing or invalid value means the station's own start. */
export function resolveStation(st: Station, value?: number): Shown {
  const t = st.try;
  const v = st.visual;
  if (t.kind === 'slider') {
    const x = typeof value === 'number' && Number.isFinite(value) ? clamp(value, t.min, t.max) : t.value;
    if (v.kind !== 'plot') return { kind: 'scene', scene: v.scene, repeat: v.repeat, camera: v.camera };
    return { kind: 'plot', plot: v.plot, params: { ...v.params, [t.param]: x } };
  }
  const i = Number.isInteger(value) && value! >= 0 && value! < t.options.length ? value! : t.initial;
  const o = t.options[i]!;
  if (v.kind === 'plot') return { kind: 'plot', plot: v.plot, params: { ...v.params, ...(o.params ?? {}) } };
  return {
    kind: 'scene',
    scene: o.scene ?? v.scene,
    repeat: o.repeat ?? v.repeat,
    camera: o.camera ?? v.camera,
  };
}

/** Every state the "try this" control can reach, for checks. */
export function allStates(st: Station): number[] {
  const t = st.try;
  if (t.kind === 'choice') return t.options.map((_, i) => i);
  const out: number[] = [];
  for (let x = t.min; x <= t.max + 1e-9; x += t.step) out.push(Math.round(x * 1e9) / 1e9);
  return out;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface Known {
  sceneIds: readonly string[];
  plotIds: readonly string[];
  topicIds: readonly string[];
  sourceIds: readonly string[];
}
export interface StationIssue {
  station: string;
  message: string;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const BADGES: readonly string[] = ['computed', 'toy-model', 'illustrative'];

/** Check a list of stations. Returns a list of problems, empty when the list is fine. */
export function validateStations(list: unknown, known: Known): StationIssue[] {
  const out: StationIssue[] = [];
  if (!Array.isArray(list) || list.length === 0)
    return [{ station: '(file)', message: 'expected a non-empty list' }];
  const seen = new Set<string>();
  for (const [n, raw] of list.entries()) {
    const s = isObj(raw) ? raw : {};
    const id = nonEmpty(s.id) ? s.id : `#${n + 1}`;
    const bad = (message: string) => out.push({ station: id, message });
    if (!nonEmpty(s.id)) bad('id is required');
    else if (seen.has(s.id)) bad('duplicate id');
    else seen.add(s.id);
    if (!nonEmpty(s.title)) bad('title is required');
    if (!BADGES.includes(s.badge as string)) bad('badge must be computed, toy-model or illustrative');
    if (!nonEmpty(s.alt)) bad('alt (text alternative) is required');
    if (!Array.isArray(s.sentences) || s.sentences.length !== 3 || !s.sentences.every(nonEmpty))
      bad('exactly three non-empty sentences are required');
    if (!nonEmpty(s.topic)) bad('topic link is required');
    else if (!known.topicIds.includes(s.topic)) bad(`topic "${s.topic}" does not exist`);
    if (!Array.isArray(s.sources) || s.sources.length === 0) bad('at least one source id is required');
    else
      for (const x of s.sources)
        if (!known.sourceIds.includes(x as string)) bad(`unknown source ${String(x)}`);
    if (s.tool !== undefined) {
      const t = s.tool as Record<string, unknown>;
      if (!isObj(t) || !nonEmpty(t.href) || !String(t.href).startsWith('/') || !nonEmpty(t.label))
        bad('tool needs an internal href and a label');
    }
    const v = s.visual as Record<string, unknown> | undefined;
    if (!isObj(v)) bad('visual is required');
    else if (v.kind === 'scene') {
      if (!known.sceneIds.includes(v.scene as string)) bad(`unknown scene "${String(v.scene)}"`);
    } else if (v.kind === 'plot') {
      if (!known.plotIds.includes(v.plot as string)) bad(`unknown plot "${String(v.plot)}"`);
      if (!isObj(v.params)) bad('plot params must be an object');
    } else bad('visual.kind must be scene or plot');
    const t = s.try as Record<string, unknown> | undefined;
    if (!isObj(t)) bad('try-this is required');
    else if (t.kind === 'slider') {
      const ok = ['min', 'max', 'step', 'value'].every(
        (k) => typeof t[k] === 'number' && Number.isFinite(t[k]),
      );
      if (!ok || !nonEmpty(t.param) || !nonEmpty(t.label))
        bad('slider needs label, param, min, max, step, value');
      else if ((t.min as number) >= (t.max as number) || (t.step as number) <= 0)
        bad('slider range is empty');
      else if ((t.value as number) < (t.min as number) || (t.value as number) > (t.max as number))
        bad('slider value is outside its range');
      if (isObj(v) && v.kind !== 'plot') bad('a slider needs a plot visual');
    } else if (t.kind === 'choice') {
      const opts = t.options;
      if (
        !nonEmpty(t.label) ||
        !Array.isArray(opts) ||
        opts.length < 2 ||
        !opts.every((o) => isObj(o) && nonEmpty(o.label))
      )
        bad('choice needs a label and at least two labelled options');
      else {
        if (!Number.isInteger(t.initial) || (t.initial as number) < 0 || (t.initial as number) >= opts.length)
          bad('choice initial is not an option');
        for (const o of opts as Record<string, unknown>[]) {
          if (o.scene !== undefined && !known.sceneIds.includes(o.scene as string))
            bad(`option scene "${String(o.scene)}" is unknown`);
        }
      }
    } else bad('try.kind must be slider or choice');
  }
  return out;
}
