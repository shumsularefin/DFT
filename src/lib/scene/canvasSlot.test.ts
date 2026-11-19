import { describe, expect, it, vi } from 'vitest';
import { claimCanvas, hasLiveCanvas } from './canvasSlot';

describe('canvas slot', () => {
  it('releases the previous holder when a new scene claims it', () => {
    const a = vi.fn();
    const b = vi.fn();
    const giveA = claimCanvas(a);
    expect(a).not.toHaveBeenCalled();
    const giveB = claimCanvas(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    giveA(); // late call by the old holder must not free the new one
    expect(hasLiveCanvas()).toBe(true);
    giveB();
    expect(hasLiveCanvas()).toBe(false);
  });
});
