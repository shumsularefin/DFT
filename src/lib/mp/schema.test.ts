import { describe, expect, it } from 'vitest';
import { SUPPORTED_KEYWORDS, validateSchema } from './jsonSchema';
import {
  CRYSTAL_SYSTEMS,
  INDEX_COLUMNS,
  MANIFEST_KEYS,
  MP_BUDGETS,
  MP_SCHEMA,
  MP_SCHEMA_VERSION,
  SUMMARY_KEYS,
  type JsonSchema,
} from './schema';

const defs = MP_SCHEMA.$defs as Record<
  string,
  JsonSchema & { required: string[]; properties: Record<string, JsonSchema> }
>;

function keywordsIn(node: unknown, out = new Set<string>(), under = ''): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywordsIn(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // Names under properties and $defs are data, not keywords; const and enum values are data too.
      if (under !== 'properties' && under !== '$defs') out.add(k);
      if (k === 'const' || k === 'enum' || k === 'required' || k === 'x-keywords' || k === 'x-budgets')
        continue;
      keywordsIn(v, out, k);
    }
  }
  return out;
}

describe('schema.ts agrees with scripts/mp/schema.json', () => {
  it('uses only keywords the TypeScript interpreter supports', () => {
    const used = [...keywordsIn(MP_SCHEMA)].filter((k) => !k.startsWith('x-'));
    for (const k of used) expect(SUPPORTED_KEYWORDS as readonly string[]).toContain(k);
    expect([...SUPPORTED_KEYWORDS]).toEqual(MP_SCHEMA['x-keywords']);
  });

  it('has the same manifest, index column and summary fields, in order', () => {
    expect(defs.manifest!.required).toEqual([...MANIFEST_KEYS]);
    expect(Object.keys(defs.manifest!.properties)).toEqual([...MANIFEST_KEYS]);
    const columns = defs.index!.properties.columns as { required: string[]; properties: object };
    expect(columns.required).toEqual([...INDEX_COLUMNS]);
    expect(Object.keys(columns.properties)).toEqual([...INDEX_COLUMNS]);
    expect(defs.summary!.required).toEqual([...SUMMARY_KEYS]);
    expect(Object.keys(defs.summary!.properties)).toEqual([...SUMMARY_KEYS]);
  });

  it('has the same version, budgets and crystal systems', () => {
    expect(MP_SCHEMA['x-schemaVersion']).toBe(MP_SCHEMA_VERSION);
    expect(defs.manifest!.properties.schemaVersion).toEqual({ const: MP_SCHEMA_VERSION });
    // M9 work order: index <= 1.5 MB gzipped, shards about 100 KB, total <= 10 MB.
    expect(MP_BUDGETS).toEqual({
      indexGzipBytes: 1.5 * 1024 * 1024,
      shardGzipTargetBytes: 100 * 1024,
      shardGzipMaxBytes: 128 * 1024,
      totalGzipBytes: 10 * 1024 * 1024,
    });
    const sym = defs.summary!.properties.symmetry as { properties: { crystal_system: { enum: string[] } } };
    expect(sym.properties.crystal_system.enum).toEqual([...CRYSTAL_SYSTEMS]);
  });
});

describe('validateSchema', () => {
  const root = { $defs: { pos: { type: 'number', minimum: 0 } } };
  const v = (schema: JsonSchema, value: unknown) => validateSchema(root, schema, value);

  it('checks types, with integer counting as a number and null allowed by a type list', () => {
    expect(v({ type: 'number' }, 3)).toEqual([]);
    expect(v({ type: 'integer' }, 3.5)).toHaveLength(1);
    expect(v({ type: ['number', 'null'] }, null)).toEqual([]);
    expect(v({ type: 'boolean' }, 'true')).toHaveLength(1);
  });

  it('applies numeric and string keywords only to their own types', () => {
    expect(v({ type: ['string', 'null'], pattern: '^[0-9]{3}$' }, null)).toEqual([]);
    expect(v({ pattern: '^[0-9]{3}$' }, '01')).toHaveLength(1);
    expect(v({ exclusiveMinimum: 0 }, 0)).toHaveLength(1);
    expect(v({ minimum: 0 }, -0.01)[0]!.message).toContain('below');
    expect(v({ maximum: 230 }, 231)).toHaveLength(1);
    expect(v({ minLength: 1 }, '')).toHaveLength(1);
  });

  it('follows $ref, items, required and additionalProperties, with JSON-pointer paths', () => {
    const s = {
      type: 'object',
      required: ['a'],
      additionalProperties: false,
      properties: { a: { type: 'array', minItems: 1, maxItems: 2, items: { $ref: '#/$defs/pos' } } },
    };
    expect(v(s, { a: [1] })).toEqual([]);
    expect(v(s, {}).map((e) => e.message)).toEqual(['missing required property a']);
    expect(v(s, { a: [1, -2] })[0]!.path).toBe('/a/1');
    expect(v(s, { a: [1, 2, 3] })).toHaveLength(1);
    expect(v(s, { a: [1], b: 2 })[0]!.message).toBe('unexpected property b');
  });

  it('checks const and enum by value', () => {
    expect(v({ const: 1 }, 1)).toEqual([]);
    expect(v({ const: 1 }, 2)).toHaveLength(1);
    expect(v({ enum: ['NM', null] }, null)).toEqual([]);
    expect(v({ enum: ['NM', null] }, 'XX')).toHaveLength(1);
  });
});
