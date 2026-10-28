// Keeps the planning documents honest: every relative markdown link must resolve.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, readText, rel, result } from './lib.mjs';

const LINK_RE = /\]\(([^)\s]+)\)/g;

export default function run() {
  const problems = [];
  const files = walk(ROOT, { exts: ['.md'], skip: ['docs/source-material', 'tests/reference'] });
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    // Ignore fenced code blocks so examples do not count as links.
    const stripped = text.replace(/```[\s\S]*?```/g, '');
    for (const m of stripped.matchAll(LINK_RE)) {
      let target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0];
      if (!target) continue;
      const abs = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(abs)) problems.push(`${rel(file)} links to missing file "${m[1]}"`);
    }
  }
  return result('doc-links', problems);
}
