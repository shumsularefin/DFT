// Main-thread client for the symmetry worker. The worker (and the moyo wasm inside it) is created on the first request,
// so a page that never analyzes a structure never downloads the engine. There is no main-thread fallback on purpose:
// the analysis can take a while for large cells and must never block typing or scrolling.
import type { SymmetryRequest, SymmetryResponse } from '../../workers/symmetry.worker';
import type { AnalyzeOptions, SymmetryResult } from './symmetry';
import type { Structure } from './types';

export interface SymmetryWorkerLike {
  postMessage(msg: SymmetryRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<SymmetryResponse>) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

const UNAVAILABLE =
  'The symmetry engine could not start in this browser (Web Workers or WebAssembly are blocked).';

export class SymmetryClient {
  private worker: SymmetryWorkerLike | null = null;
  private next = 0;
  private pending = new Map<number, { resolve: (r: SymmetryResult) => void; reject: (e: Error) => void }>();

  constructor(private readonly createWorker: () => SymmetryWorkerLike | null = defaultWorker) {}

  /** Analyze a structure. Rejects with a plain-language Error. */
  analyze(structure: Structure, options?: AnalyzeOptions): Promise<SymmetryResult> {
    return new Promise((resolve, reject) => {
      const w = this.ensure();
      if (!w) return reject(new Error(UNAVAILABLE));
      const id = ++this.next;
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, structure, ...(options ? { options } : {}) });
    });
  }

  private ensure(): SymmetryWorkerLike | null {
    if (this.worker) return this.worker;
    try {
      this.worker = this.createWorker();
    } catch {
      this.worker = null;
    }
    const w = this.worker;
    if (!w) return null;
    w.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    w.onerror = () => {
      w.terminate();
      this.worker = null;
      this.rejectAll(new Error(UNAVAILABLE));
    };
    return w;
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('The symmetry analysis was cancelled.'));
  }
}

function defaultWorker(): SymmetryWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../../workers/symmetry.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as SymmetryWorkerLike;
}
