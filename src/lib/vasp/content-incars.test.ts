// Every INCAR shown in a handbook topic (<VaspFile name="INCAR"> or <VaspFileExplorer kind="INCAR">) must pass the M3.4 validator with
// no errors. Warnings are allowed and listed in the stage reports (work order M7.3).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIncar } from './incar';
import { formatIssue, validate } from './validate';

const ROOT = 'src/content/handbook';
const files = (readdirSync(ROOT, { recursive: true }) as string[]).filter((f) => f.endsWith('.mdx'));

describe('INCARs shown in the handbook pass the validator', () => {
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const blocks = [
      ...text.matchAll(/<VaspFile(?:Explorer)?\s+(?:name|kind)="INCAR"\s+code=\{`([\s\S]*?)`\}/g),
    ].map((m) => m[1]!);
    blocks.forEach((code, i) => {
      it(`${f} INCAR ${i + 1}: no errors`, () => {
        const { entries } = parseIncar(code);
        const errors = validate({ incar: entries })
          .filter((x) => x.severity === 'error')
          .map(formatIssue);
        expect(errors).toEqual([]);
      });
    });
  }
});
