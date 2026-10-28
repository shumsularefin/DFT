// Rule (CLAUDE.md, SPEC 12): never commit, host or generate POTCAR content (VASP licence).
// Detects files named POTCAR* and the unmistakable body markers of a POTCAR dataset.
// OUTCAR parameter echoes of the POTCAR header (ENMAX, ZVAL, TITEL) are not POTCAR data and are allowed,
// but author-supplied excerpts should still be trimmed (see data/author/README.md).
import path from 'node:path';
import { ROOT, walk, readText, rel, result } from './lib.mjs';

const EXEMPT_DIRS = ['scripts/guard', 'docs/source-material'];
const NAME_RE = /^POTCAR/i;
// A real POTCAR dataset contains these block headers; two or more together is conclusive.
export const MARKERS = [/^\s*End of Dataset\s*$/m, /^\s*local part\s*$/m, /^\s*Description\s*$/m, /^\s*Pseudopotential strength for/m, /^\s*gradient corrections used for XC\s*$/m];

export default function run() {
  const problems = [];
  for (const file of walk(ROOT, { skip: EXEMPT_DIRS })) {
    const r = rel(file);
    if (NAME_RE.test(path.basename(file))) {
      problems.push(`${r}: file name looks like a POTCAR; never commit POTCAR files`);
      continue;
    }
    const text = readText(file);
    if (text === null) continue;
    const hits = MARKERS.filter((re) => re.test(text)).length;
    if (hits >= 2) problems.push(`${r}: contains ${hits} POTCAR dataset markers; remove it`);
  }
  return result('no-potcar', problems);
}
