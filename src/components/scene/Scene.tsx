// Scene island (M12.2, on the shared engine since M16.4): the flat SVG projection first (no three.js on load), a "View in 3D"
// button that loads the engine (Viewer3D, free arcball camera, D-108) on demand, camera presets, keyboard rotation, reset
// view and step controls. The preset becomes an engine frame through `fromSceneSpec` (D-121), drawn in the shared Studio
// look (D-122). D-058: only one live canvas per page.
// With `auto3D` (the guided path, D-112) the island opens the free 3D view by itself once it is on the page, when the browser
// can draw WebGL and the reader has not asked for reduced motion; otherwise the flat view stays and can be turned by dragging
// or with the arrow keys.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Badge from '../ui/Badge';
import { claimCanvas } from '../../lib/scene/canvasSlot';
import { projectScene, rotateCamera } from '../../lib/scene/project';
import { resolveScene } from '../../lib/scene/resolve';
import type { Camera, SceneSpec } from '../../lib/scene/spec';
import { projectionToSvg } from '../../lib/scene/svg';
import { hasWebGL, prefersReducedMotion, shouldStart3D } from '../../lib/three/capabilities';
import type { IslandView } from '../../lib/viewer3d/islandView';
import '../stage/v3d.css';
import './scene.css';
import '../ui/button.css';

type Engine = typeof import('../../lib/viewer3d/islandView');

interface Props {
  /** A spec whose structure is inline (the Astro wrapper resolves named structures at build time). */
  spec: SceneSpec;
  /** Start with the 3D view open (the guided path keeps one canvas across its scene stations). */
  initialLive?: boolean;
  /** Open the 3D view by itself after mounting when WebGL exists and reduced motion is off (shouldStart3D). */
  auto3D?: boolean;
  /** Called when the reader opens or closes the 3D view. */
  onLiveChange?: (live: boolean) => void;
}

const never = (): undefined => undefined;
const NO_WEBGL =
  'This browser cannot draw 3D, so the flat view stays. You can still turn it by dragging or with the arrow keys.';
/** Degrees the flat view turns per pixel of drag. */
const DRAG_DEG = 0.5;

export default function Scene({ spec, initialLive = false, auto3D = false, onLiveChange }: Props) {
  const uid = useId().replace(/:/g, '');
  const steps = spec.steps ?? [];
  const [step, setStep] = useState(steps.length ? 0 : -1);
  const [camera, setCamera] = useState<Camera | undefined>(undefined);
  // always mount flat (the server render and the first client render match); the effect below opens 3D when asked
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState('');
  const view = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<IslandView | null>(null);
  const engine = useRef<Engine | null>(null);
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

  // a different preset (or its own camera) starts from its own step and view
  const camKey = JSON.stringify(spec.camera ?? null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStep(spec.steps?.length ? 0 : -1);
    setCamera(undefined);
  }, [spec.id, camKey]);

  // open the 3D view by itself, once, when the caller asked for it and the browser allows it
  useEffect(() => {
    if (!initialLive && !auto3D) return;
    const webgl = hasWebGL();
    if (!webgl) {
      setNote(NO_WEBGL);
      return;
    }
    if (
      shouldStart3D({
        webgl,
        reducedMotion: prefersReducedMotion(),
        visible: true,
        userRequested: initialLive,
      })
    )
      setLive(true);
  }, []);

  // report real changes only: the first, flat render is not the reader closing the 3D view
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) {
      reported.current = true;
      return;
    }
    onLiveChange?.(live);
  }, [live]);

  // the same resolved geometry as the flat view, as engine layers; a new step keeps the reader's view unless its camera changed
  const draw = useCallback(
    (reset: boolean) => {
      const m = engine.current;
      if (!ctl.current || !m) return;
      ctl.current.show(m.frameFromResolved(resolved, spec.alt), reset);
    },
    [resolved, spec.alt],
  );

  // the live canvas exists exactly as long as `live`; closing, unmounting or another scene claiming the slot disposes it
  useEffect(() => {
    if (!live || !host.current || !view.current) return;
    let dead = false;
    let give: (() => void) | undefined;
    setLoading(true);
    import('../../lib/viewer3d/islandView')
      .then((m) => {
        if (dead || !host.current || !view.current) return;
        engine.current = m;
        const c = new m.IslandView(view.current, host.current, { onPick: setPicked });
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
      setPicked('');
    };
  }, [live]);

  // follow step changes while live (a step with its own camera moves the view; the others keep it)
  useEffect(() => {
    if (!ctl.current) return;
    const key = JSON.stringify(resolved.camera);
    const changed = key !== lastCam.current;
    lastCam.current = key;
    draw(changed);
  }, [resolved, draw]);

  const open3D = () => {
    if (!hasWebGL()) {
      setNote(NO_WEBGL);
      return;
    }
    setNote('');
    setLive(true);
  };
  const preset = (c: Camera) => {
    setCamera(c);
    const m = engine.current;
    if (ctl.current && m) ctl.current.goTo(m.cameraOfPreset(c, lattice));
  };
  const reset = () => {
    setCamera(undefined);
    const m = engine.current;
    if (ctl.current && m) ctl.current.goTo(m.cameraOfPreset(resolved.camera, lattice), false);
  };
  const zoom = (f: number) => ctl.current?.zoom(f);

  // the flat view turns under a drag too, so it never behaves like a still picture. Native listeners: the move and up
  // listeners sit on the window while a drag lasts, so the drag keeps going when the SVG under the pointer is redrawn.
  const flatEl = useRef<HTMLDivElement>(null);
  const camNow = useRef(cam);
  camNow.current = cam;
  const latticeNow = useRef(lattice);
  latticeNow.current = lattice;
  useEffect(() => {
    const el = flatEl.current;
    if (live || !el) return;
    let stop: (() => void) | undefined;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // no text selection or native drag of the labels
      el.focus();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const start = camNow.current;
      const move = (m: PointerEvent) => {
        const dx = m.clientX - x0;
        const dy = m.clientY - y0;
        if (Math.abs(dx) + Math.abs(dy) < 2) return;
        // same sense as the 3D drag: drag right turns the crystal right
        setCamera(rotateCamera(start, latticeNow.current, -dx * DRAG_DEG, dy * DRAG_DEG));
      };
      const up = () => stop?.();
      stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        stop = undefined;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
    el.addEventListener('pointerdown', down);
    return () => {
      el.removeEventListener('pointerdown', down);
      stop?.();
    };
  }, [live]);
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
        <div className="scene-stage" ref={view} data-testid="scene-3d">
          <div className="scene-host" ref={host} />
        </div>
      ) : (
        <div
          className="scene-stage scene-flat"
          tabIndex={0}
          role="group"
          aria-label="Flat view. Drag or use the arrow keys to turn the picture, R resets it."
          data-view={typeof cam === 'string' ? cam : `${cam.azimuth} ${cam.elevation}`}
          onKeyDown={onFlatKey}
          ref={flatEl}
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
        {live && (
          <>
            <button type="button" className="btn" onClick={() => zoom(1 / 1.25)}>
              Zoom in
            </button>
            <button type="button" className="btn" onClick={() => zoom(1.25)}>
              Zoom out
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={reset}>
          Reset view
        </button>
      </div>
      {live && !loading && (
        <p className="scene-help">
          Drag to turn it any way, with no stop at the poles. Scroll or pinch to zoom. Shift-drag to move it,
          right-drag to roll it. Click an atom to read it. With the picture focused: arrow keys turn, plus and
          minus zoom, W A S D move, Q and E roll, P switches the projection, R resets.
        </p>
      )}
      {live && (
        <p className="scene-pick" aria-live="polite">
          {picked}
        </p>
      )}
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
