import { describe, expect, it } from 'vitest';
import { SymmetryClient, type SymmetryWorkerLike } from './symmetry-client';
import type { SymmetryResult } from './symmetry';
import type { Structure } from './types';

const s: Structure = {
  lattice: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  species: ['Cu'],
  frac: [[0, 0, 0]],
};

function fake(reply: (id: number) => unknown): {
  w: SymmetryWorkerLike;
  posted: number[];
  terminated: () => boolean;
} {
  let term = false;
  const posted: number[] = [];
  const w: SymmetryWorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => void (term = true),
    postMessage: (m) => {
      posted.push(m.id);
      queueMicrotask(() => w.onmessage?.({ data: reply(m.id) } as never));
    },
  };
  return { w, posted, terminated: () => term };
}

describe('SymmetryClient', () => {
  it('resolves with the worker result and reuses one worker', async () => {
    let made = 0;
    const f = fake((id) => ({ id, ok: true, result: { number: 221 } as SymmetryResult }));
    const c = new SymmetryClient(() => (made++, f.w));
    expect((await c.analyze(s)).number).toBe(221);
    expect((await c.analyze(s)).number).toBe(221);
    expect(made).toBe(1);
    expect(f.posted).toEqual([1, 2]);
  });
  it('rejects with the worker error text', async () => {
    const f = fake((id) => ({ id, ok: false, error: 'overlapping atoms' }));
    await expect(new SymmetryClient(() => f.w).analyze(s)).rejects.toThrow('overlapping atoms');
  });
  it('rejects clearly when no worker can be made', async () => {
    await expect(new SymmetryClient(() => null).analyze(s)).rejects.toThrow(/could not start/);
    await expect(
      new SymmetryClient(() => {
        throw new Error('x');
      }).analyze(s),
    ).rejects.toThrow(/could not start/);
  });
  it('rejects pending requests when the worker crashes, and dispose cancels', async () => {
    const f = fake(() => ({ id: -1 }));
    const c = new SymmetryClient(() => f.w);
    const p = c.analyze(s);
    f.w.onerror?.({});
    await expect(p).rejects.toThrow(/could not start/);
    expect(f.terminated()).toBe(true);
    const f2 = fake(() => ({ id: -1 }));
    const c2 = new SymmetryClient(() => f2.w);
    const p2 = c2.analyze(s);
    c2.dispose();
    await expect(p2).rejects.toThrow(/cancelled/);
  });
});
