// Question visuals, part 2 (M12.3): turns the `visual` of a question into a ready figure. Build time and tests only.
// A scene visual is a preset from src/data/scenes with optional overrides (checked by the same validator as every
// preset); a plot visual is drawn by plots.ts. The figure carries a flat SVG so the page needs no WebGL to show it.
import type { Visual } from '../learning/questions';
import { getScene, lookupStructure } from '../scene/library';
import { projectScene } from '../scene/project';
import { resolveScene, structureOf } from '../scene/resolve';
import { assertSpec, type SceneSpec } from '../scene/spec';
import { projectionToSvg } from '../scene/svg';
import { renderPlot, type PlotBadge } from './plots';

export interface Figure {
  kind: 'scene' | 'plot';
  svg: string;
  badge: PlotBadge;
  caption: string;
  alt: string;
  /** Present for scenes: the spec with its structure inline, for the "View in 3D" island. */
  spec?: SceneSpec;
}

/** Returns null for an exemption (`none`). Throws on an unknown preset or plot so a bad entry fails the build. */
export function resolveVisual(v: Visual | undefined, qid = 'question'): Figure | null {
  if (!v) throw new Error(`${qid}: no visual`);
  if ('none' in v) return null;
  if ('plot' in v) {
    const out = renderPlot(v.plot, v.params ?? {}, v.alt);
    return { kind: 'plot', svg: out.svg, badge: out.badge, caption: v.caption, alt: v.alt };
  }
  const base = getScene(v.scene);
  const merged = { ...base, ...(v.overrides ?? {}), id: base.id, alt: v.alt, caption: v.caption };
  assertSpec(merged);
  const structure = structureOf(merged, lookupStructure);
  const spec: SceneSpec = { ...merged, structure };
  const resolved = resolveScene(spec, () => undefined);
  const svg = projectionToSvg(projectScene(resolved, structure.lattice), spec.alt, `fig-${qid}`);
  return { kind: 'scene', svg, badge: spec.badge, caption: v.caption, alt: v.alt, spec };
}
