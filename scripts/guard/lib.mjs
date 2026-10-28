// Shared helpers for the guard scripts. Pure Node, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.firebase', 'coverage', 'playwright-report', 'test-results', '.lighthouseci', '.venv', '__pycache__']);

/** Recursively list files under `dir` (absolute), skipping build output and vendored folders. */
export function walk(dir, { skip = [], exts = null } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const skipAbs = skip.map((s) => path.resolve(ROOT, s));
  const visit = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (skipAbs.some((s) => full === s || full.startsWith(s + path.sep))) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        visit(full);
      } else if (entry.isFile()) {
        if (exts && !exts.includes(path.extname(entry.name).toLowerCase())) continue;
        out.push(full);
      }
    }
  };
  visit(dir);
  return out;
}

export function isBinary(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export function readText(file) {
  const buf = fs.readFileSync(file);
  return isBinary(buf) ? null : buf.toString('utf8');
}

export const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

/** A check returns { name, ok, problems: string[] }. */
export function result(name, problems) {
  return { name, ok: problems.length === 0, problems };
}
