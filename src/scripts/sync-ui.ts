// Sync controls (M6.5). The Firebase SDK is imported only when the person presses "Sign in to sync", or
// on later visits after they chose to sync on this device (flag `sync` in storage).
import { firebaseConfig } from '../lib/sync/config';
import type { SyncEngine, SyncStatus } from '../lib/sync/engine';
import { getJSON, remove, setJSON } from '../lib/storage';
import { learnerStore, replaceLearner } from '../stores/learner';

const panel = document.querySelector<HTMLElement>('[data-sync]');
const EMULATORS = import.meta.env.PUBLIC_FIREBASE_EMULATORS === 'true';

const describe = (s: SyncStatus): string => {
  switch (s.kind) {
    case 'off':
      return 'Sync is off. Your progress is stored only in this browser.';
    case 'signing-in':
      return 'Signing in...';
    case 'pending':
      return 'Changes will be synced within a minute.';
    case 'synced':
      return `Synced at ${new Date(s.at).toLocaleTimeString()}.`;
    case 'offline':
      return 'You are offline. Changes are kept here and synced when you are back online.';
    case 'error':
      return `Sync failed (${s.message}).${s.retryInMs ? ` Trying again in ${Math.round(s.retryInMs / 60000)} min.` : ''}`;
  }
};

if (panel && firebaseConfig) {
  const config = firebaseConfig;
  const status = panel.querySelector<HTMLElement>('[data-sync-status]')!;
  const signInBtn = panel.querySelector<HTMLButtonElement>('[data-sync-signin]')!;
  const signedIn = panel.querySelector<HTMLElement>('[data-sync-signedin]')!;
  const who = panel.querySelector<HTMLElement>('[data-sync-user]')!;
  let engine: SyncEngine | null = null;
  let fb: typeof import('../lib/sync/firebase') | null = null;
  const show = (s: SyncStatus) => (status.textContent = describe(s));

  const load = async () => {
    fb ??= await import('../lib/sync/firebase');
    fb.init(config, EMULATORS);
    return fb;
  };

  const startEngine = async (uid: string, label: string) => {
    const { SyncEngine } = await import('../lib/sync/engine');
    const f = await load();
    engine = new SyncEngine({
      backend: f.backendFor(uid),
      getLocal: () => learnerStore.getState().state,
      setLocal: (s) => replaceLearner(s),
      onStatus: show,
      isOnline: () => navigator.onLine,
    });
    signInBtn.hidden = true;
    signedIn.hidden = false;
    who.textContent = label;
    await engine.start();
    let last = learnerStore.getState().state;
    learnerStore.subscribe(({ state }) => {
      if (state !== last) {
        last = state;
        engine?.changed();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void engine?.flush();
    });
    addEventListener('online', () => void engine?.flush());
  };

  signInBtn.addEventListener('click', async () => {
    show({ kind: 'signing-in' });
    try {
      const f = await load();
      const user = await f.signIn();
      setJSON('sync', true);
      await startEngine(user.uid, user.email ?? 'your account');
    } catch (e) {
      show({ kind: 'error', message: e instanceof Error ? e.message : String(e), retryInMs: 0 });
    }
  });

  panel.querySelector('[data-sync-signout]')?.addEventListener('click', async () => {
    await engine?.flush();
    engine?.stop();
    await fb?.signOut();
    remove('sync');
    signInBtn.hidden = false;
    signedIn.hidden = true;
  });

  panel.querySelector('[data-sync-delete]')?.addEventListener('click', async () => {
    if (
      !confirm(
        'Delete the synced copy of your progress from the cloud and sign out? The copy in this browser stays.',
      )
    )
      return;
    try {
      await engine?.deleteRemote();
      await fb?.signOut();
      remove('sync');
      signInBtn.hidden = false;
      signedIn.hidden = true;
      status.textContent = 'Your synced data was deleted and you are signed out.';
    } catch (e) {
      show({ kind: 'error', message: e instanceof Error ? e.message : String(e), retryInMs: 0 });
    }
  });

  panel.hidden = false;
  show({ kind: 'off' });
  // Resume only if the person chose to sync on this device before.
  if (getJSON('sync', false)) {
    void (async () => {
      const f = await load();
      const user = await f.currentUser();
      if (user) await startEngine(user.uid, user.email ?? 'your account');
      else remove('sync');
    })();
  }
}
