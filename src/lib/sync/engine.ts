// Sync engine (M6.5): merge on sign-in, debounced writes, backoff on errors. The backend is injected so
// the logic is tested with fake timers and no network; firebase.ts provides the real one.
import { merge, parseState, serialize, type LearnerState } from '../learning/state';

export const WRITE_INTERVAL_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;
export const PAYLOAD_LIMIT = 900_000;

export interface SyncBackend {
  /** The stored payload (serialized learner state) or null when there is none. */
  load(): Promise<string | null>;
  save(payload: string): Promise<void>;
  remove(): Promise<void>;
}

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'signing-in' }
  | { kind: 'synced'; at: number }
  | { kind: 'pending' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; retryInMs: number };

export interface EngineDeps {
  backend: SyncBackend;
  getLocal: () => LearnerState;
  setLocal: (s: LearnerState) => void;
  onStatus: (s: SyncStatus) => void;
  now?: () => number;
  isOnline?: () => boolean;
}

export class SyncEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastWrite = -Infinity;
  private failures = 0;
  private dirty = false;
  private stopped = false;
  private lastSaved = '';
  constructor(private d: EngineDeps) {}

  private now = () => (this.d.now ?? Date.now)();
  private online = () => (this.d.isOnline ?? (() => true))();

  /** Loads the remote copy, merges it with this device, stores the merge locally and remotely. */
  async start(): Promise<void> {
    this.stopped = false;
    const remote = await this.d.backend.load();
    const parsed = remote ? parseState(JSON.parse(remote)) : null;
    const merged = parsed ? merge(this.d.getLocal(), parsed) : this.d.getLocal();
    this.d.setLocal(merged);
    // If the merge equals what is stored already, there is nothing to write.
    if (parsed) this.lastSaved = serialize(parsed);
    this.dirty = true;
    await this.flush();
  }

  /** Call after every local change; writes at most once per WRITE_INTERVAL_MS. */
  changed(): void {
    if (this.stopped) return;
    this.dirty = true;
    this.d.onStatus({ kind: 'pending' });
    if (this.timer) return;
    const wait = Math.max(0, this.lastWrite + WRITE_INTERVAL_MS - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  /** Writes now if anything changed (used on visibilitychange to hidden and after sign-in). */
  async flush(): Promise<void> {
    if (this.stopped || !this.dirty) return;
    if (!this.online()) {
      this.d.onStatus({ kind: 'offline' });
      return;
    }
    const payload = serialize(this.d.getLocal());
    if (payload.length > PAYLOAD_LIMIT) {
      this.d.onStatus({ kind: 'error', message: 'Your progress is too large to sync.', retryInMs: 0 });
      return;
    }
    this.dirty = false;
    if (payload === this.lastSaved) {
      this.d.onStatus({ kind: 'synced', at: this.now() });
      return;
    }
    try {
      this.lastWrite = this.now();
      await this.d.backend.save(payload);
      this.lastSaved = payload;
      this.failures = 0;
      this.d.onStatus({ kind: 'synced', at: this.now() });
    } catch (e) {
      this.dirty = true;
      this.failures++;
      const retryInMs = Math.min(MAX_BACKOFF_MS, WRITE_INTERVAL_MS * 2 ** (this.failures - 1));
      this.d.onStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e), retryInMs });
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, retryInMs);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.d.onStatus({ kind: 'off' });
  }

  /** Deletes the synced copy (the local copy stays) and stops syncing. */
  async deleteRemote(): Promise<void> {
    this.stop();
    await this.d.backend.remove();
  }
}
