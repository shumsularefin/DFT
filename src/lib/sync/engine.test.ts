import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  SyncEngine,
  WRITE_INTERVAL_MS,
  backoffMs,
  type Backend,
  type LocalState,
} from './engine';
import {
  addEvent,
  deserialize,
  emptyState,
  newConcept,
  serialize,
  type LearnerState,
} from '../learning/state';

function withEvent(id: string, t: number, correct = true): LearnerState {
  const s = emptyState();
  s.concepts[id] = addEvent(newConcept(), { t, q: `q-${id}-${t}`, correct });
  return s;
}

class FakeBackend implements Backend {
  doc: string | null = null;
  signedIn = false;
  saves: string[] = [];
  loads = 0;
  failNext = 0;
  failLoad = false;
  async signIn() {
    this.signedIn = true;
    return 'u1';
  }
  async resume() {
    return this.signedIn ? 'u1' : null;
  }
  async signOut() {
    this.signedIn = false;
  }
  async load() {
    this.loads += 1;
    if (this.failLoad) throw new Error('load failed');
    return this.doc;
  }
  async save(_u: string, text: string) {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('write failed');
    }
    this.saves.push(text);
    this.doc = text;
  }
  async remove() {
    this.doc = null;
  }
}

function setup(local: LearnerState, opts: { isOffline?: () => boolean } = {}) {
  const backend = new FakeBackend();
  let cur = local;
  const store: LocalState = { get: () => cur, set: (s) => (cur = s) };
  const engine = new SyncEngine(backend, store, opts);
  return { backend, engine, store, get: () => cur, set: (s: LearnerState) => (cur = s) };
}

describe('sync engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('sign-in with no cloud copy uploads the device copy once', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    expect(x.backend.saves).toHaveLength(1);
    expect(x.engine.getStatus().kind).toBe('synced');
  });

  it('sign-in merges the cloud copy into the device and writes the union back', async () => {
    const x = setup(withEvent('a', 1));
    x.backend.doc = serialize(withEvent('b', 2));
    await x.engine.signIn();
    const merged = x.get();
    expect(Object.keys(merged.concepts).sort()).toEqual(['a', 'b']);
    expect(deserialize(x.backend.doc!).concepts.a).toBeDefined();
  });

  it('does not write when the cloud copy already equals the merge', async () => {
    const s = withEvent('a', 1);
    const x = setup(s);
    x.backend.doc = serialize(s);
    await x.engine.signIn();
    expect(x.backend.saves).toHaveLength(0);
    expect(x.engine.getStatus().kind).toBe('synced');
  });

  it('never uploads an empty state', async () => {
    const x = setup(emptyState());
    await x.engine.signIn();
    expect(x.backend.saves).toHaveLength(0);
    x.engine.markDirty();
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS * 3);
    expect(x.backend.saves).toHaveLength(0);
  });

  it('keeps a cloud copy it cannot read and reports an error', async () => {
    const x = setup(withEvent('a', 1));
    x.backend.doc = '{"version":99}';
    await x.engine.signIn();
    expect(x.backend.saves).toHaveLength(0);
    expect(x.backend.doc).toBe('{"version":99}');
    expect(x.engine.getStatus()).toMatchObject({ kind: 'error' });
  });

  it('coalesces many changes into at most one write per interval', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    x.backend.saves.length = 0;
    for (let i = 0; i < 20; i++) {
      x.set(withEvent('a', 10 + i));
      x.engine.markDirty();
      await vi.advanceTimersByTimeAsync(1000);
    }
    // 20 s so far since the sign-in write: nothing yet
    expect(x.backend.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(x.backend.saves).toHaveLength(1);
    // a long active session: one write per interval, never more
    for (let i = 0; i < 10; i++) {
      x.set(withEvent('a', 100 + i));
      x.engine.markDirty();
      await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    }
    expect(x.backend.saves.length).toBeLessThanOrEqual(11);
  });

  it('flush writes at once when the page is hidden', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    x.backend.saves.length = 0;
    x.set(withEvent('a', 5));
    x.engine.markDirty();
    await x.engine.flush();
    expect(x.backend.saves).toHaveLength(1);
  });

  it('retries with exponential backoff after a write error, then recovers', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    x.set(withEvent('a', 5));
    x.backend.failNext = 2;
    x.engine.markDirty();
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(x.engine.getStatus()).toMatchObject({ kind: 'error' });
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS - 1);
    expect(x.engine.getStatus().kind).toBe('error');
    await vi.advanceTimersByTimeAsync(1); // first retry fails, second delay is twice as long
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 2);
    expect(x.engine.getStatus().kind).toBe('synced');
    expect(deserialize(x.backend.doc!).concepts.a!.events[0]!.t).toBe(5);
  });

  it('backoff doubles and is capped', () => {
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffMs(40)).toBe(BACKOFF_MAX_MS);
  });

  it('reports offline instead of an error when the browser is offline', async () => {
    let off = false;
    const x = setup(withEvent('a', 1), { isOffline: () => off });
    await x.engine.signIn();
    off = true;
    x.set(withEvent('a', 5));
    x.engine.markDirty();
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(x.engine.getStatus().kind).toBe('offline');
    off = false;
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(x.engine.getStatus().kind).toBe('synced');
  });

  it('never writes before the cloud copy has been merged (failed first load)', async () => {
    const x = setup(withEvent('a', 1));
    x.backend.doc = serialize(withEvent('b', 2));
    x.backend.failLoad = true;
    await x.engine.signIn();
    expect(x.engine.getStatus().kind).toBe('error');
    x.engine.markDirty();
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS * 2);
    expect(x.backend.saves).toHaveLength(0);
    x.backend.failLoad = false;
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(Object.keys(x.get().concepts).sort()).toEqual(['a', 'b']);
    expect(x.engine.getStatus().kind).toBe('synced');
  });

  it('delete removes the cloud copy, signs out and keeps the device copy', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    await x.engine.deleteRemote();
    expect(x.backend.doc).toBeNull();
    expect(x.backend.signedIn).toBe(false);
    expect(x.engine.getStatus().kind).toBe('off');
    expect(Object.keys(x.get().concepts)).toEqual(['a']);
  });

  it('sign-out flushes pending changes first', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.signIn();
    x.set(withEvent('a', 9));
    x.engine.markDirty();
    await x.engine.signOut();
    expect(deserialize(x.backend.doc!).concepts.a!.events[0]!.t).toBe(9);
    expect(x.engine.getStatus().kind).toBe('off');
  });

  it('resume with no session stays off and does not load', async () => {
    const x = setup(withEvent('a', 1));
    await x.engine.resume();
    expect(x.engine.getStatus().kind).toBe('off');
    expect(x.backend.loads).toBe(0);
  });

  it('a worst-case state stays under the rules size bound', () => {
    const s = emptyState();
    for (let c = 0; c < 80; c++) {
      let cs = newConcept();
      for (let i = 0; i < 200; i++)
        cs = addEvent(cs, { t: 1_790_000_000_000 + i * 1000, q: `q-ab-${c}-${i % 9}`, correct: i % 3 === 0 });
      s.concepts[`concept-number-${c}`] = cs;
    }
    expect(serialize(s).length).toBeLessThan(900_000);
  });
});
