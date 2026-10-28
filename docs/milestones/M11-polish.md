# M11 Polish, audits and release preparation

These stages measure and fix; they add no new features. Each finishes with numbers in its report, not impressions.

## M11.1 Performance and offline audit

**Goal**: Every page class meets the budgets and Lighthouse targets with measured evidence, and the site works offline as designed.
**Depends on**: M10.5, M9.4, M7.6, M6.5
**Size**: M
**Deliverables**:
- A route inventory (`docs/reports/M11.1.md`) listing every route, its page class, initial JS, CSS, fonts, LCP element, and Lighthouse mobile scores (performance, accessibility, best practices, individual SEO audits), before and after fixes.
- Fixes: code splitting, lazy boundaries, font subsetting, image formats and sizes (`astro:assets` or pre-sized SVG), removal of unused CSS, preconnect/preload only where measured to help, worker usage for any task over 50 ms on the main thread.
- Spark transfer estimate: average bytes per first visit and per repeat visit (with the service worker) for the landing page, a handbook page, each tool, the Studio, the Builder in molecule mode; compared with the limits recorded in Q-006 (or with 360 MB/day if still open) as "visits per day before the limit".
- Offline: tests for the landing page, a visited handbook page, a visited tool, the Studio index; a clear offline banner.
- `budgets.json` final values; Lighthouse CI assertions remain `warn` here (M11.2 makes them errors after the accessibility fixes).
**Tasks**: 1. Build the route inventory with current numbers. 2. Fix the largest regressions first, re-measuring after each. 3. Offline tests. 4. Spark transfer estimate. 5. Final budgets.
**Tests and reference values**: the measurements above, reproducible with `npm run size` and `npx lhci autorun` (commands and environment recorded).
**Done when**:
- [ ] Every route at or above 95 for performance on mobile emulation or a recorded exception per D-023 (not below 90).
- [ ] The transfer estimate is in the report and in Q-006.
**Not in this stage**: accessibility and security fixes.

## M11.2 Accessibility and security audit

**Goal**: WCAG 2.2 AA across the site, zero axe violations, robust keyboard and screen-reader paths, and a Content Security Policy.
**Depends on**: M11.1
**Size**: M
**Deliverables**:
- Automated: axe on every route in light and dark themes and both viewport projects; Playwright checks for no horizontal scroll at 360 px on every route; 200 % zoom check on a sample of routes; reduced-motion check that no continuous animation runs.
- Manual (documented with steps and findings): keyboard-only walkthroughs of the Input Builder, the k-path tool, the tolerance explorer, the Studio, both Builder modes, practice; a screen-reader pass (NVDA or VoiceOver if available to the author; otherwise the builder documents the accessible names and roles and flags the pass as pending for the author).
- Content Security Policy in `firebase.json`: `default-src 'self'`; `script-src 'self'` plus the hashes of the inline head scripts (generated at build time) and `'wasm-unsafe-eval'`; `worker-src 'self' blob:`; `connect-src 'self'` plus the Firebase endpoints only when sync is configured; `img-src 'self' data: blob:`; `style-src 'self'` (and `'unsafe-inline'` only if Astro's scoped styles require it, with the reason recorded); `frame-ancestors 'none'`; `base-uri 'self'`. Verified with the hosting emulator and an e2e that fails on CSP violations (listen to `securitypolicyviolation`).
- Lighthouse CI assertions switched from `warn` to `error` for performance (or the D-023 floor), accessibility and best practices; SEO individual audits to `error` (the category stays off until M11.3).
**Tasks**: 1. Automated axe, scroll, zoom and reduced-motion suites over every route. 2. Fix findings. 3. Manual keyboard walkthroughs, documented. 4. CSP with build-time hashes, verified in the emulator and e2e. 5. Switch Lighthouse assertions to errors.
**Tests and reference values**: the automated suites above run in CI and pass.
**Done when**:
- [ ] Zero axe violations; CSP active with zero violations in e2e; CI asserts the Lighthouse thresholds as errors.
**Not in this stage**: content changes beyond accessibility fixes.

## M11.3 Content integrity and release preparation

**Goal**: The site is truthful and ready to be indexed: references complete, open questions triaged, disclaimers visible, and an audit package for the independent review.
**Depends on**: M11.2
**Size**: M
**Deliverables**:
- References page complete; every `S-nnn` used in the site appears with its honest status; any source still `cited-from-memory` that supports a user-visible number is either verified now (network permitting, Q-007) or the number carries a visible caveat.
- `docs/OPEN_QUESTIONS.md` triage: each open item marked as blocking release or not, with the user-visible effect described; nothing open may silently affect a displayed number.
- Changelog brought up to date; `/about/` disclaimer reviewed (heuristics, toy models, ML statement, data licences); link check with zero dead internal links.
- Glossary coverage: every term used before definition is linked; terms without a page are listed.
- `docs/AUDIT_PACKAGE.md` for the auditor (see `docs/VERIFICATION.md`): route list, test counts, golden-data coverage, Lighthouse table, open questions, known limitations, and the exact commands to reproduce everything.
- Indexing switch prepared but **not flipped**: `INDEXING_ENABLED`, `robots.txt` and the Lighthouse `categories:seo` / `is-crawlable` assertions change in one commit that the author merges only after the audit says go.
**Tasks**: 1. References and source statuses. 2. Open-question triage. 3. Disclaimer, changelog, glossary coverage, link check. 4. `docs/AUDIT_PACKAGE.md`. 5. Prepare the indexing commit on its own branch without merging it.
**Tests and reference values**: link checker, content lint, guards, full e2e; the report quotes their summary lines.
**Done when**:
- [ ] The audit package exists and every claim in it can be reproduced with the commands it lists.
- [ ] The indexing commit is ready on its own branch and documented, waiting for the author.
**Not in this stage**: flipping indexing on without the author's decision.
