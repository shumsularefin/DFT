// Validate a Screening Studio dataset: the same checks as scripts/mp/validate.py (mpdata.validate_files).
// Schema (scripts/mp/schema.json), value ranges, unique ids, starter shard entries, hashes, sizes and budgets.
// @source S-044
import { gzipSync } from 'fflate';
import { validateSchema } from './jsonSchema';
import { MP_BUDGETS, MP_SCHEMA, type MpBudgets, type MpIndex, type MpManifest, type MpShard } from './schema';

export type MpErrorCode =
  | 'missing-file'
  | 'json'
  | 'schema'
  | 'hash-mismatch'
  | 'size-mismatch'
  | 'over-budget'
  | 'synthetic-mismatch'
  | 'db-version'
  | 'count'
  | 'column-length'
  | 'duplicate-symbol'
  | 'duplicate-id'
  | 'bad-lookup'
  | 'shard-files'
  | 'entry'
  | 'missing-shard-entry';

export interface MpError {
  code: MpErrorCode;
  message: string;
}

/** Returns a file's bytes, or undefined when it does not exist. Paths are relative to the dataset folder. */
export type MpReader = (rel: string) => Promise<Uint8Array | undefined>;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(data: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
}
export const gzipSize = (data: Uint8Array) => gzipSync(data, { level: 9, mtime: 0 }).length;

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Schema errors for one $defs entry, as MpError[] with the file name in front. */
export function schemaErrors(def: string, value: unknown, where: string): MpError[] {
  return validateSchema(MP_SCHEMA, MP_SCHEMA.$defs[def]!, value).map((e) => ({
    code: 'schema' as const,
    message: `${where}: ${e.path}: ${e.message}`,
  }));
}

export async function validateDataset(
  read: MpReader,
  budgetOverride: Partial<MpBudgets> = {},
): Promise<MpError[]> {
  const b = { ...MP_BUDGETS, ...budgetOverride };
  const errs: MpError[] = [];
  const err = (code: MpErrorCode, message: string) => errs.push({ code, message });
  const parse = (rel: string, raw: Uint8Array): unknown => {
    try {
      return JSON.parse(decoder.decode(raw));
    } catch (e) {
      err('json', `${rel}: not valid JSON (${(e as Error).message})`);
      return undefined;
    }
  };

  const mRaw = await read('manifest.json');
  if (!mRaw) {
    err('missing-file', 'manifest.json is missing');
    return errs;
  }
  const mVal = parse('manifest.json', mRaw);
  if (mVal === undefined) return errs;
  const mErrs = schemaErrors('manifest', mVal, 'manifest.json');
  errs.push(...mErrs);
  if (mErrs.length) return errs;
  const manifest = mVal as MpManifest;

  const listed = new Map(manifest.files.map((f) => [f.path, f]));
  if (!listed.has('index.json')) err('missing-file', 'manifest.json does not list index.json');
  const raws = new Map<string, Uint8Array>();
  let total = 0;
  for (const [rel, f] of listed) {
    const raw = await read(rel);
    if (!raw) {
      err('missing-file', `${rel} is listed in the manifest but missing`);
      continue;
    }
    raws.set(rel, raw);
    if ((await sha256Hex(raw)) !== f.sha256)
      err('hash-mismatch', `${rel}: SHA-256 does not match the manifest`);
    if (raw.length !== f.bytes) err('size-mismatch', `${rel}: ${raw.length} bytes, manifest says ${f.bytes}`);
    const gz = gzipSize(raw);
    total += gz;
    if (rel === 'index.json' && gz > b.indexGzipBytes)
      err('over-budget', `index.json is ${gz} bytes gzipped, budget ${b.indexGzipBytes}`);
    if (rel.startsWith('s/') && gz > b.shardGzipMaxBytes)
      err('over-budget', `${rel} is ${gz} bytes gzipped, maximum ${b.shardGzipMaxBytes}`);
  }
  if (total > b.totalGzipBytes)
    err('over-budget', `dataset is ${total} bytes gzipped, budget ${b.totalGzipBytes}`);
  if ((manifest.dbVersion === 'sample' || manifest.source.mock) && manifest.synthetic !== true)
    err('synthetic-mismatch', 'sample or mock data must have synthetic: true');

  const iRaw = raws.get('index.json');
  if (!iRaw) return errs;
  const iVal = parse('index.json', iRaw);
  if (iVal === undefined) return errs;
  const iErrs = schemaErrors('index', iVal, 'index.json');
  errs.push(...iErrs);
  if (iErrs.length) return errs;
  const index = iVal as MpIndex;
  const n = index.count;
  const cols = index.columns;
  if (index.dbVersion !== manifest.dbVersion)
    err('db-version', 'index.json dbVersion differs from the manifest');
  if (manifest.count !== n) err('count', `manifest count ${manifest.count} but index count ${n}`);
  for (const [k, arr] of Object.entries(cols))
    if (arr.length !== n) err('column-length', `column ${k} has ${arr.length} values, expected ${n}`);
  if (new Set(index.symbols).size !== index.symbols.length) err('duplicate-symbol', 'symbols has duplicates');
  const ids = cols.material_id;
  const seenIds = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) (seenIds.has(id) ? dups : seenIds).add(id);
  for (const id of [...dups].sort()) err('duplicate-id', `material_id ${id} appears more than once`);
  cols.elements.forEach((el, i) => {
    if (el.some((e) => e >= index.symbols.length)) err('bad-lookup', `row ${i}: element index out of range`);
  });
  cols.spacegroup.forEach((g, i) => {
    if (g >= index.spaceGroups.length) err('bad-lookup', `row ${i}: space-group index out of range`);
  });

  const starterRows = new Map<string, string>();
  cols.shard.forEach((s, i) => {
    if (s !== null && i < ids.length) starterRows.set(ids[i]!, s);
  });
  if (manifest.starterCount !== starterRows.size)
    err(
      'count',
      `manifest starterCount ${manifest.starterCount} but ${starterRows.size} index rows have a shard`,
    );
  const shardIds = [...new Set(starterRows.values())].sort();
  const shardFiles = [...listed.keys()]
    .filter((p) => p.startsWith('s/'))
    .map((p) => p.slice(2, 5))
    .sort();
  if (shardIds.join() !== shardFiles.join())
    err('shard-files', `index refers to shards [${shardIds}] but the manifest lists [${shardFiles}]`);

  const rowOf = new Map(ids.map((id, i) => [id, i]));
  const found = new Map<string, string>();
  for (const sid of shardFiles) {
    const rel = `s/${sid}.json`;
    const raw = raws.get(rel);
    if (!raw) continue;
    const sVal = parse(rel, raw);
    if (sVal === undefined) continue;
    const sErrs = schemaErrors('shard', sVal, rel);
    errs.push(...sErrs);
    if (sErrs.length) continue;
    const shard = sVal as MpShard;
    if (shard.shard !== sid) err('shard-files', `${rel} says it is shard ${shard.shard}`);
    if (shard.dbVersion !== manifest.dbVersion)
      err('db-version', `${rel} dbVersion differs from the manifest`);
    for (const e of shard.entries) {
      const id = e.material_id;
      if (found.has(id)) err('duplicate-id', `${id} appears in shard ${found.get(id)} and ${sid}`);
      found.set(id, sid);
      if (e.summary.material_id !== id)
        err('entry', `${rel}: ${id} has a summary for ${e.summary.material_id}`);
      const st = e.structure;
      if (st.species.length !== st.frac.length || st.species.length !== e.summary.nsites)
        err('entry', `${rel}: ${id} site count does not match nsites`);
      const row = rowOf.get(id);
      if (row === undefined) err('entry', `${rel}: ${id} is not in the index`);
      else if (starterRows.get(id) !== sid)
        err('entry', `${rel}: ${id} is in shard ${sid} but the index says ${starterRows.get(id)}`);
      else if (cols.nsites[row] !== e.summary.nsites)
        err('entry', `${rel}: ${id} nsites differs from the index`);
    }
  }
  for (const [id, sid] of starterRows)
    if (!found.has(id)) err('missing-shard-entry', `${id} is marked for shard ${sid} but has no entry there`);
  return errs;
}
