#!/usr/bin/env node
// Runs every guard check. Works without `npm install` (pure Node).
// Usage: node scripts/guard/run-all.mjs [--only name1,name2]
import emdash from './check-emdash.mjs';
import secrets from './check-secrets.mjs';
import potcar from './check-potcar.mjs';
import sources from './check-sources.mjs';
import docLinks from './check-doc-links.mjs';
import stages from './check-stages.mjs';
import refs from './check-refs.mjs';

const checks = { emdash, secrets, potcar, sources, 'doc-links': docLinks, stages, refs };
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : Object.keys(checks);

let failed = 0;
for (const key of only) {
  const check = checks[key];
  if (!check) {
    console.error(`unknown check "${key}"; available: ${Object.keys(checks).join(', ')}`);
    process.exit(2);
  }
  const res = check();
  if (res.ok) {
    console.log(`PASS  ${res.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${res.name}`);
    for (const p of res.problems.slice(0, 40)) console.log(`      - ${p}`);
    if (res.problems.length > 40) console.log(`      ... and ${res.problems.length - 40} more`);
  }
}
console.log(failed === 0 ? '\nAll guards passed.' : `\n${failed} guard(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
