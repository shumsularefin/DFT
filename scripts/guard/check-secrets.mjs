// Rule (CLAUDE.md): never commit secrets or API keys.
// Firebase WEB config (apiKey etc.) is public by design but is still injected through
// build-time environment variables, so literal Google API keys are flagged here as well.
import path from 'node:path';
import { ROOT, walk, readText, rel, result } from './lib.mjs';

export const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['service account JSON', /"type"\s*:\s*"service_account"/],
  ['private_key field', /"private_key"\s*:\s*"/],
  ['Google API key (AIza...)', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Materials Project key assignment', /\b(?:MP_API_KEY|MAPI_KEY)\s*[=:]\s*['"]?[A-Za-z0-9]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];

const EXEMPT_DIRS = ['scripts/guard', 'docs/source-material'];

export default function run() {
  const problems = [];
  for (const file of walk(ROOT, { skip: EXEMPT_DIRS })) {
    const r = rel(file);
    const base = path.basename(file);
    if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
      problems.push(`${r}: environment file must not be committed (use .env.example with empty values)`);
      continue;
    }
    if (/service-?account.*\.json$/i.test(base)) {
      problems.push(`${r}: looks like a service account file`);
      continue;
    }
    const text = readText(file);
    if (text === null || text.length > 5_000_000) continue;
    for (const [label, re] of PATTERNS) {
      const m = re.exec(text);
      if (m) {
        const line = text.slice(0, m.index).split('\n').length;
        problems.push(`${r}:${line} matches secret pattern "${label}"`);
      }
    }
  }
  return result('no-secrets', problems);
}
