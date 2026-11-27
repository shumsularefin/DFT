import { describe, expect, it } from 'vitest';
import { kpointsOf, shareOf, useBuilder } from './store';

const SLAB = 'Cu slab\n1.0\n2.55 0 0\n0 2.55 0\n0 0 20\nCu\n2\nDirect\n0 0 0.4\n0.5 0.5 0.5\n';

describe('share link (Q-073)', () => {
  it('keeps a typed k-mesh through shareOf and applyShare', () => {
    const b = useBuilder.getState();
    b.loadPoscar(SLAB);
    b.set('meshOverride', [8, 8, 1]);
    const frag = shareOf(useBuilder.getState());
    b.set('meshOverride', null);
    expect(useBuilder.getState().applyShare(frag)).toBe(true);
    const s = useBuilder.getState();
    expect(s.meshOverride).toEqual([8, 8, 1]);
    expect(kpointsOf(s).mesh).toEqual([8, 8, 1]);
  });

  it('a link without a typed mesh clears an old one', () => {
    const b = useBuilder.getState();
    b.loadPoscar(SLAB);
    const frag = shareOf(useBuilder.getState());
    b.set('meshOverride', [3, 3, 1]);
    useBuilder.getState().applyShare(frag);
    expect(useBuilder.getState().meshOverride).toBeNull();
  });
});
