// Client for the VASP parse worker. One worker, any number of jobs, each with its own progress callback. If a Worker
// cannot be created the job runs on the main thread after a timeout so the page still works, only less smoothly.
import { runJob, type ParseRequest, type ParseResultMap } from './parseJob';
import type { WorkerRequest, WorkerResponse } from '../../workers/vasp.worker';

export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

interface Pending {
  req: ParseRequest;
  resolve: (r: never) => void;
  reject: (e: Error) => void;
  progress?: (f: number) => void;
}

export class ParseClient {
  private worker: WorkerLike | null = null;
  private next = 0;
  private pending = new Map<number, Pending>();
  private disposed = false;

  constructor(private readonly createWorker: () => WorkerLike | null = defaultWorker) {}

  run<K extends ParseRequest['kind']>(
    req: Extract<ParseRequest, { kind: K }>,
    progress?: (fraction: number) => void,
  ): Promise<ParseResultMap[K]> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('The parser was closed.'));
        return;
      }
      const id = ++this.next;
      this.pending.set(id, {
        req,
        resolve: resolve as (r: never) => void,
        reject,
        ...(progress ? { progress } : {}),
      });
      const w = this.ensure();
      if (w) w.postMessage({ id, req });
      else setTimeout(() => this.local(id), 0);
    });
  }

  private local(id: number): void {
    const p = this.pending.get(id);
    if (!p || this.disposed) return;
    this.pending.delete(id);
    try {
      p.resolve(runJob(p.req as never, p.progress) as never);
    } catch (e) {
      p.reject(e instanceof Error ? e : new Error(String(e)));
    }
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
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.progress?.(m.fraction);
      else {
        this.pending.delete(m.id);
        if (m.type === 'done') p.resolve(m.result as never);
        else p.reject(new Error(m.message));
      }
    };
    this.worker.onerror = () => {
      // the worker died: run what is waiting on the main thread
      const ids = [...this.pending.keys()];
      this.worker?.terminate();
      this.worker = null;
      for (const id of ids) setTimeout(() => this.local(id), 0);
    };
    return this.worker;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('The parser was closed.'));
    this.pending.clear();
  }
}

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../../workers/vasp.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}
