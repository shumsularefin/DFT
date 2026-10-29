import { useCallback, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import Fallback2D from './Fallback2D';
import Toggle from '../ui/Toggle';
import { prefersReducedMotion } from '../../lib/three/capabilities';
import type { SceneController } from '../../lib/three/SceneController';
import { cubeEdges, DEMO_POINTS } from '../../lib/three/demo-geometry';

const load = (): Promise<SceneModule> => import('../../lib/three/DemoScene');

/** Demo lab for the framework: no science, only proof that start, fallback, dispose and reduced motion work. */
export default function LabDemo() {
  const [ctl, setCtl] = useState<SceneController | null>(null);
  const [spin, setSpin] = useState(false);
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  const onController = useCallback((c: SceneController | null) => {
    setCtl(c);
    if (!c) setSpin(false);
  }, []);
  return (
    <LabShell
      title="Framework demo"
      goal="Start the 3D view, drag to orbit, and turn the spin on or off."
      badge="illustrative"
      controls={
        ctl && (
          <>
            {reduced ? (
              <button type="button" className="btn" onClick={() => ctl.step(0.3)}>
                Step the rotation
              </button>
            ) : (
              <Toggle
                label="Spin"
                checked={spin}
                onChange={(v) => {
                  setSpin(v);
                  ctl.setAnimating(v);
                }}
              />
            )}
          </>
        )
      }
      readouts={[{ label: 'View', value: ctl ? '3D' : 'not started' }]}
      onReset={() => {
        ctl?.camera.position.set(5, 4, 7);
        ctl?.requestRender();
      }}
      notice="The cluster is a plain 3 by 3 by 3 grid of spheres inside a cube. It shows how the framework behaves and is not a physical model."
      description="A 3 by 3 by 3 grid of 27 blue spheres inside a wireframe cube, seen in perspective. You can orbit it with the mouse, touch or arrow keys. Without 3D support the same grid is drawn flat and the sliders set the viewing angle."
    >
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL. It loads only when you ask for it."
        fallback={
          <Fallback2D
            points={DEMO_POINTS}
            edges={cubeEdges(1.5)}
            label="Grid of 27 spheres inside a cube, flat view"
          />
        }
      />
    </LabShell>
  );
}
