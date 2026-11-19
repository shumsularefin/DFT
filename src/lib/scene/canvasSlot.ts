// D-058: one live WebGL canvas per page. A scene that goes live claims the slot; the scene that held it is told to give up
// its canvas and fall back to its SVG. Pure bookkeeping, no DOM.
type Release = () => void;
let holder: { id: symbol; release: Release } | undefined;

/** Claim the slot. Returns a function that gives it back (safe to call twice, and after someone else took over). */
export function claimCanvas(release: Release): () => void {
  const id = Symbol('scene');
  const prev = holder;
  holder = { id, release };
  prev?.release();
  return () => {
    if (holder?.id === id) holder = undefined;
  };
}

export const hasLiveCanvas = (): boolean => holder !== undefined;
