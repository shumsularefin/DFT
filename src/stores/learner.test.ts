import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage(throws = false): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (throws) throw new Error('blocked');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error('blocked');
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}
const q = { id: 'q1', concepts: ['a'], difficulty: 0, hints: [] as string[] };

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('learner store', () => {
  it('records an answer, persists it and reloads it', async () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const a = await import('./learner');
    a.answerQuestion(q, { correct: true, hintsUsed: 0 });
    expect(a.learnerStore.getState().learner.concepts['a']?.attempts).toBe(1);
    expect(a.learnerStore.getState().activity.answers).toBe(1);
    vi.resetModules();
    const b = await import('./learner');
    expect(b.learnerStore.getState().learner.concepts['a']?.attempts).toBe(1);
    expect(b.learnerStore.getState().persisted).toBe(true);
  });

  it('keeps working in memory and says so when storage is blocked', async () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    const a = await import('./learner');
    expect(() => a.answerQuestion(q, { correct: false, hintsUsed: 1 })).not.toThrow();
    expect(a.learnerStore.getState().persisted).toBe(false);
    expect(a.learnerStore.getState().learner.concepts['a']?.attempts).toBe(1);
  });

  it('exports and imports without loss', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const a = await import('./learner');
    a.answerQuestion(q, { correct: true, hintsUsed: 0, arm: 'new-target' });
    const text = a.exportData();
    const before = a.learnerStore.getState();
    a.resetAll();
    expect(a.learnerStore.getState().learner.concepts).toEqual({});
    expect(a.importData(text)).toEqual({ ok: true });
    const after = a.learnerStore.getState();
    expect(after.learner).toEqual(before.learner);
    expect(after.meta).toEqual(before.meta);
    expect(after.activity).toEqual(before.activity);
  });

  it('rejects bad files and leaves the data alone', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const a = await import('./learner');
    a.answerQuestion(q, { correct: true, hintsUsed: 0 });
    const keep = a.learnerStore.getState().learner;
    for (const bad of [
      'not json',
      '{}',
      JSON.stringify({ format: 'dft-learner-export', version: 1, learner: {} }),
    ]) {
      const r = a.importData(bad);
      expect(r.ok).toBe(false);
    }
    expect(a.importData('x'.repeat(5_000_001)).ok).toBe(false);
    expect(a.learnerStore.getState().learner).toEqual(keep);
  });

  it('survives corrupted stored data', async () => {
    const ls = fakeStorage();
    ls.setItem('dft:learner', JSON.stringify({ v: 1, data: { version: 99 } }));
    ls.setItem(
      'dft:practice-meta',
      JSON.stringify({ v: 1, data: { bandit: { 'new-easy': { alpha: -1, beta: 1 } } } }),
    );
    vi.stubGlobal('localStorage', ls);
    const a = await import('./learner');
    expect(a.learnerStore.getState().learner.concepts).toEqual({});
    expect(a.learnerStore.getState().meta.bandit['new-easy']).toEqual({ alpha: 1, beta: 1 });
  });

  it('reset erases the streak, the practice data and topic progress', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const a = await import('./learner');
    const p = await import('./progress');
    p.markComplete('t1');
    a.answerQuestion(q, { correct: true, hintsUsed: 0 });
    a.resetAll();
    expect(a.learnerStore.getState().activity.days).toEqual([]);
    expect(p.progressStore.getState().completed).toEqual([]);
  });

  it('streak setting is stored', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const a = await import('./learner');
    a.setHideStreaks(true);
    expect(a.learnerStore.getState().activity.hideStreaks).toBe(true);
  });
});
