import { describe, expect, it, vi } from 'vitest';
import type { ControlsLike, Environment, RendererLike } from './SceneController';
import { SpecScene } from './SpecScene';

// SpecScene draws atoms with a lit material, so without a light every atom is a black disc (the learn path bug, D-106).
describe('SpecScene', () => {
  it('adds an ambient light and a camera light', () => {
    const env = {
      document: { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      devicePixelRatio: 1,
      now: () => 0,
    } as unknown as Environment;
    const renderer = {
      domElement: { setAttribute: vi.fn(), remove: vi.fn() } as unknown as HTMLCanvasElement,
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    } satisfies RendererLike;
    const controls: ControlsLike = {
      enableDamping: true,
      update: vi.fn(),
      dispose: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const container = {} as HTMLElement;
    const s = new SpecScene(container, {
      env,
      createRenderer: () => renderer,
      createControls: () => controls,
    });
    const types: string[] = [];
    s.scene.traverse((o) => types.push(o.type));
    expect(types).toContain('AmbientLight');
    expect(types).toContain('DirectionalLight');
  });
});
