// Turns the source register (docs/SCIENCE_SOURCES.md) into src/data/sources.json for the References page
// and the content linter. Run by `npm run build`. Usage: node scripts/build/sources-to-json.mjs [in.md] [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Parses the markdown table rows that start with `| S-nnn |`. Columns: ID, citation, used for, access, status, notes. */
export function parseSources(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!/^\|\s*S-\d{3}\s*\|/.test(line)) continue;
    const cells = line
      .replace(/^\||\|\s*$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length !== 6)
      throw new Error(`register row has ${cells.length} columns, expected 6: ${line.slice(0, 60)}`);
    const [id, citation, usedFor, access, status, notes] = cells;
    rows.push({ id, citation, usedFor, access, status, notes });
  }
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = process.argv[2] ?? 'docs/SCIENCE_SOURCES.md';
  const output = process.argv[3] ?? 'src/data/sources.json';
  const rows = parseSources(fs.readFileSync(input, 'utf8'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
  console.log(`sources-to-json: ${rows.length} sources -> ${output}`);
}
