# M0 Scaffold, CI and first deploy

Template reminder: every stage lists Goal, Depends on, Size, Deliverables, Tasks, Tests and reference values, Done when, Not in this stage. Protocol: `docs/WORKFLOW.md`.

## M0.1 Scaffold the project

**Goal**: A buildable, linted, tested Astro 7 + React + MDX + TypeScript project on the pinned stack, with the full `npm run` script contract, so every later stage starts from a green baseline.
**Depends on**: none
**Size**: M
**Deliverables**:
- `package.json` with exact pins, `package-lock.json`, `.nvmrc` already present (22), `engines.node >=22.12.0`.
- `astro.config.mjs`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `playwright.config.ts`, all from `docs/verified-stack/*.reference` (copy, then adapt only what is stated below).
- `src/pages/index.astro` (placeholder landing: site name, one sentence, link to nothing yet), `src/pages/404.astro`, `src/layouts/BaseLayout.astro` (html lang, meta viewport, title/description props, `noindex` meta, canonical, skip link, `<main id="main">`), `public/robots.txt` (`User-agent: *` and `Disallow: /`), `src/lib/site.ts` (name, tagline, version), `src/lib/storage.ts` (versioned safe localStorage wrapper, used later), `src/lib/storage.test.ts` (the first real unit test; no placeholder tests).
- npm scripts exactly as in `docs/ARCHITECTURE.md` section 7 (`size` and `lhci` are added in M0.2; `lint:content` in M1.2; for now `verify` runs format:check, lint, typecheck, test, guard, build). `guard` runs `node --test scripts/guard/guard.test.mjs && node scripts/guard/run-all.mjs`.
- `scripts/build/serve.mjs` copied from `docs/verified-stack/serve.mjs.reference` (Playwright's web server; Astro 7's `astro preview` daemonizes when not attached to a terminal, which Playwright reports as "exited early").
- `scripts/build/postbuild.mjs` (runs Pagefind over `dist/` only if pages carry `data-pagefind-body`, otherwise skips quietly; service worker is added in M0.2).
- `tests/e2e/smoke.spec.ts`: home loads, has one `h1`, `main` landmark, no console errors, passes axe with zero violations, no horizontal scroll at 360 px.
- `THIRD_PARTY_NOTICES.md` kept as is. The root `README.md` already exists (written during planning): do not rewrite it; append a "Development" section listing the npm scripts.
**Tasks**:
1. Start-up checklist (`docs/WORKFLOW.md` section 2). On a repo without `package.json` use `npm install` once, then commit the lockfile.
2. Create `package.json` from `docs/verified-stack/package.json.reference`: take `dependencies` and `devDependencies` as written, drop the `_comment` and `addLater` keys, add `"type": "module"`, `"private": true`, the scripts, `engines`. Install with `npm install --save-exact` semantics so the lockfile matches the pins. Do not add anything from `addLater` yet.
3. Copy the reference configs into place. Adapt: `site` comes from `PUBLIC_SITE_URL`; add `@` path alias in tsconfig and vitest; **Vitest must include only `src/**/*.test.{ts,tsx}` and `scripts/build/**/*.test.ts`** (its default pattern also matches `*.spec.ts`, which would pull in the Playwright tests in `tests/e2e/`, and `scripts/guard/guard.test.mjs`, which uses `node:test`); Prettier config `singleQuote: true`, `printWidth: 110`, `plugins: ['prettier-plugin-astro']`; run `npm run format` once.
4. Playwright: use the reference config; in cloud sessions set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. If `npx playwright install` is needed on CI it is handled by the workflow (already written).
5. Write `BaseLayout.astro` with the meta tags above. Add `<meta name="robots" content="noindex">` (D-027). No external fonts or scripts. Keep CSS in one small global stylesheet for now (M1.1 replaces it).
6. Write `src/lib/storage.ts`: `getJSON(key, fallback)`, `setJSON(key, value)`, `remove(key)`, all try/catch, namespaced `dft:`, versioned envelope `{ v: number, data }`, returns the fallback when storage throws or the version mismatches. Test it with an in-memory fake and a throwing fake.
7. Write the smoke e2e test and make it pass at the `mobile-360` and `desktop` projects.
8. Run `npm run verify` and `npm run test:e2e`. Record bundle sizes of `dist/_astro/*` (gzip) in the report.
9. Add the "Development" section to the root `README.md`.
10. Report, progress, push, PR.
**Tests and reference values**:
- `storage.test.ts`: round trip; version mismatch returns fallback; throwing storage returns fallback without throwing; keys are namespaced.
- Smoke e2e as above. Reference values: none (no science in this stage).
**Done when**:
- [ ] `npm ci && npm run verify` passes on a clean clone; `npm run test:e2e` passes; `npx vitest run` does not collect anything from `tests/e2e/` or `scripts/guard/`.
- [ ] `dist/` contains `index.html`, `404.html`, `robots.txt`; the page has no JavaScript at all (check `dist/index.html` for `<script`; zero is expected).
- [ ] `node scripts/guard/run-all.mjs` passes.
- [ ] Versions in `package.json` equal the reference pins exactly (diff them in the report).
- [ ] CI is green on the pull request (the `verify` and `e2e` jobs now run because `package.json` exists).
**Not in this stage**: design tokens, fonts, components, content collections, service worker, Lighthouse, Firebase deploy, any science.

## M0.2 Hosting, CI/CD, budgets and first deploy

**Goal**: The build is deployable to Firebase Hosting with correct caching, a service worker and size budgets enforced, and a preview/live deploy works once the author has set the two GitHub values.
**Depends on**: M0.1
**Size**: M
**Deliverables**:
- Verified `firebase.json` (already in the repo) and `.firebaserc` instructions; a local hosting emulator check script `scripts/build/check-headers.mjs` (see Tasks).
- `scripts/build/sw.mjs` (workbox-build `generateSW`), service worker registration in `BaseLayout` (production only, after load), `public/manifest.webmanifest`, icons generated by `scripts/build/make-icons.mjs` from an SVG (192, 512, maskable, favicon), `src/pages/offline.astro`.
- `budgets.json` and `scripts/build/check-size.mjs`; `npm run size`.
- `lighthouserc.json` from the reference (assertions as `warn`), `npm run lhci`.
- Updated `docs/SETUP_FIREBASE.md` only if reality differed.
**Tasks**:
1. Read `docs/SETUP_FIREBASE.md` and the three workflow files. Review them by eye (do not add a YAML dependency just for this; GitHub parses them when the PR opens). If a workflow run reports that an action version does not exist, bump to the newest existing major version and note it in the report.
2. Service worker (D-010): precache `/`, `/offline/`, `404.html` and the critical `/_astro/*` CSS/JS of those pages; runtime caching: `/_astro/**` CacheFirst (1 year, max 200 entries), `/data/**` StaleWhileRevalidate, `/pagefind/**` StaleWhileRevalidate, navigations NetworkFirst with a 3 s timeout falling back to `/offline/` (in `generateSW` use a `runtimeCaching` entry with `urlPattern: ({request}) => request.mode === 'navigate'`, `handler: 'NetworkFirst'` and `options.precacheFallback.fallbackURL: '/offline/'`; do not use `navigateFallback`, which would serve one page for every route); `skipWaiting` + `clientsClaim`; never precache `.wasm` or datasets. Register in production only; skip registration when `navigator.serviceWorker` is absent.
3. Manifest: name from `site.ts`, `display: standalone`, theme and background colors (placeholders until M1.1), icons. Link it in `BaseLayout`.
4. Budgets (`budgets.json`): per page class initial JS gzip, total CSS gzip, as in `docs/ARCHITECTURE.md` section 8; plus named lazy-chunk caps added by later stages. `check-size.mjs` reads `dist/`, gzips each referenced asset, groups pages by a `data-page-class` attribute on `<html>` (`content`, `island`, `tool`; add a `pageClass` prop to `BaseLayout`, default `content`, and fail the check for any page without it), prints a table, exits 1 on violation.
5. Headers check: run `npx -y firebase-tools@15.34.1 emulators:start --only hosting` (a dummy `projectId` via `--project demo-dft` avoids login), then `curl -sI` the root, a clean-URL page such as `/design/` (Firebase matches header rules against the request path, so a page requested without `.html` must still get `max-age=0, must-revalidate` through the `**/!(*.*)` rule), a hashed `/_astro/` file, a `.wasm` file if any, `/sw.js`, a 404 path, and assert the `Cache-Control` values from `firebase.json`, that `/about` style URLs redirect to the trailing-slash form, and that a missing page returns the custom 404. Put the assertions in `scripts/build/check-headers.mjs` so they can be re-run. If the emulator cannot start in the sandbox, record that and verify the same properties by reading `firebase.json` against the rules in the Firebase Hosting docs (Q-007 may be needed).
6. Lighthouse: `CHROME_PATH=/opt/pw-browsers/chromium npx lhci autorun` on the landing page. Record the four scores. (Everything is `warn` for now.)
7. Add `PUBLIC_SITE_URL` handling to the build and sitemap if not yet present. Keep `noindex`.
8. Push and open the PR. If `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` are set in the repo, confirm the preview workflow posts a preview URL on the PR and write the URL in the report; if not set, write "preview not run: author has not set the secret/variable (Q-015)" and mark that single item as pending for the author, not as a failure.
**Tests and reference values**:
- `check-size.mjs` has a unit test with a fake `dist/` fixture (pass and fail cases).
- Headers assertions as above. No science.
**Done when**:
- [ ] `npm run verify` now includes `size` and passes; budgets file exists.
- [ ] `dist/sw.js` exists, registers, and an offline reload of the landing page works in the Playwright test (`context.setOffline(true)`).
- [ ] `lighthouserc.json` committed; Lighthouse scores recorded for the landing page.
- [ ] Header assertions pass (or the exact reason they could not run is written down).
- [ ] The author's remaining manual steps (secrets, `.firebaserc`) are listed under "For the author" in the report.
**Not in this stage**: CSP, real design, content, datasets, analytics (there will be none).
