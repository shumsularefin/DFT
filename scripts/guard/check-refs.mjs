// Every referenced open question (Q-nnn) and decision (D-nnn) must exist.
// Q ids are defined by "## Q-nnn." headings in docs/OPEN_QUESTIONS.md; D ids by "**D-nnn." in docs/DECISIONS.md.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, readText, rel, result } from './lib.mjs';

const OQ = path.join(ROOT, 'docs', 'OPEN_QUESTIONS.md');
const DEC = path.join(ROOT, 'docs', 'DECISIONS.md');

export function definedQ(text) {
  return new Set([...text.matchAll(/^## (Q-\d{3})\b/gm)].map((m) => m[1]));
}
export function definedD(text) {
  return new Set([...text.matchAll(/\*\*(D-\d{3})\./g)].map((m) => m[1]));
}

export default function run() {
  const problems = [];
  const qs = fs.existsSync(OQ) ? definedQ(fs.readFileSync(OQ, 'utf8')) : new Set();
  const ds = fs.existsSync(DEC) ? definedD(fs.readFileSync(DEC, 'utf8')) : new Set();
  const files = [
    ...walk(path.join(ROOT, 'docs'), { exts: ['.md'], skip: ['docs/source-material', 'docs/reports'] }),
    ...walk(path.join(ROOT, 'src'), { exts: ['.ts', '.tsx', '.astro', '.mdx', '.md'] }),
    ...walk(path.join(ROOT, 'scripts'), { exts: ['.py', '.mjs', '.js', '.ts', '.md'], skip: ['scripts/guard'] }),
    ...walk(path.join(ROOT, 'tests'), { exts: ['.ts', '.md'] }),
    ...['SPEC.md', 'CLAUDE.md', 'README.md'].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
  ];
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    for (const m of new Set(text.match(/\bQ-\d{3}\b/g) ?? [])) if (!qs.has(m)) problems.push(`${rel(file)} references ${m}, not defined in docs/OPEN_QUESTIONS.md`);
    for (const m of new Set(text.match(/\bD-\d{3}\b/g) ?? [])) if (!ds.has(m)) problems.push(`${rel(file)} references ${m}, not defined in docs/DECISIONS.md`);
  }
  return result('q-and-d-references', problems);
}
