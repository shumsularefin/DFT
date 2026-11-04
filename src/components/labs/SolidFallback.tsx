import { useId, useMemo, useState } from 'react';
import Slider from '../ui/Slider';
import { project } from '../../lib/three/project';
import { toScene } from '../../lib/three/cellEdges';
import { projectSolid, type Solid } from '../../lib/three/solid';
import type { Vec3 } from '../../lib/crystal/types';

export interface FlatPoint {
  /** Position in the same Cartesian frame as the solid. */
  at: Vec3;
  label?: string;
  color: string;
}

interface Props {
  solid: Solid;
  points?: readonly FlatPoint[];
  /** Extra line segments (for example the k-path), drawn on top. */
  segments?: readonly (readonly [Vec3, Vec3])[];
  /** Accessible name of the drawing. */
  label: string;
  size?: number;
}

/** Flat orthographic view of a convex solid for readers without WebGL: hidden edges dashed, rotation by sliders. */
export default function SolidFallback({ solid, points = [], segments = [], label, size = 340 }: Props) {
  const id = useId();
  const [az, setAz] = useState(30);
  const [el, setEl] = useState(20);
  const view = useMemo(() => projectSolid(solid, az, el), [solid, az, el]);
  const reach = useMemo(
    () =>
      Math.max(
        1e-6,
        ...solid.vertices.map((v) => Math.hypot(v[0], v[1], v[2])),
        ...points.map((p) => Math.hypot(...p.at)),
      ),
    [solid, points],
  );
  const k = (size * 0.42) / reach;
  const px = (v: Vec3) => {
    const p = project(toScene(v[0], v[1], v[2]), az, el);
    return { x: size / 2 + p.x * k, y: size / 2 - p.y * k, depth: p.depth };
  };
  const dots = points.map((p) => ({ ...p, ...px(p.at) })).sort((a, b) => a.depth - b.depth);
  return (
    <div className="fallback2d">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${id}-t`} className="fallback2d-svg">
        <title id={`${id}-t`}>{label}</title>
        {view.edges.map((e, i) => {
          const p = view.points[e.a]!;
          const q = view.points[e.b]!;
          return (
            <line
              key={i}
              x1={size / 2 + p.x * k}
              y1={size / 2 - p.y * k}
              x2={size / 2 + q.x * k}
              y2={size / 2 - q.y * k}
              stroke="var(--text-muted)"
              strokeWidth="1.5"
              strokeDasharray={e.hidden ? '4 3' : undefined}
              data-hidden={e.hidden ? 'true' : 'false'}
            />
          );
        })}
        {segments.map(([a, b], i) => {
          const p = px(a);
          const q = px(b);
          return (
            <line key={`s${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--accent)" strokeWidth="3" />
          );
        })}
        {dots.map((d, i) => (
          <g key={i}>
            <circle cx={d.x} cy={d.y} r="4.5" fill={d.color} stroke="var(--text)" strokeWidth="1" />
            {d.label ? (
              <text x={d.x + 7} y={d.y - 6} fontSize="12" fill="var(--text)">
                {d.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <Slider
        label="Turn around the vertical axis"
        min={-180}
        max={180}
        value={az}
        unit="°"
        onChange={setAz}
      />
      <Slider label="Tilt" min={-90} max={90} value={el} unit="°" onChange={setEl} />
      <p className="cv-note">Dashed edges are on the far side of the solid.</p>
    </div>
  );
}
