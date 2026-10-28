---
description: Run every verification gate and report honestly
---

Run, in this order, and report each result truthfully (a gate you could not run is "not run", never "passed"):

1. `node scripts/guard/run-all.mjs`
2. `node --test scripts/guard/guard.test.mjs`
3. `npm run verify` (skip with a note only if `package.json` does not exist yet)
4. If the current stage has UI: `npm run test:e2e`, then the Lighthouse command in `docs/WORKFLOW.md` section 4.

For every failure show the first relevant error lines, name the likely cause, and fix it if it is inside the current stage's scope. Do not weaken or skip tests to get a pass.
