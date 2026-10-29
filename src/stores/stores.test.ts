import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage(initial: Record<string, string> = {}, throws = false): Storage {
  const m = new Map(Object.entries(initial));
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
const env = (data: unknown) => JSON.stringify({ v: 1, data });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('level store', () => {
  it('defaults to beginner and ignores a bad stored value', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'dft:level': env('wizard') }));
    const { levelStore } = await import('./level');
    expect(levelStore.getState().level).toBe('beginner');
  });

  it('reads a stored level, persists changes and notifies subscribers', async () => {
    const ls = fakeStorage({ 'dft:level': env('pro') });
    vi.stubGlobal('localStorage', ls);
    const { levelStore, setLevel } = await import('./level');
    expect(levelStore.getState().level).toBe('pro');
    const seen: string[] = [];
    levelStore.subscribe((s) => seen.push(s.level));
    setLevel('intermediate');
    expect(seen).toEqual(['intermediate']);
    expect(ls.getItem('dft:level')).toBe(env('intermediate'));
  });

  it('keeps working in memory when storage throws', async () => {
    vi.stubGlobal('localStorage', fakeStorage({}, true));
    const { levelStore, setLevel } = await import('./level');
    expect(levelStore.getState().level).toBe('beginner');
    expect(() => setLevel('pro')).not.toThrow();
    expect(levelStore.getState().level).toBe('pro');
  });
});

describe('theme store', () => {
  it('has no explicit choice until one is made, then persists it', async () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const { themeStore, setTheme } = await import('./theme');
    expect(themeStore.getState().explicit).toBeNull();
    setTheme('dark');
    expect(themeStore.getState().explicit).toBe('dark');
    expect(ls.getItem('dft:theme')).toBe(env('dark'));
  });

  it('ignores an invalid stored theme', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'dft:theme': env('purple') }));
    const { themeStore } = await import('./theme');
    expect(themeStore.getState().explicit).toBeNull();
  });
});

describe('progress store', () => {
  it('records visits and completion, persists, and resets', async () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const s = await import('./progress');
    s.markVisited('a/x');
    s.markComplete('a/x');
    expect(s.progressStore.getState().completed).toEqual(['a/x']);
    expect(JSON.parse(ls.getItem('dft:progress')!).data.visited).toEqual(['a/x']);
    s.markIncomplete('a/x');
    expect(s.progressStore.getState().completed).toEqual([]);
    s.resetProgress();
    expect(s.progressStore.getState().visited).toEqual([]);
    expect(ls.getItem('dft:progress')).toBeNull();
  });

  it('starts empty on junk and does not throw when storage is blocked', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'dft:progress': env('nonsense') }, true));
    const s = await import('./progress');
    expect(s.progressStore.getState().completed).toEqual([]);
    expect(() => s.markComplete('a/x')).not.toThrow();
    expect(s.progressStore.getState().completed).toEqual(['a/x']);
  });
});
