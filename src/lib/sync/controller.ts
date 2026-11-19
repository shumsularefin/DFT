/**
 * Glue between the learner store, the sync engine and the lazily loaded Firebase backend.
 * Nothing here imports Firebase statically: `import('./firebase')` runs only after the user presses
 * "Sign in to sync" (or on a later visit once they have chosen to sync).
 */
import { createStore } from 'zustand/vanilla';
import { getJSON, remove, setJSON } from '../storage';
import { learnerStore, setLearner } from '../../stores/learner';
import { readConfig, type FirebaseConfig } from './config';
import { SyncEngine, type SyncStatus } from './engine';

const FLAG = 'sync-enabled';

export const syncStore = createStore<{ status: SyncStatus }>(() => ({ status: { kind: 'off' } }));

let engine: SyncEngine | null = null;
let starting: Promise<SyncEngine | null> | null = null;
let applying = false;

export const syncConfig = (): FirebaseConfig | null => readConfig(import.meta.env as Record<string, unknown>);
export const syncChosen = (): boolean => getJSON<boolean>(FLAG, false) === true;

async function ensureEngine(): Promise<SyncEngine | null> {
  if (engine) return engine;
  const config = syncConfig();
  if (!config) return null;
  starting ??= (async () => {
    const { createFirebaseBackend } = await import('./firebase');
    const e = new SyncEngine(
      createFirebaseBackend(config),
      {
        get: () => learnerStore.getState().learner,
        set: (s) => {
          applying = true;
          try {
            setLearner(s);
          } finally {
            applying = false;
          }
        },
      },
      { isOffline: () => typeof navigator !== 'undefined' && navigator.onLine === false },
    );
    e.subscribe((status) => {
      syncStore.setState({ status });
      if (status.kind === 'off') remove(FLAG);
    });
    learnerStore.subscribe((s, prev) => {
      if (!applying && s.learner !== prev.learner) e.markDirty();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void e.flush();
    });
    window.addEventListener('online', () => void e.flush());
    engine = e;
    return e;
  })().catch((err) => {
    starting = null;
    syncStore.setState({
      status: { kind: 'error', message: err instanceof Error ? err.message : 'Could not load sync' },
    });
    return null;
  });
  return starting;
}

/** The user pressed "Sign in to sync". */
export async function signInToSync(): Promise<void> {
  syncStore.setState({ status: { kind: 'signing-in' } });
  const e = await ensureEngine();
  if (!e) return;
  await e.signIn();
  if (e.getStatus().kind === 'synced') setJSON(FLAG, true);
}

/** Continue a session the user chose on an earlier visit. Does nothing if they never chose sync. */
export async function resumeSync(): Promise<void> {
  if (!syncConfig() || !syncChosen() || engine || starting) return;
  const e = await ensureEngine();
  if (e) await e.resume();
}

export async function signOutOfSync(): Promise<void> {
  const e = await ensureEngine();
  if (e) await e.signOut();
  remove(FLAG);
}

/** Remove the cloud copy and sign out. The copy on this device stays. */
export async function deleteSyncedData(): Promise<void> {
  const e = await ensureEngine();
  if (e) await e.deleteRemote();
}
