import { useId, useState } from 'react';
import Slider from '../ui/Slider';
import { project, type Vec3 } from '../../lib/three/project';

interface Props {
  points: readonly Vec3[];
  edges?: readonly (readonly [Vec3, Vec3])[];
  /** Accessible name of the drawing. */
  label: string;
  size?: number;
}

/** Static orthographic view of a point set with azimuth and elevation sliders, for readers without WebGL. */
export default function Fallback2D({ points, edges = [], label, size = 320 }: Props) {
  const [az, setAz] = useState(30);
  const [el, setEl] = useState(20);
  const id = useId();
  const scale = size / 8;
  const px = (v: Vec3) => {
    const p = project(v, az, el);
    return { x: size / 2 + p.x * scale, y: size / 2 - p.y * scale, depth: p.depth };
  };
  const dots = points.map(px).sort((a, b) => a.depth - b.depth);
  return (
    <div className="fallback2d">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${id}-t`} className="fallback2d-svg">
        <title id={`${id}-t`}>{label}</title>
        {edges.map(([a, b], i) => {
          const p = px(a);
          const q = px(b);
          return (
            <line
              key={i}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke="var(--border-strong)"
              strokeWidth="1.5"
            />
          );
        })}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={7}
            fill="var(--accent)"
            fillOpacity={0.55 + 0.1 * Math.max(-1, Math.min(1, d.depth / 2))}
          />
        ))}
      </svg>
      <Slider label="Azimuth" min={0} max={360} step={5} value={az} unit="deg" onChange={setAz} />
      <Slider label="Elevation" min={-90} max={90} step={5} value={el} unit="deg" onChange={setEl} />
    </div>
  );
}
