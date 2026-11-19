// Loads RDKit MinimalLib in Node (Vitest and scripts). Not imported by browser code; the browser uses rdkit.worker.ts.
import type { RdkitApi } from './molgraph';

let cached: Promise<RdkitApi> | undefined;

/** Initialise RDKit once (the package finds its wasm next to its JavaScript). */
export function loadRdkitNode(): Promise<RdkitApi> {
  cached ??= (async () => {
    const mod = await import('@rdkit/rdkit');
    const init = mod.default as unknown as () => Promise<unknown>;
    return (await init()) as RdkitApi;
  })();
  return cached;
}
