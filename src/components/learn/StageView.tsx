// A live scene of the 3D engine on the guided path (M16.4, D-121): a viewer3d scene (src/lib/viewer3d/scenes) built from
// the station's parameters, drawn by the shared engine with the same free camera, keys and readout as the Scene island.
// The scene module and its flat poster load lazily (no three.js); the engine loads only when the view goes live. Like a
// scene station it opens by itself (D-112) unless the reader chose the flat view, asked for reduced motion or has no
// WebGL; then the poster (the same layers, projected) and the text description stay. One canvas at a time (D-058).
import { useEffect, useRef, useState } from 'react';
import Badge from '../ui/Badge';
import { claimCanvas } from '../../lib/scene/canvasSlot';
import { hasWebGL, prefersReducedMotion, shouldStart3D } from '../../lib/three/capabilities';
import type { StageCamera, StageParams, StationBadge } from '../../lib/learn/stations';
import type { IslandView } from '../../lib/viewer3d/islandView';
import type { CameraSpec, SceneFrame } from '../../lib/viewer3d/types';
import '../stage/v3d.css';
import '../scene/scene.css';

type Engine = typeof import('../../lib/viewer3d/islandView');

interface Props {
  /** viewer3d scene id. */
  scene: string;
  params: StageParams;
  camera?: StageCamera;
  badge: StationBadge;
  /** The station's own text alternative. */
  alt: string;
  /** Changes when the guided path moves to another station: the view then starts from the station's own camera. */
  resetKey?: string;
  initialLive?: boolean;
  auto3D?: boolean;
  onLiveChange?: (live: boolean) => void;
}

const NO_WEBGL =
  'This browser cannot draw 3D, so the flat view stays. The text description below says what it shows.';

/** Build the frame of a scene for some parameters (lazy: the scene registry and its module are separate chunks). */
async function buildFrame(
  scene: string,
  params: StageParams,
): Promise<{ frame: SceneFrame; poster: string }> {
  const [{ loadScene }, { withDefaults }, { posterSVG }] = await Promise.all([
    import('../../lib/viewer3d/scenes/index'),
    import('../../lib/viewer3d/types'),
    import('../../lib/viewer3d/poster'),
  ]);
  const def = await loadScene(scene);
  const frame = def.build(withDefaults(def, params));
  return { frame, poster: posterSVG(frame) };
}

export default function StageView({
  scene,
  params,
  camera,
  badge,
  alt,
  resetKey = '',
  initialLive = false,
  auto3D = false,
  onLiveChange,
}: Props) {
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState('');
  const [built, setBuilt] = useState<{ key: string; frame: SceneFrame; poster: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<IslandView | null>(null);
  const engine = useRef<Engine | null>(null);
  const shownView = useRef('');
  const shownCamera = useRef('');

  const key = `${scene}|${JSON.stringify(params)}`;
  const camKey = JSON.stringify(camera ?? null);
  // the latest props and frame, read by the lazy callbacks below (they outlive the render that created them)
  const now = useRef({ built, key, camera, camKey, view: `${resetKey}|${scene}` });
  now.current = { built, key, camera, camKey, view: `${resetKey}|${scene}` };

  // the frame and its poster, rebuilt when the station or its try-this state changes
  useEffect(() => {
    let dead = false;
    setFailed(false);
    buildFrame(scene, params)
      .then((b) => !dead && setBuilt({ key, ...b }))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [key]);

  // open the live view by itself, once, as a scene station does
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

  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) {
      reported.current = true;
      return;
    }
    onLiveChange?.(live);
  }, [live]);

  const draw = () => {
    const c = ctl.current;
    const { built: b, key: k, camera: cam, camKey: ck, view: v } = now.current;
    if (!c || !b || b.key !== k) return;
    const fresh = shownView.current !== v;
    const cameraChanged = shownCamera.current !== ck;
    shownView.current = v;
    shownCamera.current = ck;
    // a new station or scene starts from its own view; a new parameter value keeps the reader's view; a new camera
    // word from the try-this control moves there
    if (fresh) c.show(b.frame, (cam as CameraSpec | undefined) ?? true);
    else {
      c.show(b.frame, false);
      if (cameraChanged && cam) c.goTo(cam as CameraSpec);
    }
  };

  // the live canvas exists exactly as long as `live`
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
        shownView.current = '';
        draw();
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

  // follow the try-this control while live
  useEffect(draw, [built, key, resetKey, camKey]);

  const open3D = () => {
    if (!hasWebGL()) {
      setNote(NO_WEBGL);
      return;
    }
    setNote('');
    setLive(true);
  };
  const reset = () => {
    const c = ctl.current;
    if (c && built) c.goTo((camera as CameraSpec | undefined) ?? built.frame.camera ?? 'iso', false);
  };

  const frame = built?.frame;
  return (
    <figure className="scene lp-stage" data-stage-scene={scene} data-live={live ? 'true' : 'false'}>
      <div className="scene-head">
        <Badge variant={badge} />
      </div>
      {live ? (
        <div className="scene-stage" ref={view} data-testid="scene-3d">
          <div className="scene-host" ref={host} />
        </div>
      ) : (
        <div className="scene-stage lp-poster">
          {built ? (
            // generated by poster.ts from numbers and escaped labels
            <div className="lp-poster-svg" dangerouslySetInnerHTML={{ __html: built.poster }} />
          ) : (
            <p className="lp-wait" role="status">
              {failed
                ? 'The picture could not load. The text below still explains the idea.'
                : 'Drawing the picture...'}
            </p>
          )}
        </div>
      )}
      {loading && (
        <p className="scene-status" role="status">
          Loading the 3D view...
        </p>
      )}
      <div className="scene-controls" role="toolbar" aria-label="3D view controls">
        {live ? (
          <button type="button" className="btn" onClick={() => setLive(false)}>
            Back to flat view
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={open3D}>
            View in 3D
          </button>
        )}
        {live && (
          <>
            <button type="button" className="btn" onClick={() => ctl.current?.zoom(1 / 1.25)}>
              Zoom in
            </button>
            <button type="button" className="btn" onClick={() => ctl.current?.zoom(1.25)}>
              Zoom out
            </button>
            <button type="button" className="btn" onClick={reset}>
              Reset view
            </button>
          </>
        )}
      </div>
      {live && !loading && (
        <p className="scene-help">
          Drag to turn it any way, with no stop at the poles. Scroll or pinch to zoom. Shift-drag to move it,
          right-drag to roll it. With the picture focused: arrow keys turn, plus and minus zoom, W A S D move,
          Q and E roll, R resets.
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
      {frame?.readouts?.length ? (
        <dl className="lp-readouts">
          {frame.readouts.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <details className="scene-alt">
        <summary>Text description</summary>
        <p>{alt}</p>
        {frame && <p className="lp-describe">{frame.describe}</p>}
      </details>
    </figure>
  );
}
