// Client for the toy-model worker. Only the latest request matters. If a Worker cannot be created or fails, the curve is
// computed on the main thread after a timeout so the lab still works, only less smoothly.
import { convergenceCurve, type CurvePoint } from './kp1d';
import type { CurveRequest, CurveResponse } from './kp1d.worker';

export type CurveSpec = Omit<CurveRequest, 'id'>;

export interface WorkerLike {
  postMessage(msg: CurveRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<CurveResponse>) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export class ToyClient {
  private worker: WorkerLike | null = null;
  private latest = 0;
  private pending = new Map<number, { resolve: (p: CurvePoint[] | null) => void; spec: CurveSpec }>();
  private disposed = false;

  constructor(private readonly createWorker: () => WorkerLike | null = defaultWorker) {}

  /** Resolves with the curve, or null if a newer request replaced this one. */
  request(spec: CurveSpec): Promise<CurvePoint[] | null> {
    if (this.disposed) return Promise.resolve(null);
    const id = ++this.latest;
    return new Promise((resolve) => {
      for (const [old, p] of this.pending) {
        if (old < id) {
          p.resolve(null);
          this.pending.delete(old);
        }
      }
      this.pending.set(id, { resolve, spec });
      const w = this.ensure();
      if (w) w.postMessage({ id, ...spec });
      else setTimeout(() => this.local(id), 0);
    });
  }

  private local(id: number): void {
    const p = this.pending.get(id);
    if (!p || this.disposed) return;
    this.pending.delete(id);
    const s = p.spec;
    p.resolve(convergenceCurve({ a: s.a, potential: s.potential, k: s.k }, s.cutoffs, s.nOcc));
  }

  private ensure(): WorkerLike | null {
    if (this.worker) return this.worker;
    try {
      this.worker = this.createWorker();
    } catch {
      this.worker = null;
    }
    if (!this.worker) return null;
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      p.resolve(e.data.points);
    };
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = null;
      for (const id of [...this.pending.keys()]) setTimeout(() => this.local(id), 0);
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
  return new Worker(new URL('./kp1d.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}
