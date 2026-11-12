// Web Worker: parses large VASP files and extracts isosurfaces off the main thread, with progress messages.
import { runJob, type ParseRequest } from '../lib/vasp/parseJob';

export interface WorkerRequest {
  id: number;
  req: ParseRequest;
}
export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, req } = e.data;
  const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);
  let last = 0;
  try {
    const result = runJob(req as never, (fraction: number) => {
      const now = Date.now();
      if (now - last > 50) {
        last = now;
        post({ id, type: 'progress', fraction });
      }
    });
    post({ id, type: 'done', result });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
