import { describe, expect, it } from 'vitest';
import { hasWebGL, shouldStart3D } from './capabilities';

const docWith = (contexts: Record<string, unknown>) =>
  ({
    createElement: () => ({ getContext: (k: string) => contexts[k] ?? null }),
  }) as unknown as Document;

describe('hasWebGL', () => {
  it('is true with webgl2, or with only webgl', () => {
    expect(hasWebGL(docWith({ webgl2: {} }))).toBe(true);
    expect(hasWebGL(docWith({ webgl: {} }))).toBe(true);
  });
  it('is false with no context, a throwing canvas, or no document', () => {
    expect(hasWebGL(docWith({}))).toBe(false);
    const throwing = {
      createElement: () => {
        throw new Error('nope');
      },
    } as unknown as Document;
    expect(hasWebGL(throwing)).toBe(false);
    expect(hasWebGL(undefined)).toBe(false);
  });
});

describe('shouldStart3D truth table', () => {
  // [webgl, reducedMotion, visible, userRequested, expected]
  const rows: [boolean, boolean, boolean, boolean, boolean][] = [
    [false, false, true, true, false], // no WebGL: never, even when asked
    [false, false, true, false, false],
    [true, false, true, false, true], // auto start: on screen, motion allowed
    [true, false, false, false, false], // auto start: off screen
    [true, true, true, false, false], // auto start: reduced motion waits for a click
    [true, true, false, false, false],
    [true, true, true, true, true], // a click always starts, even with reduced motion
    [true, true, false, true, true],
    [true, false, false, true, true],
  ];
  it.each(rows)(
    'webgl=%s reduced=%s visible=%s requested=%s -> %s',
    (webgl, reducedMotion, visible, userRequested, want) => {
      expect(shouldStart3D({ webgl, reducedMotion, visible, userRequested })).toBe(want);
    },
  );
});
