// Loads moyo in Node (Vitest and scripts). Not imported by browser code.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { MoyoApi } from './symmetry';

let cached: Promise<MoyoApi> | undefined;

/** Initialise the wasm module synchronously from the installed package, once. */
export function loadMoyoNode(): Promise<MoyoApi> {
  cached ??= (async () => {
    const mod = await import('@spglib/moyo-wasm');
    const req = createRequire(import.meta.url);
    const dir = dirname(req.resolve('@spglib/moyo-wasm/package.json'));
    mod.initSync({ module: readFileSync(join(dir, 'moyo_wasm_bg.wasm')) });
    return mod as unknown as MoyoApi;
  })();
  return cached;
}
