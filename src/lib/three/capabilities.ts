// WebGL detection and the rule for when a 3D view may start. Pure and Node-testable.

/** True when a webgl2 or webgl context can be created. Never throws. */
export function hasWebGL(doc: Pick<Document, 'createElement'> | undefined = globalThis.document): boolean {
  try {
    if (!doc) return false;
    const canvas = doc.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface Start3DInput {
  webgl: boolean;
  reducedMotion: boolean;
  /** The view is on screen. */
  visible: boolean;
  /** The reader pressed "Start 3D view". */
  userRequested: boolean;
}

/**
 * A reader's explicit request always starts the view if WebGL exists. Without one (auto start) the view starts
 * only when it is on screen and the reader has not asked for reduced motion.
 */
export function shouldStart3D({ webgl, reducedMotion, visible, userRequested }: Start3DInput): boolean {
  if (!webgl) return false;
  if (userRequested) return true;
  return visible && !reducedMotion;
}

export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
