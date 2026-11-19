import { beforeAll, describe, expect, it } from 'vitest';
import { handleMolecule, type RdkitRequest, type RdkitResponse } from './molecule-service';
import type { RdkitApi } from './molgraph';
import { RdkitClient, type RdkitWorkerLike } from './rdkit-client';
import { loadRdkitNode } from './rdkit-node';

let rd: RdkitApi;
beforeAll(async () => {
  rd = await loadRdkitNode();
});

/** A fake worker that runs the real request handler on the Node RDKit build. */
function inProcess(): { w: RdkitWorkerLike; made: number[]; terminated: () => boolean } {
  let term = false;
  const made: number[] = [];
  const w: RdkitWorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => void (term = true),
    postMessage: (req: RdkitRequest) => {
      made.push(req.id);
      let msg: RdkitResponse;
      try {
        msg = { id: req.id, ok: true, result: handleMolecule(rd, structuredClone(req)) };
      } catch (e) {
        msg = { id: req.id, ok: false, error: (e as Error).message };
      }
      const copy = structuredClone(msg); // what postMessage would deliver
      queueMicrotask(() => w.onmessage?.({ data: copy } as never));
    },
  };
  return { w, made, terminated: () => term };
}

describe('RdkitClient with the real request handler', () => {
  it('check: canonical SMILES, MOL block, CoordGen layout and SVG; one worker for every request', async () => {
    let n = 0;
    const f = inProcess();
    const c = new RdkitClient(() => (n++, f.w));
    const r = await c.check('OCC');
    expect(r.ok).toBe(true);
    expect(r.smiles).toBe('CCO');
    expect(r.molblock).toMatch(/V2000/);
    expect(r.layout).toBe('CoordGen');
    expect(r.svg).toMatch(/<\/svg>/);
    expect(r.geometry).toBeUndefined();
    const again = await c.check(r.graph!);
    expect(again.smiles).toBe('CCO');
    expect(n).toBe(1);
    expect(f.made).toEqual([1, 2]);
  });
  it('geometry: hydrogens expanded, converged, labelled, deterministic for a seed', async () => {
    const c = new RdkitClient(() => inProcess().w);
    const a = await c.geometry('CCO', 5);
    const b = await c.geometry('CCO', 5);
    expect(a.geometry?.species).toHaveLength(9);
    expect(a.geometry?.converged).toBe(true);
    expect(a.geometry?.notes[0]).toMatch(/Rough starting geometry/);
    expect(b.geometry?.positions).toEqual(a.geometry?.positions);
  });
  it('a valence error comes back as a B012 issue, not as a failure', async () => {
    const r = await new RdkitClient(() => inProcess().w).check('C(C)(C)(C)(C)C');
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('B012');
    expect(r.issues[0]!.atoms).toEqual([0]);
    expect(r.graph?.atoms).toHaveLength(6);
  });
});

describe('RdkitClient failure paths', () => {
  it('rejects clearly when no worker can be made, and when the worker crashes; dispose cancels', async () => {
    await expect(new RdkitClient(() => null).check('C')).rejects.toThrow(/could not start/);
    await expect(
      new RdkitClient(() => {
        throw new Error('x');
      }).check('C'),
    ).rejects.toThrow(/could not start/);
    let term = false;
    const silent: RdkitWorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => void (term = true),
      postMessage: () => {},
    };
    const c = new RdkitClient(() => silent);
    const p = c.check('C');
    silent.onerror?.({});
    await expect(p).rejects.toThrow(/could not start/);
    expect(term).toBe(true);
    const c2 = new RdkitClient(() => ({ ...silent }));
    const p2 = c2.geometry('C');
    c2.dispose();
    await expect(p2).rejects.toThrow(/cancelled/);
  });
  it('the worker error text is passed on', async () => {
    const w: RdkitWorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => {},
      postMessage: (m) =>
        queueMicrotask(() => w.onmessage?.({ data: { id: m.id, ok: false, error: 'wasm failed' } } as never)),
    };
    await expect(new RdkitClient(() => w).check('C')).rejects.toThrow('wasm failed');
  });
});
