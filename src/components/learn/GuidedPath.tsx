// Guided path (M12.4): one station at a time. A station is one picture (a scene preset, a live scene of the 3D engine or a
// plot), three short sentences, one thing to try and a link to the full topic. One Scene island is reused for every scene
// station and one StageView for every stage station (M16.4), both on the shared engine, so at most one WebGL canvas exists
// on the page (D-058). Scene and stage stations open the free 3D view by themselves (D-112); plot stations load no
// three.js. A stage station may keep its old plot as a small panel beside the 3D view. If the reader goes back to the
// flat view, later stations stay flat until they press "View in 3D" again.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { markComplete, markVisited, progressServerSnapshot, progressStore } from '../../stores/progress';
import { resolveStation, topicHref, type Station } from '../../lib/learn/stations';
import type { SceneSpec } from '../../lib/scene/spec';
import Badge from '../ui/Badge';
import Slider from '../ui/Slider';
import Scene from '../scene/Scene';
// plots.ts writes class names only; without its stylesheet every shape is filled black (the SVG default)
import '../../lib/visual/plots.css';
import StageView from './StageView';
import './learn.css';

interface Props {
  stations: Station[];
  /** Scene presets with their structure inline, by id (resolved at build time). */
  scenes: Record<string, SceneSpec>;
}

export const stationKey = (id: string) => `learn/${id}`;
export const PATH_KEY = 'learn/path';

const fromHash = (stations: Station[]): number => {
  try {
    const i = stations.findIndex((s) => s.id === decodeURIComponent(location.hash.slice(1)));
    return i < 0 ? 0 : i;
  } catch {
    return 0;
  }
};

export default function GuidedPath({ stations, scenes }: Props) {
  const [index, setIndex] = useState(0);
  // false until the station in the address is known: the server render (and the first client render) is always station
  // 1, and a 3D station must not start the engine for a station the reader did not open (no three.js on plot stations)
  const [ready, setReady] = useState(false);
  const [tries, setTries] = useState<Record<string, number>>({});
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // undefined: the reader has not chosen yet, so scene stations open 3D by themselves
  const [want3D, setWant3D] = useState<boolean | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const st = stations[index]!;
  const last = index === stations.length - 1;
  const progress = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressServerSnapshot,
  );

  useEffect(() => {
    setIndex(fromHash(stations));
    setReady(true);
  }, [stations]);

  const shown = useMemo(() => resolveStation(st, tries[st.id]), [st, tries]);

  useEffect(() => {
    markVisited(stationKey(st.id));
    if (last) markComplete(PATH_KEY);
    try {
      history.replaceState(null, '', `#${st.id}`);
    } catch {
      /* a hash is only a convenience */
    }
    if (moved.current) heading.current?.focus();
  }, [st.id, last]);

  // the plot renderer is a separate chunk, fetched once after the page is open (a plot station, or a stage station's panel)
  const plot = shown.kind === 'plot' ? shown : shown.kind === 'stage' ? shown.panel : undefined;
  useEffect(() => {
    if (!plot) return;
    let dead = false;
    setFailed(false);
    import('../../lib/visual/plots')
      .then(({ renderPlot }) => {
        if (!dead) setSvg(renderPlot(plot.plot, plot.params, st.alt).svg);
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [shown, st.alt]);

  const go = useCallback(
    (to: number) => {
      const n = Math.min(stations.length - 1, Math.max(0, to));
      if (n === index) return;
      moved.current = true;
      setSvg(null);
      setIndex(n);
    },
    [index, stations.length],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (el.closest('input, select, textarea, .scene-stage, [role="radiogroup"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(stations.length - 1);
    else return;
    e.preventDefault();
  };

  const scene = useMemo((): SceneSpec | null => {
    if (shown.kind !== 'scene') return null;
    const base = scenes[shown.scene];
    if (!base) return null;
    return {
      ...base,
      ...(shown.repeat ? { repeat: shown.repeat } : {}),
      ...(shown.camera ? { camera: shown.camera } : {}),
    };
  }, [shown, scenes]);

  const set = (v: number) => setTries((t) => ({ ...t, [st.id]: v }));
  const tr = st.try;
  const sliderValue = tr.kind === 'slider' ? (tries[st.id] ?? tr.value) : 0;
  const choice = tr.kind === 'choice' ? (tries[st.id] ?? tr.initial) : 0;

  return (
    <section
      className="lp"
      aria-label="Guided path"
      onKeyDown={onKey}
      data-station={st.id}
      data-index={index + 1}
    >
      <nav className="lp-jump card" aria-label="Stations">
        <p className="card-h">
          Stations
          <span className="right lp-seen">
            {stations.filter((s) => progress.visited.includes(stationKey(s.id))).length} of {stations.length}{' '}
            seen
          </span>
        </p>
        <ol>
          {stations.map((s, i) => {
            const seen = progress.visited.includes(stationKey(s.id));
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className="lp-dot"
                  aria-current={i === index ? 'step' : undefined}
                  onClick={() => go(i)}
                >
                  <span className={`lp-tag${seen ? ' is-seen' : ''}`}>
                    {seen && <span aria-hidden="true">{'\u2713 '}</span>}
                    Station {i + 1}
                    <span className="lp-colon">:</span>
                  </span>{' '}
                  <span className="lp-name">{s.title}</span>
                  {seen && <span className="sr-only">, seen</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="lp-main card">
        <div className="lp-head">
          <div>
            <p className="lp-count" role="status" aria-live="polite">
              Station {index + 1} of {stations.length}
            </p>
            <h2 className="lp-title" tabIndex={-1} ref={heading}>
              {st.title}
            </h2>
          </div>
          <div className="lp-nav">
            <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous station
            </button>
            <button type="button" className="btn btn-primary" disabled={last} onClick={() => go(index + 1)}>
              Next station
            </button>
          </div>
        </div>
        <div className="bar lp-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(((index + 1) / stations.length) * 100)}%` }} />
        </div>

        <div className="lp-body">
          <div className="lp-visual" data-testid="lp-visual" data-kind={shown.kind}>
            {!ready && shown.kind !== 'plot' ? (
              <p className="lp-wait" role="status">
                Drawing the picture...
              </p>
            ) : scene ? (
              <Scene
                key="lp-scene"
                spec={scene}
                initialLive={want3D === true}
                auto3D={want3D === undefined}
                onLiveChange={setWant3D}
              />
            ) : shown.kind === 'stage' ? (
              <>
                <StageView
                  key="lp-stage"
                  scene={shown.scene}
                  params={shown.params}
                  camera={shown.camera}
                  badge={st.badge}
                  alt={st.alt}
                  resetKey={st.id}
                  initialLive={want3D === true}
                  auto3D={want3D === undefined}
                  onLiveChange={setWant3D}
                />
                {shown.panel && (
                  <figure className="lp-panel">
                    <figcaption className="lp-panel-cap">The same idea as a flat plot</figcaption>
                    {svg ? (
                      // markup produced by plots.ts from numbers and escaped labels
                      <div className="lp-panel-svg" dangerouslySetInnerHTML={{ __html: svg }} />
                    ) : (
                      <p className="lp-wait">{failed ? 'The plot could not load.' : 'Drawing the plot...'}</p>
                    )}
                  </figure>
                )}
              </>
            ) : (
              <figure className="lp-plot">
                <div className="lp-plot-head">
                  <Badge variant={st.badge} />
                </div>
                {svg ? (
                  // markup produced by plots.ts from numbers and escaped labels
                  <div className="lp-plot-svg" dangerouslySetInnerHTML={{ __html: svg }} />
                ) : (
                  <p className="lp-wait" role="status">
                    {failed
                      ? 'The picture could not load. The text below still explains the idea.'
                      : 'Drawing the picture...'}
                  </p>
                )}
                <details className="scene-alt">
                  <summary>Text description</summary>
                  <p>{st.alt}</p>
                </details>
              </figure>
            )}
          </div>

          <div className="lp-text">
            {st.sentences.map((x, i) => (
              <p key={i}>{x}</p>
            ))}

            {st.read && (
              <div className="lp-read">
                <p className="lp-read-head">How to read the picture</p>
                <ul>
                  {st.read.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {tr.kind === 'slider' ? (
              <div className="lp-try">
                <p className="lp-try-head">Try this</p>
                <Slider
                  label={tr.label}
                  min={tr.min}
                  max={tr.max}
                  step={tr.step}
                  value={sliderValue}
                  onChange={set}
                />
              </div>
            ) : (
              <fieldset className="lp-try">
                <legend className="lp-try-head">Try this: {tr.label}</legend>
                <div role="radiogroup" aria-label={tr.label} className="lp-choices">
                  {tr.options.map((o, i) => (
                    <label key={o.label} className={`lp-choice${i === choice ? ' is-on' : ''}`}>
                      <input
                        type="radio"
                        name={`try-${st.id}`}
                        checked={i === choice}
                        onChange={() => set(i)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <p className="lp-links">
              <a href={topicHref(st.topic)}>Go deeper: read the full topic</a>
              {st.tool && (
                <>
                  {' '}
                  <a href={st.tool.href}>{st.tool.label}</a>
                </>
              )}
            </p>
          </div>
        </div>

        {last && (
          <p className="lp-done" role="status">
            That is the whole route. Pick any station in the list to go back, or open the{' '}
            <a href="/handbook/">handbook</a> to learn each part properly.
          </p>
        )}
        <p className="lp-hint">
          Keys: Left and Right arrows (or Page Up and Page Down) move between stations when focus is on the
          text or the buttons. Home and End jump to the first and last.
        </p>
        <p className="lp-sources">Sources: {st.sources.join(', ')}</p>
      </div>
    </section>
  );
}
