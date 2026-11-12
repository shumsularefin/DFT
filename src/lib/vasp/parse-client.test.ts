import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ParseClient, type WorkerLike } from './parse-client';
import { outcarSteps } from './relaxSteps';

const ref = (n: string) => readFileSync(`tests/reference/vasp-outputs/${n}`, 'utf8');

describe('ParseClient without a Worker', () => {
  it('parses a CHGCAR on the main thread and reports progress', async () => {
    const c = new ParseClient(() => null);
    const seen: number[] = [];
    const r = await c.run({ kind: 'chgcar', text: ref('CHGCAR') }, (f) => seen.push(f));
    expect(r.grid).toEqual([20, 20, 24]);
    expect(seen.length).toBeGreaterThan(0);
    c.dispose();
  });
  it('rejects with the parser message on a bad file', async () => {
    const c = new ParseClient(() => null);
    await expect(c.run({ kind: 'eigenval', text: 'nope' })).rejects.toThrow();
    c.dispose();
  });
  it('runs a marching-cubes job', async () => {
    const c = new ParseClient(() => null);
    const n = 8;
    const values = new Float64Array(n * n * n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) values[x + n * (y + n * z)] = Math.hypot(x - 3.5, y - 3.5, z - 3.5);
    const m = await c.run({
      kind: 'mesh',
      values,
      dims: [n, n, n],
      iso: 2.5,
      lattice: [
        [8, 0, 0],
        [0, 8, 0],
        [0, 0, 8],
      ],
      periodic: false,
    });
    expect(m.indices.length).toBeGreaterThan(0);
    c.dispose();
  });
});

describe('ParseClient with a worker', () => {
  it('routes progress and results by job id', async () => {
    let sent: { id: number } | null = null;
    const w: WorkerLike = {
      postMessage: (m) => (sent = m),
      terminate: () => {},
      onmessage: null,
      onerror: null,
    };
    const c = new ParseClient(() => w);
    const seen: number[] = [];
    const p = c.run({ kind: 'xdatcar', text: '' }, (f) => seen.push(f));
    w.onmessage?.({ data: { id: sent!.id, type: 'progress', fraction: 0.5 } } as MessageEvent);
    w.onmessage?.({ data: { id: sent!.id, type: 'done', result: 'ok' } } as MessageEvent);
    expect(await p).toBe('ok');
    expect(seen).toEqual([0.5]);
  });
  it('falls back to the main thread when the worker errors', async () => {
    const w: WorkerLike = { postMessage: () => {}, terminate: () => {}, onmessage: null, onerror: null };
    const c = new ParseClient(() => w);
    const p = c.run({ kind: 'eigenval', text: ref('EIGENVAL_ispin1') });
    w.onerror?.(new Error('x'));
    expect((await p).ispin).toBe(1);
  });
});

describe('outcarSteps', () => {
  const block = (f: number, e: number) =>
    ` POSITION                                       TOTAL-FORCE (eV/Angst)\n -----\n  0 0 0   0.0 0.0 ${f}\n  1 1 1   0.0 0.0 ${-f}\n -----\n  free  energy   TOTEN  =       ${e} eV\n`;
  it('pairs force blocks with energies, one entry per ionic step', () => {
    const s = outcarSteps(block(0.3, -10.5) + block(0.04, -10.9));
    expect(s).toEqual([
      { step: 1, energy: -10.5, maxForce: 0.3 },
      { step: 2, energy: -10.9, maxForce: 0.04 },
    ]);
  });
  it('keeps an unmatched trailing step', () => {
    const s = outcarSteps(
      block(0.3, -10.5) + ' POSITION   TOTAL-FORCE (eV/Angst)\n -----\n 0 0 0 0 0 0.1\n -----\n',
    );
    expect(s[1]).toEqual({ step: 2, maxForce: 0.1 });
  });
  it('reads the real-format fixture', () => {
    const t = readFileSync('src/lib/vasp/__fixtures__/outcar-v54.txt', 'utf8');
    expect(outcarSteps(t)[0]?.maxForce).toBeCloseTo(0.03, 6);
  });
});
