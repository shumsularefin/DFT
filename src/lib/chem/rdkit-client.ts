// Main-thread client for the RDKit worker (M10.3). The worker, and the 2.4 MB RDKit wasm inside it, is created on
// the first request, so only molecule mode ever downloads RDKit. Same pattern as symmetry-client.ts.
import type { MoleculeReport, RdkitRequest, RdkitResponse } from './molecule-service';
import type { MolGraph } from './molgraph';

export interface RdkitWorkerLike {
  postMessage(msg: RdkitRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<RdkitResponse>) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export const RDKIT_UNAVAILABLE =
  'The molecule engine (RDKit) could not start in this browser (Web Workers or WebAssembly are blocked).';

export class RdkitClient {
  private worker: RdkitWorkerLike | null = null;
  private next = 0;
  private pending = new Map<number, { resolve: (r: MoleculeReport) => void; reject: (e: Error) => void }>();

  constructor(private readonly createWorker: () => RdkitWorkerLike | null = defaultWorker) {}

  /** Read SMILES or a MOL block (or check a graph), lay it out and draw it. */
  check(input: string | MolGraph): Promise<MoleculeReport> {
    return this.send({ op: 'check', input });
  }

  /** As `check`, plus the rough 3D geometry (geom3d.ts). */
  geometry(input: string | MolGraph, seed?: number): Promise<MoleculeReport> {
    return this.send({ op: 'geometry', input, ...(seed === undefined ? {} : { seed }) });
  }

  private send(req: Omit<RdkitRequest, 'id'>): Promise<MoleculeReport> {
    return new Promise((resolve, reject) => {
      const w = this.ensure();
      if (!w) return reject(new Error(RDKIT_UNAVAILABLE));
      const id = ++this.next;
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, ...req });
    });
  }

  private ensure(): RdkitWorkerLike | null {
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
      this.rejectAll(new Error(RDKIT_UNAVAILABLE));
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
    this.rejectAll(new Error('The molecule request was cancelled.'));
  }
}

function defaultWorker(): RdkitWorkerLike | null {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return null;
  return new Worker(new URL('../../workers/rdkit.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as RdkitWorkerLike;
}
