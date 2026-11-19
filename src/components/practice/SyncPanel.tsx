import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  deleteSyncedData,
  resumeSync,
  signInToSync,
  signOutOfSync,
  syncChosen,
  syncStore,
} from '../../lib/sync/controller';
import type { SyncStatus } from '../../lib/sync/engine';
import './practice.css';

const OFF: SyncStatus = { kind: 'off' };
const useStatus = (): SyncStatus =>
  useSyncExternalStore(
    syncStore.subscribe,
    () => syncStore.getState().status,
    () => OFF,
  );

export function statusText(s: SyncStatus): string {
  switch (s.kind) {
    case 'off':
      return 'Sync is off. Your progress is only on this device.';
    case 'signing-in':
      return 'Signing in...';
    case 'syncing':
      return 'Syncing...';
    case 'synced':
      return `Synced at ${new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    case 'offline':
      return 'You are offline. Changes are kept on this device and will be sent when you are back online.';
    case 'error':
      return `Sync problem: ${s.message} Your progress on this device is safe.`;
  }
}

interface Props {
  /** One status line only, for pages where sync is not the topic. Renders nothing until the user has chosen sync. */
  compact?: boolean;
}

/** Optional sync. Rendered only when the site was built with PUBLIC_FIREBASE_* (the page decides). */
export default function SyncPanel({ compact = false }: Props) {
  const status = useStatus();
  const [chosen, setChosen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setChosen(syncChosen());
    void resumeSync();
  }, []);

  const active = status.kind !== 'off' || chosen;
  if (compact) {
    return active ? (
      <p role="status" data-testid="sync-status">
        {statusText(status)}
      </p>
    ) : null;
  }

  return (
    <section aria-labelledby="sync-h" data-testid="sync-panel">
      <h2 id="sync-h">Sync across devices (optional)</h2>
      <p>
        Off by default. If you sign in with Google, your practice answers and the site's estimates of what you
        know are copied to a private document that only you can read, and merged with what is on your other
        devices. Topic progress, the practice run and your settings stay on each device. Nothing is sent until
        you press the button, and the sync code is not even downloaded before that.
      </p>
      <p role="status" data-testid="sync-status">
        {statusText(status)}
      </p>
      <div className="qc-actions">
        {status.kind === 'off' || status.kind === 'error' ? (
          <button type="button" className="btn btn-primary" onClick={() => void signInToSync()}>
            Sign in to sync
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={status.kind === 'signing-in'}
            onClick={() => void signOutOfSync()}
          >
            Sign out
          </button>
        )}
        {status.kind !== 'off' && status.kind !== 'signing-in' && !confirm && (
          <button type="button" className="btn" onClick={() => setConfirm(true)}>
            Delete my synced data
          </button>
        )}
      </div>
      {confirm && (
        <div role="alertdialog" aria-label="Confirm delete synced data" className="pr-warn">
          <p>
            This deletes the copy stored in the cloud and signs you out. The progress on this device is not
            changed. It cannot be undone.
          </p>
          <div className="qc-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirm(false);
                void deleteSyncedData();
              }}
            >
              Yes, delete the cloud copy
            </button>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
