// Rule (CLAUDE.md): every formula, constant and table is traced to a cited source.
// Source IDs look like S-012 and must be defined in docs/SCIENCE_SOURCES.md.
// Code and docs may reference them with "@source S-012", "source: 'S-012'" or in front matter.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, readText, rel, result } from './lib.mjs';

const REGISTER = path.join(ROOT, 'docs', 'SCIENCE_SOURCES.md');
const ID_RE = /\bS-\d{3}\b/g;
const SCAN = [
  ['src', ['.ts', '.tsx', '.astro', '.mdx', '.md', '.json', '.mjs', '.js']],
  ['content', ['.mdx', '.md', '.json']],
  ['tests', ['.ts', '.tsx', '.json', '.md']],
  ['scripts', ['.py', '.mjs', '.js', '.ts', '.md']],
  ['docs', ['.md']],
];

export function definedIds(registerText) {
  const ids = new Set();
  for (const line of registerText.split('\n')) {
    const m = /^\|\s*(S-\d{3})\s*\|/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

export default function run() {
  if (!fs.existsSync(REGISTER)) return result('sources-registered', ['docs/SCIENCE_SOURCES.md is missing']);
  const defined = definedIds(fs.readFileSync(REGISTER, 'utf8'));
  const problems = [];
  if (defined.size === 0) problems.push('docs/SCIENCE_SOURCES.md defines no source IDs');
  for (const [dir, exts] of SCAN) {
    for (const file of walk(path.join(ROOT, dir), { exts, skip: ['scripts/guard', 'docs/source-material'] })) {
      if (path.resolve(file) === REGISTER) continue;
      const text = readText(file);
      if (text === null) continue;
      const seen = new Set(text.match(ID_RE) ?? []);
      for (const id of seen) if (!defined.has(id)) problems.push(`${rel(file)} references ${id}, which is not defined in docs/SCIENCE_SOURCES.md`);
    }
  }
  return result('sources-registered', problems);
}
