// Web Worker: loads moyo (WebAssembly) on first use and runs the symmetry analysis off the main thread.
// Loaded only by pages that need it (see symmetry-client.ts), so the wasm never touches other pages.
import init, * as moyo from '@spglib/moyo-wasm';
import wasmUrl from '@spglib/moyo-wasm/moyo_wasm_bg.wasm?url';
import { analyzeWith, type AnalyzeOptions, type MoyoApi, type SymmetryResult } from '../lib/crystal/symmetry';
import type { Structure } from '../lib/crystal/types';

export interface SymmetryRequest {
  id: number;
  structure: Structure;
  options?: AnalyzeOptions;
}
export type SymmetryResponse =
  { id: number; ok: true; result: SymmetryResult } | { id: number; ok: false; error: string };

let ready: Promise<void> | undefined;
const load = (): Promise<void> => (ready ??= init({ module_or_path: wasmUrl }).then(() => undefined));

self.onmessage = async (e: MessageEvent<SymmetryRequest>) => {
  const { id, structure, options } = e.data;
  let msg: SymmetryResponse;
  try {
    await load();
    msg = { id, ok: true, result: analyzeWith(moyo as unknown as MoyoApi, structure, options) };
  } catch (err) {
    ready = undefined;
    msg = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(msg);
};
