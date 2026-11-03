// Client for the orbital sampling worker. Only the latest request matters: older answers are dropped.
// If a Worker cannot be created (very old browser, blocked), sampling runs on the main thread after a
// timeout so the page still works, only less smoothly.
import { sampleOrbital, type OrbitalCloud } from './hydrogen';
import type { SampleRequest, SampleResponse } from './orbital.worker';

export interface SampleSpec {
  n: number;
  l: number;
  m: number;
  count: number;
  seed: number;
}

export interface WorkerLike {
  postMessage(msg: SampleRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<SampleResponse>) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export class OrbitalSampler {
  private worker: WorkerLike | null = null;
  private latest = 0;
  private pending = new Map<number, { resolve: (c: OrbitalCloud | null) => void; spec: SampleSpec }>();
  private disposed = false;

  constructor(private readonly createWorker: () => WorkerLike | null = defaultWorker) {}

  /** Resolves with the cloud, or with null if a newer request replaced this one. */
  request(spec: SampleSpec): Promise<OrbitalCloud | null> {
    if (this.disposed) return Promise.resolve(null);
    const id = ++this.latest;
    return new Promise((resolve) => {
      // an older request can never be answered once a newer one is made
      for (const [oldId, p] of this.pending) {
        if (oldId < id) {
          p.resolve(null);
          this.pending.delete(oldId);
        }
      }
      this.pending.set(id, { resolve, spec });
      const w = this.ensureWorker();
      if (w) w.postMessage({ id, ...spec });
      else
        setTimeout(() => {
          const p = this.pending.get(id);
          if (!p || this.disposed) return;
          this.pending.delete(id);
          p.resolve(sampleOrbital(spec.n, spec.l, spec.m, spec.count, spec.seed));
        }, 0);
    });
  }

  private ensureWorker(): WorkerLike | null {
    if (this.worker) return this.worker;
    try {
      this.worker = this.createWorker();
    } catch {
      this.worker = null;
    }
    if (!this.worker) return null;
    this.worker.onmessage = (e) => {
      const { id, positions, signs, extent } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      p.resolve({ positions, signs, extent });
    };
    this.worker.onerror = () => {
      // fall back to the main thread for whatever is still waiting
      this.worker?.terminate();
      this.worker = null;
      for (const [id, p] of [...this.pending]) {
        this.pending.delete(id);
        setTimeout(
          () => p.resolve(sampleOrbital(p.spec.n, p.spec.l, p.spec.m, p.spec.count, p.spec.seed)),
          0,
        );
      }
    };
    return this.worker;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.resolve(null);
    this.pending.clear();
  }
}

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./orbital.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}
