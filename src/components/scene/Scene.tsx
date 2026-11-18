// Scene island (M12.2): the flat SVG projection first (no three.js on load), a "View in 3D" button that loads the renderer
// on demand, camera presets, keyboard rotation, reset view and step controls. D-058: only one live canvas per page.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Badge from '../ui/Badge';
import { claimCanvas } from '../../lib/scene/canvasSlot';
import { projectScene, rotateCamera } from '../../lib/scene/project';
import { resolveScene } from '../../lib/scene/resolve';
import type { Camera, SceneSpec } from '../../lib/scene/spec';
import { projectionToSvg } from '../../lib/scene/svg';
import { hasWebGL } from '../../lib/three/capabilities';
import type { SpecScene } from '../../lib/three/SpecScene';
import './scene.css';

interface Props {
  /** A spec whose structure is inline (the Astro wrapper resolves named structures at build time). */
  spec: SceneSpec;
}

const css = (name: string, fallback: string): string => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
};
const never = (): undefined => undefined;

export default function Scene({ spec }: Props) {
  const uid = useId().replace(/:/g, '');
  const steps = spec.steps ?? [];
  const [step, setStep] = useState(steps.length ? 0 : -1);
  const [camera, setCamera] = useState<Camera | undefined>(undefined);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<SpecScene | null>(null);
  const lastCam = useRef('');

  const resolved = useMemo(() => resolveScene(spec, never, step), [spec, step]);
  const lattice = resolved.structure.lattice;
  const cam: Camera = camera ?? resolved.camera;
  const flat = useMemo(
    () => projectionToSvg(projectScene(resolved, lattice, { camera: cam }), spec.alt, `sc-${uid}`),
    [resolved, lattice, cam, spec.alt, uid],
  );

  // a step that sets its own camera wins over a manual turn
  useEffect(() => setCamera(undefined), [step]);

  const draw = useCallback(
    (reset: boolean) => {
      ctl.current?.setResolved(
        resolved,
        lattice,
        {
          ink: css('--text', '#222222'),
          accent: css('--accent', '#a2431f'),
          muted: css('--border-strong', '#7b8494'),
        },
        reset,
      );
      if (!reset && camera) ctl.current?.setCamera(camera, resolved.extent, lattice);
    },
    [resolved, lattice, camera],
  );

  // the live canvas exists exactly as long as `live`; closing, unmounting or another scene claiming the slot disposes it
  useEffect(() => {
    if (!live || !host.current) return;
    let dead = false;
    let give: (() => void) | undefined;
    setLoading(true);
    import('../../lib/three/SpecScene')
      .then(({ createScene }) => {
        if (dead || !host.current) return;
        const c = createScene(host.current);
        c.start();
        ctl.current = c;
        give = claimCanvas(() => setLive(false));
        lastCam.current = JSON.stringify(resolved.camera);
        draw(true);
        setLoading(false);
      })
      .catch(() => {
        if (dead) return;
        setNote('The 3D view could not load, so the flat view stays.');
        setLive(false);
        setLoading(false);
      });
    return () => {
      dead = true;
      give?.();
      ctl.current?.dispose();
      ctl.current = null;
    };
  }, [live]);

  // follow step and camera changes while live
  useEffect(() => {
    if (!ctl.current) return;
    const key = JSON.stringify(resolved.camera);
    const changed = key !== lastCam.current;
    lastCam.current = key;
    draw(changed);
  }, [resolved, camera, draw]);

  const open3D = () => {
    if (!hasWebGL()) {
      setNote(
        'This browser cannot draw 3D, so the flat view stays. You can still turn it with the arrow keys.',
      );
      return;
    }
    setNote('');
    setLive(true);
  };
  const preset = (c: Camera) => {
    setCamera(c);
    if (ctl.current) ctl.current.setCamera(c, resolved.extent, lattice);
  };
  const reset = () => {
    setCamera(undefined);
    if (ctl.current) ctl.current.setCamera(resolved.camera, resolved.extent, lattice);
  };
  const onFlatKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = e.shiftKey ? 15 : 5;
    const turn = (a: number, b: number) => {
      setCamera(rotateCamera(cam, lattice, a, b));
      e.preventDefault();
    };
    if (e.key === 'ArrowLeft') turn(-d, 0);
    else if (e.key === 'ArrowRight') turn(d, 0);
    else if (e.key === 'ArrowUp') turn(0, d);
    else if (e.key === 'ArrowDown') turn(0, -d);
    else if (e.key === 'r' || e.key === 'R') {
      reset();
      e.preventDefault();
    }
  };

  const st = steps[step];
  return (
    <figure className="scene" data-scene-id={spec.id} data-live={live ? 'true' : 'false'}>
      <div className="scene-head">
        <Badge variant={spec.badge} />
      </div>
      {live ? (
        <div className="scene-stage" ref={host} data-testid="scene-3d" />
      ) : (
        <div
          className="scene-stage scene-flat"
          tabIndex={0}
          role="group"
          aria-label="Flat view. Arrow keys turn the picture, R resets it."
          data-view={typeof cam === 'string' ? cam : `${cam.azimuth} ${cam.elevation}`}
          onKeyDown={onFlatKey}
          // generated from numbers and escaped labels by projectionToSvg
          dangerouslySetInnerHTML={{ __html: flat }}
        />
      )}
      {loading && (
        <p className="scene-status" role="status">
          Loading the 3D view...
        </p>
      )}
      <div className="scene-controls" role="toolbar" aria-label="Scene controls">
        {live ? (
          <button type="button" className="btn" onClick={() => setLive(false)}>
            Back to flat view
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={open3D}>
            View in 3D
          </button>
        )}
        {(['a', 'b', 'c', 'iso'] as const).map((c) => (
          <button key={c} type="button" className="btn" onClick={() => preset(c)}>
            {c === 'iso' ? 'Isometric' : `Along ${c}`}
          </button>
        ))}
        <button type="button" className="btn" onClick={reset}>
          Reset view
        </button>
      </div>
      {note && (
        <p className="scene-status" role="status">
          {note}
        </p>
      )}
      {steps.length > 0 && (
        <div className="scene-steps">
          <button type="button" className="btn" disabled={step <= 0} onClick={() => setStep((s) => s - 1)}>
            Previous step
          </button>
          <button
            type="button"
            className="btn"
            disabled={step >= steps.length - 1}
            onClick={() => setStep((s) => s + 1)}
          >
            Next step
          </button>
          <p className="scene-step-text" aria-live="polite">
            <strong>
              Step {step + 1} of {steps.length}: {st?.title}
            </strong>
            {st?.text ? ` ${st.text}` : ''}
          </p>
        </div>
      )}
      <ul className="scene-legend" aria-label="Elements">
        {resolved.legend.map((l) => (
          <li key={l.symbol}>
            <span className="scene-swatch" style={{ background: l.color }} aria-hidden="true" /> {l.symbol}
          </li>
        ))}
      </ul>
      {spec.caption && <figcaption>{spec.caption}</figcaption>}
      <details className="scene-alt">
        <summary>Text description</summary>
        <p>{spec.alt}</p>
      </details>
    </figure>
  );
}
