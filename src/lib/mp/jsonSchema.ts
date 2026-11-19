// A small JSON Schema (draft 2020-12) interpreter for the keywords scripts/mp/schema.json uses (its x-keywords list).
// Kept tiny so the browser needs no schema library; schema.test.ts checks that the schema uses nothing else.
import type { JsonSchema } from './schema';

export const SUPPORTED_KEYWORDS = [
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'minLength',
  'pattern',
] as const;

export interface SchemaError {
  /** JSON pointer of the failing value, for example "/columns/band_gap/3". */
  path: string;
  message: string;
}

const typeOf = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
};
const isType = (v: unknown, t: string) => {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
};
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function resolve(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) node = (node as Record<string, unknown>)[part];
  if (!node || typeof node !== 'object') throw new Error(`unresolved $ref ${ref}`);
  return node as JsonSchema;
}

const patterns = new Map<string, RegExp>();
const re = (p: string) => {
  let r = patterns.get(p);
  if (!r) patterns.set(p, (r = new RegExp(p, 'u')));
  return r;
};

/** Validate `value` against `schema` (refs resolve against `root`). Returns every error, in document order. */
export function validateSchema(
  root: JsonSchema,
  schema: JsonSchema,
  value: unknown,
  path = '',
  out: SchemaError[] = [],
): SchemaError[] {
  const fail = (message: string) => out.push({ path: path || '/', message });
  if (typeof schema.$ref === 'string') validateSchema(root, resolve(root, schema.$ref), value, path, out);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => isType(value, t))) {
      fail(`expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return out;
    }
  }
  if ('const' in schema && !equal(value, schema.const)) fail(`expected ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => equal(e, value)))
    fail(`${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      fail(`${value} is below ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      fail(`${value} is above ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      fail(`${value} must be above ${schema.exclusiveMinimum}`);
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && [...value].length < schema.minLength)
      fail('string is too short');
    if (typeof schema.pattern === 'string' && !re(schema.pattern).test(value))
      fail(`${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      fail(`needs at least ${schema.minItems} items`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      fail(`allows at most ${schema.maxItems} items`);
    if (schema.items && typeof schema.items === 'object') {
      const items = schema.items as JsonSchema;
      value.forEach((v, i) => validateSchema(root, items, v, `${path}/${i}`, out));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const k of (schema.required ?? []) as string[])
      if (!(k in obj)) fail(`missing required property ${k}`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = props[k];
      if (sub) validateSchema(root, sub, v, `${path}/${k}`, out);
      else if (schema.additionalProperties === false) fail(`unexpected property ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
        validateSchema(root, schema.additionalProperties as JsonSchema, v, `${path}/${k}`, out);
    }
  }
  return out;
}
