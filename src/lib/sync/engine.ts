/**
 * Progress sync engine: pure logic, no Firebase import, so it is tested in Node with fake timers.
 *
 * One document per user holds the learner state. The device copy is the source of truth: on sign-in or
 * resume the cloud copy is merged into it with `mergeStates` (M6.2), then the merged state is written back
 * only if the cloud copy differs. While active, at most one write is made per WRITE_INTERVAL_MS, plus one
 * when the page is hidden. Errors back off exponentially. An empty state is never written automatically,
 * so erasing on this device cannot silently wipe the cloud copy (only "Delete my synced data" does that).
 * @source engineering choices (D-083); the quota arithmetic is in docs/reports/M6.5.md (Q-006).
 */
import { deserialize, mergeStates, serialize, type LearnerState } from '../learning/state';

export const WRITE_INTERVAL_MS = 60_000;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'signing-in' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

/** What the engine needs from Firebase. The real one is in firebase.ts and loaded lazily. */
export interface Backend {
  /** Open the sign-in popup. Resolves to the user id. */
  signIn(): Promise<string>;
  /** A session that already exists, without any popup, or null. */
  resume(): Promise<string | null>;
  signOut(): Promise<void>;
  /** The stored learner JSON text, or null when the user has no document yet. */
  load(uid: string): Promise<string | null>;
  save(uid: string, learnerJson: string): Promise<void>;
  remove(uid: string): Promise<void>;
}

/** The device copy of the learner state. */
export interface LocalState {
  get(): LearnerState;
  /** Replace the device copy. The engine's own change must not be reported back through markDirty. */
  set(s: LearnerState): void;
}

export interface EngineOptions {
  now?: () => number;
  isOffline?: () => boolean;
}

export const isEmptyState = (s: LearnerState) =>
  Object.keys(s.concepts).length === 0 && Object.keys(s.questions).length === 0;

/** Delay before retry number `failures` (1 for the first failure). */
export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

export class SyncEngine {
  private status: SyncStatus = { kind: 'off' };
  private listeners = new Set<(s: SyncStatus) => void>();
  private uid: string | null = null;
  private dirty = false;
  private writing = false;
  /** True once the cloud copy has been merged in. Nothing is written before that. */
  private reconciled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastWrite = 0;
  private failures = 0;
  private readonly now: () => number;
  private readonly isOffline: () => boolean;

  constructor(
    private readonly backend: Backend,
    private readonly local: LocalState,
    opts: EngineOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.isOffline = opts.isOffline ?? (() => false);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: SyncStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /** The user pressed "Sign in to sync". */
  async signIn(): Promise<void> {
    this.set({ kind: 'signing-in' });
    try {
      this.uid = await this.backend.signIn();
    } catch (e) {
      this.uid = null;
      this.set({ kind: 'error', message: messageOf(e) });
      return;
    }
    await this.reconcile();
  }

  /** The user chose sync on an earlier visit: continue the session if it is still valid. */
  async resume(): Promise<void> {
    this.set({ kind: 'syncing' });
    try {
      this.uid = await this.backend.resume();
    } catch (e) {
      this.uid = null;
      this.set({ kind: 'error', message: messageOf(e) });
      return;
    }
    if (!this.uid) {
      this.set({ kind: 'off' });
      return;
    }
    await this.reconcile();
  }

  /** Merge the cloud copy into the device copy, then write back if the cloud copy was out of date. */
  private async reconcile(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    this.set({ kind: 'syncing' });
    try {
      const text = await this.backend.load(uid);
      const local = this.local.get();
      let remote: LearnerState | null = null;
      if (text !== null) {
        try {
          remote = deserialize(text);
        } catch {
          // Never overwrite a cloud copy this version cannot read (for example a newer format).
          this.set({
            kind: 'error',
            message: 'The synced copy has a format this version cannot read, so nothing was changed.',
          });
          return;
        }
      }
      const merged = remote ? mergeStates(local, remote) : local;
      const mergedText = serialize(merged);
      if (mergedText !== serialize(local)) this.local.set(merged);
      if (
        !isEmptyState(merged) &&
        (text === null || serialize(mergeStates(remote!, remote!)) !== mergedText)
      ) {
        await this.backend.save(uid, mergedText);
        this.lastWrite = this.now();
      }
      this.reconciled = true;
      this.dirty = false;
      this.failures = 0;
      this.set({ kind: 'synced', at: this.now() });
    } catch (e) {
      this.fail(e);
    }
  }

  /** The device copy changed. Schedule a write, at most one per WRITE_INTERVAL_MS. */
  markDirty(): void {
    if (!this.uid) return;
    this.dirty = true;
    if (this.timer || this.writing) return;
    this.arm(Math.max(0, this.lastWrite + WRITE_INTERVAL_MS - this.now()));
  }

  private arm(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void (this.reconciled ? this.write() : this.reconcile());
    }, delay);
  }

  /** Write now if something is waiting (used when the page is hidden or the browser comes back online). */
  async flush(): Promise<void> {
    if (!this.uid || !this.dirty || this.writing || !this.reconciled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.write();
  }

  private async write(): Promise<void> {
    const uid = this.uid;
    if (!uid || !this.dirty || this.writing || !this.reconciled) return;
    const snapshot = this.local.get();
    if (isEmptyState(snapshot)) {
      this.dirty = false;
      return;
    }
    if (this.isOffline()) {
      this.fail(new Error('offline'), true);
      return;
    }
    this.writing = true;
    this.dirty = false;
    this.set({ kind: 'syncing' });
    try {
      await this.backend.save(uid, serialize(snapshot));
      this.lastWrite = this.now();
      this.failures = 0;
      this.set({ kind: 'synced', at: this.now() });
    } catch (e) {
      this.dirty = true;
      this.writing = false;
      this.fail(e);
      return;
    }
    this.writing = false;
    // Something changed while the write was in flight: schedule the next one.
    if (this.dirty) this.arm(WRITE_INTERVAL_MS);
  }

  private fail(e: unknown, offline = false) {
    this.failures += 1;
    this.dirty = true;
    this.set(offline || this.isOffline() ? { kind: 'offline' } : { kind: 'error', message: messageOf(e) });
    if (this.uid) this.arm(backoffMs(this.failures));
  }

  async signOut(): Promise<void> {
    await this.flush();
    await this.stop();
  }

  /** Remove the cloud copy, then sign out. The device copy is not touched. */
  async deleteRemote(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    this.set({ kind: 'syncing' });
    try {
      await this.backend.remove(uid);
    } catch (e) {
      this.fail(e);
      return;
    }
    this.dirty = false;
    await this.stop();
  }

  private async stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.uid = null;
    this.dirty = false;
    this.reconciled = false;
    this.failures = 0;
    try {
      await this.backend.signOut();
    } finally {
      this.set({ kind: 'off' });
    }
  }
}
