#!/usr/bin/env node
// Claude Code PostToolUse hook for Write/Edit. Reads the hook JSON from stdin and, when the edited file
// is site text, rejects em dashes immediately (exit code 2 feeds stderr back to the model).
// Fails open: any internal problem exits 0 so a hook bug can never block work.
import fs from 'node:fs';
import path from 'node:path';
import { rel } from './lib.mjs';
import { checkText } from './check-emdash.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const file = input?.tool_input?.file_path;
  if (!file) process.exit(0);
  const r = rel(path.resolve(file));
  const isSite = /^(src|public|content|data)\//.test(r) && !r.startsWith('public/pagefind/');
  const isText = /\.(astro|md|mdx|ts|tsx|js|mjs|json|css|html|txt|svg|webmanifest|csv|ya?ml)$/i.test(r);
  if (!isSite || !isText || !fs.existsSync(path.resolve(file))) process.exit(0);
  const hits = checkText(fs.readFileSync(path.resolve(file), 'utf8'));
  if (hits.length === 0) process.exit(0);
  console.error(`Em dash (U+2014) found in ${r}. CLAUDE.md forbids em dashes in site text. Rewrite these lines with a comma, colon, period or parentheses:`);
  for (const h of hits.slice(0, 10)) console.error(`  line ${h.line}: ${h.text}`);
  process.exit(2);
} catch {
  process.exit(0);
}
