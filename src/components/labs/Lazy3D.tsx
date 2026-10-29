import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { hasWebGL, prefersReducedMotion, shouldStart3D } from '../../lib/three/capabilities';
import type { SceneController } from '../../lib/three/SceneController';

export interface SceneModule {
  createScene(container: HTMLElement): SceneController;
}

interface Props {
  /** Dynamic import of the module that builds the scene; keeps three out of the page's initial JavaScript. */
  load: () => Promise<SceneModule>;
  /** Shown instead of the 3D view when WebGL is missing or the import fails. */
  fallback: ReactNode;
  /** Text on the poster card. */
  posterText: string;
  /** Start by itself when scrolled into view, if motion is allowed. */
  autoStart?: boolean;
  /** Called with the live controller, and with null when the view closes. */
  onController?: (c: SceneController | null) => void;
}

type Phase = 'poster' | 'loading' | 'running' | 'fallback';

export default function Lazy3D({ load, fallback, posterText, autoStart = false, onController }: Props) {
  const [phase, setPhase] = useState<Phase>('poster');
  const [note, setNote] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [mod, setMod] = useState<SceneModule | null>(null);
  const token = useRef(0);

  const close = useCallback(() => {
    token.current++;
    setMod(null);
    setPhase('poster');
  }, []);

  const start = useCallback(
    async (userRequested: boolean, visible = true) => {
      const webgl = hasWebGL();
      if (!webgl) {
        setNote('This browser cannot draw 3D, so here is a flat view you can rotate with the sliders.');
        setPhase('fallback');
        return;
      }
      if (!shouldStart3D({ webgl, reducedMotion: prefersReducedMotion(), visible, userRequested })) return;
      const mine = ++token.current;
      setPhase('loading');
      try {
        const mod = await load();
        if (mine !== token.current) return; // closed or restarted while loading
        setMod(mod);
        setPhase('running');
      } catch {
        if (mine !== token.current) return;
        setNote('The 3D view could not load, so here is a flat view instead.');
        setPhase('fallback');
      }
    },
    [load],
  );

  useEffect(() => {
    if (!autoStart || typeof IntersectionObserver === 'undefined' || !outer.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void start(false, true);
      }
    });
    io.observe(outer.current);
    return () => io.disconnect();
  }, [autoStart, start]);

  // The scene lives exactly as long as the running phase: the cleanup disposes it on close and on unmount.
  useEffect(() => {
    if (phase !== 'running' || !mod || !host.current) return;
    let ctl: SceneController | undefined;
    try {
      ctl = mod.createScene(host.current);
      ctl.start();
      onController?.(ctl);
    } catch {
      ctl?.dispose();
      setNote('The 3D view could not start, so here is a flat view instead.');
      setMod(null);
      setPhase('fallback');
      return;
    }
    return () => {
      ctl?.dispose();
      onController?.(null);
    };
  }, [phase, mod, onController]);

  useEffect(() => () => void token.current++, []);

  return (
    <div className="lazy3d" ref={outer}>
      {phase === 'poster' && (
        <div className="lazy3d-poster">
          <p>{posterText}</p>
          <button type="button" className="btn btn-primary" onClick={() => void start(true)}>
            Start 3D view
          </button>
        </div>
      )}
      {phase === 'loading' && (
        <p className="lazy3d-status" role="status">
          Loading the 3D view...
        </p>
      )}
      {phase === 'running' && (
        <>
          <div className="lazy3d-host" ref={host} />
          <button type="button" className="btn" onClick={close}>
            Close 3D view
          </button>
        </>
      )}
      {phase === 'fallback' && (
        <>
          <p className="lazy3d-status" role="status">
            {note}
          </p>
          {fallback}
        </>
      )}
    </div>
  );
}
