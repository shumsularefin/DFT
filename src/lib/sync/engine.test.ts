import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAnswer, emptyState, parseState, serialize, type LearnerState } from '../learning/state';
import { SyncEngine, WRITE_INTERVAL_MS, type SyncBackend, type SyncStatus } from './engine';
import { readConfig } from './config';

const T0 = Date.UTC(2026, 10, 2, 12);
const answer = (s: LearnerState, q: string, t: number) =>
  applyAnswer(s, { questionId: q, concepts: ['encut'], difficulty: 0, correct: true, hints: 0, now: t });

function setup(remote: string | null = null, failSaves = 0) {
  let local = emptyState();
  const saves: string[] = [];
  const statuses: SyncStatus[] = [];
  let toFail = failSaves;
  const backend: SyncBackend = {
    load: vi.fn(async () => remote),
    save: vi.fn(async (p: string) => {
      if (toFail-- > 0) throw new Error('unavailable');
      saves.push(p);
    }),
    remove: vi.fn(async () => {}),
  };
  const engine = new SyncEngine({
    backend,
    getLocal: () => local,
    setLocal: (s) => (local = s),
    onStatus: (s) => statuses.push(s),
    now: () => Date.now(),
  });
  return {
    engine,
    saves,
    statuses,
    backend,
    get local() {
      return local;
    },
    set local(s) {
      local = s;
    },
  };
}

describe('sync engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('merges the remote copy with this device on sign-in and writes the merge back', async () => {
    const remote = answer(emptyState(), 'q-remote', T0 - 1000);
    const env = setup(serialize(remote));
    env.local = answer(emptyState(), 'q-local', T0 - 500);
    await env.engine.start();
    expect(Object.keys(env.local.questions).sort()).toEqual(['q-local', 'q-remote']);
    expect(env.saves).toHaveLength(1);
    expect(parseState(JSON.parse(env.saves[0]!))).toEqual(env.local);
    expect(env.statuses.at(-1)).toEqual({ kind: 'synced', at: T0 });
  });

  it('does not write on sign-in when the remote copy already holds everything', async () => {
    const both = answer(emptyState(), 'q-1', T0 - 1000);
    const env = setup(serialize(both));
    env.local = both;
    await env.engine.start();
    expect(env.saves).toHaveLength(0);
    expect(env.statuses.at(-1)).toEqual({ kind: 'synced', at: T0 });
  });

  it('writes at most once per 60 s however many changes happen', async () => {
    const env = setup();
    await env.engine.start();
    for (let i = 0; i < 30; i++) {
      env.local = answer(env.local, `q-${i}`, T0 + i);
      env.engine.changed();
      await vi.advanceTimersByTimeAsync(1000);
    }
    // start wrote once; the 30 changes over 30 s wait until 60 s after that write
    expect(env.saves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(env.saves).toHaveLength(2);
    expect(Object.keys(parseState(JSON.parse(env.saves[1]!))!.questions)).toHaveLength(30);
  });

  it('flush writes immediately (visibilitychange to hidden) and skips unchanged payloads', async () => {
    const env = setup();
    await env.engine.start();
    env.local = answer(env.local, 'q-1', T0);
    env.engine.changed();
    await env.engine.flush();
    expect(env.saves).toHaveLength(2);
    env.engine.changed();
    await env.engine.flush();
    expect(env.saves).toHaveLength(2);
  });

  it('backs off exponentially after errors and recovers', async () => {
    const env = setup(null, 2);
    await env.engine.start();
    expect(env.statuses.at(-1)).toMatchObject({ kind: 'error', retryInMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(env.statuses.at(-1)).toMatchObject({ kind: 'error', retryInMs: 120_000 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(env.statuses.at(-1)).toMatchObject({ kind: 'synced' });
    expect(env.saves).toHaveLength(1);
  });

  it('reports offline instead of writing', async () => {
    const env = setup();
    const engine = new SyncEngine({
      backend: env.backend,
      getLocal: () => env.local,
      setLocal: () => {},
      onStatus: (s) => env.statuses.push(s),
      isOnline: () => false,
    });
    await engine.start();
    expect(env.statuses.at(-1)).toEqual({ kind: 'offline' });
    expect(env.saves).toHaveLength(0);
  });

  it('delete removes the remote copy and stops', async () => {
    const env = setup();
    await env.engine.start();
    await env.engine.deleteRemote();
    expect(env.backend.remove).toHaveBeenCalledOnce();
    env.engine.changed();
    await vi.advanceTimersByTimeAsync(5 * WRITE_INTERVAL_MS);
    expect(env.saves).toHaveLength(1);
  });
});

describe('config', () => {
  it('is null unless all four PUBLIC_FIREBASE_* values are set', () => {
    expect(readConfig({})).toBeNull();
    expect(
      readConfig({
        PUBLIC_FIREBASE_API_KEY: 'k',
        PUBLIC_FIREBASE_AUTH_DOMAIN: 'd',
        PUBLIC_FIREBASE_PROJECT_ID: 'p',
      }),
    ).toBeNull();
    expect(
      readConfig({
        PUBLIC_FIREBASE_API_KEY: 'k',
        PUBLIC_FIREBASE_AUTH_DOMAIN: 'd',
        PUBLIC_FIREBASE_PROJECT_ID: 'p',
        PUBLIC_FIREBASE_APP_ID: 'a',
      }),
    ).toEqual({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' });
  });
});
