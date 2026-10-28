// Rule (CLAUDE.md): never use em dashes (U+2014) in any text written for the site.
// Scans the folders that ship to users. docs/ and scripts/ are exempt on purpose.
import { ROOT, walk, readText, rel, result } from './lib.mjs';
import path from 'node:path';

const SITE_DIRS = ['src', 'public', 'content', 'data'];
const TEXT_EXTS = ['.astro', '.md', '.mdx', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.html', '.txt', '.svg', '.webmanifest', '.csv', '.yml', '.yaml'];
const EM_DASH = '\u2014';
const EXEMPT = ['public/pagefind', 'public/data/third-party'];

export function checkText(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) hits.push({ line: i + 1, text: line.trim().slice(0, 100) });
  });
  return hits;
}

export default function run() {
  const problems = [];
  for (const d of SITE_DIRS) {
    for (const file of walk(path.join(ROOT, d), { exts: TEXT_EXTS, skip: EXEMPT })) {
      const text = readText(file);
      if (text === null) continue;
      for (const h of checkText(text)) problems.push(`${rel(file)}:${h.line} contains an em dash: "${h.text}"`);
    }
  }
  return result('no-em-dash', problems);
}
