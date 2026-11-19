// Web Worker for molecule mode (M10.3): loads RDKit MinimalLib (WebAssembly, about 2.4 MB gzipped) on the first
// request and does the molecule work off the main thread. Only molecule-mode pages create it (rdkit-client.ts).
// @source S-035
import initRDKitModule from '@rdkit/rdkit';
import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { handleMolecule, type RdkitRequest, type RdkitResponse } from '../lib/chem/molecule-service';
import type { RdkitApi } from '../lib/chem/molgraph';

let ready: Promise<RdkitApi> | undefined;
const load = (): Promise<RdkitApi> =>
  (ready ??= (initRDKitModule as unknown as (o: { locateFile: () => string }) => Promise<RdkitApi>)({
    locateFile: () => wasmUrl,
  }));

self.onmessage = async (e: MessageEvent<RdkitRequest>) => {
  const req = e.data;
  let msg: RdkitResponse;
  try {
    msg = { id: req.id, ok: true, result: handleMolecule(await load(), req) };
  } catch (err) {
    ready = undefined;
    msg = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(msg);
};
