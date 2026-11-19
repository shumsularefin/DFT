import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fixtures from '../../../scripts/mp/tests/fixtures.json';
import { gzipSize, sha256Hex, validateDataset, type MpReader } from './validate';
import type { MpBudgets } from './schema';

const SAMPLE = path.resolve(__dirname, '../../../public/data/mp/sample');

function loadSample(): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (dir: string) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else out.set(path.relative(SAMPLE, p).split(path.sep).join('/'), new Uint8Array(fs.readFileSync(p)));
    }
  };
  walk(SAMPLE);
  return out;
}
const reader =
  (files: Map<string, Uint8Array>): MpReader =>
  async (rel) =>
    files.get(rel);
const enc = new TextEncoder();
const dec = new TextDecoder();
const json = (b: Uint8Array) => JSON.parse(dec.decode(b)) as Record<string, unknown>;

interface Edit {
  file: string;
  set?: (string | number)[];
  delete?: (string | number)[];
  value?: unknown;
  appendText?: string;
  remove?: boolean;
  rehash?: boolean;
}
interface Case {
  name: string;
  edits?: Edit[];
  budgets?: Partial<MpBudgets>;
  expect: string[];
}

/** TypeScript twin of apply_case in scripts/mp/tests/test_pipeline.py. */
async function applyCase(base: Map<string, Uint8Array>, c: Case): Promise<Map<string, Uint8Array>> {
  const out = new Map(base);
  const man = json(out.get('manifest.json')!) as { files: { path: string; sha256: string; bytes: number }[] };
  for (const e of c.edits ?? []) {
    if (e.remove) {
      out.delete(e.file);
      continue;
    }
    if (e.appendText !== undefined) {
      const a = out.get(e.file)!;
      const b = enc.encode(e.appendText);
      const joined = new Uint8Array(a.length + b.length);
      joined.set(a);
      joined.set(b, a.length);
      out.set(e.file, joined);
    } else {
      const doc = e.file === 'manifest.json' ? man : json(out.get(e.file)!);
      const p = (e.set ?? e.delete)!;
      let node = doc as Record<string | number, unknown>;
      for (const k of p.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
      const last = p.at(-1)!;
      if (e.set) node[last] = e.value;
      else (node as unknown as unknown[]).splice(last as number, 1);
      if (e.file !== 'manifest.json') out.set(e.file, enc.encode(JSON.stringify(doc)));
    }
    if (e.rehash && e.file !== 'manifest.json') {
      const row = man.files.find((f) => f.path === e.file)!;
      row.sha256 = await sha256Hex(out.get(e.file)!);
      row.bytes = out.get(e.file)!.length;
    }
  }
  out.set('manifest.json', enc.encode(JSON.stringify(man)));
  return out;
}

describe('validateDataset', () => {
  const sample = loadSample();

  it('accepts the committed sample dataset, which is marked synthetic', async () => {
    expect(await validateDataset(reader(sample))).toEqual([]);
    const man = json(sample.get('manifest.json')!);
    expect(man.synthetic).toBe(true);
    expect(man.dbVersion).toBe('sample');
    const idx = json(sample.get('index.json')!) as { columns: { material_id: string[] } };
    expect(idx.columns.material_id[0]).toBe('sample-0001');
    expect([...sample.keys()].filter((k) => k.startsWith('s/')).length).toBeGreaterThan(1);
  });

  it('agrees with the manifest on hashes (Web Crypto SHA-256 equals Python hashlib)', async () => {
    const man = json(sample.get('manifest.json')!) as { files: { path: string; sha256: string }[] };
    for (const f of man.files) expect(await sha256Hex(sample.get(f.path)!)).toBe(f.sha256);
  });

  for (const c of fixtures.cases as Case[]) {
    it(`rejects the shared fixture: ${c.name}`, async () => {
      const files = await applyCase(sample, c);
      const codes = new Set((await validateDataset(reader(files), c.budgets)).map((e) => e.code));
      for (const code of c.expect) expect(codes).toContain(code);
    });
  }

  it('reports a missing manifest and invalid JSON', async () => {
    expect((await validateDataset(async () => undefined)).map((e) => e.code)).toEqual(['missing-file']);
    const bad = new Map(sample);
    bad.set('manifest.json', enc.encode('{'));
    expect((await validateDataset(reader(bad))).map((e) => e.code)).toEqual(['json']);
  });

  it('measures gzip size like the budget expects', () => {
    expect(gzipSize(enc.encode('x'.repeat(10000)))).toBeLessThan(100);
  });
});
