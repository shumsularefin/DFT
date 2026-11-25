# Audit package (M11.3)

Prepared for the independent reviewer following [`docs/VERIFICATION.md`](VERIFICATION.md). Every metric below can be reproduced directly from `main` using the commands in section 7.

## 1. Repository & build inventory

- **Static routes built**: 102 pages (`npm run build`), zero broken internal links (`npm run links`).
- **Handbook content**: 65 topics across all 11 modules (`npm run lint:content` passes), 88 published concepts, and 316 visual practice questions (`npm run lint:questions` passes).
- **Search index**: Pagefind indexes 65 content pages and 4,963 words; command palette indexes 266 commands (`public/data/commands/commands.v1.json`).
- **Science sources**: 69 sources registered in `docs/SCIENCE_SOURCES.md` and compiled to `src/data/sources.json`, surfaced on `/references/` with honest status labels (`verified`, `cross-checked`, `cited-from-memory`).
- **Top-level tool routes**: `/tools/`, `/tools/input-builder/`, `/tools/convergence/`, `/tools/kpath/`, `/tools/magnetic/`, `/tools/eos/`, `/tools/tolerance/`, `/tools/review/`, `/tools/density/`, `/tools/planner/`, `/studio/`, `/builder/`, `/errors/`, `/learn/`, `/practice/`, `/progress/`.

## 2. Automated verification summary

| Gate | Command | Result |
| --- | --- | --- |
| Format | `npm run format:check` | PASS |
| Lint | `npm run lint` | PASS (0 errors) |
| Typecheck | `npm run typecheck` | PASS (574 files, 0 errors, 0 warnings) |
| Unit tests | `npm test` | PASS (132 files, 1,927 passed, 1 skipped, 8 todo) |
| Guards | `npm run guard` | PASS (8/8 guard unit tests; 8/8 repo guards: `no-em-dash`, `no-secrets`, `no-potcar`, `sources-registered`, `doc-links`, `stages`, `q-and-d-references`, `recipes`) |
| Content & questions | `npm run lint:content && npm run lint:questions` | PASS (65 topics, 88 concepts, 316 questions) |
| Build & links | `npm run build && npm run links` | PASS (102 routes, 0 dead internal links) |
| Size budgets | `npm run size` | PASS (all 102 routes within `budgets.json`; lazy chunks within caps) |
| Contrast | `npm run contrast` | PASS (46/46 light and dark token pairs meet WCAG 2.2 AA) |

## 3. Performance, bundle sizes & security

- **Route budgets (`docs/reports/M11.1.md`)**:
  - Content pages: 5.29 KB / 15 KB gzipped JS.
  - Island pages: 76.75 to 162.55 KB / 200 KB gzipped JS.
  - Tool pages: 79.45 to 149.26 KB / 200 KB gzipped JS.
  - CSS across all routes: 3.34 to 10.19 KB / 30 KB gzipped.
  - Lazy chunks: `three` 136.8 / 150 KB, `moyo` 276.2 / 300 KB, `firebase` 56.1 / 80 KB, `rdkit` 2,391.3 / 2,500 KB.
- **Spark transfer ceiling (`Q-006`)**: Against the conservative 360 MB/day floor, cold visits support ~26,000 landing visits/day, ~2,700 handbook visits/day, or ~140 Molecule-mode RDKit visits/day; repeat visits serve static assets from the Service Worker cache.
- **Security & accessibility (`docs/reports/M11.2.md`)**:
  - Content Security Policy active in `firebase.json` (`default-src 'self'`, `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `frame-ancestors 'none'`, `base-uri 'self'`) with `tests/e2e/a11y-csp.spec.ts` verifying zero CSP violations, zero axe violations, and zero horizontal overflow at 360 px.
  - `lighthouserc.json` enforces `"error"` thresholds (`>= 0.95`) for performance, accessibility, best practices, and individual SEO audits.

## 4. Golden reference coverage

All scientific libraries are tested against independent Python reference datasets under `tests/reference/`:
- Perovskite tolerance factors (`t`, `mu`, Bartel `tau`) and Shannon radii (`perovskite_reference.json`, `element_reference.json`).
- Brillouin zones, HPKOT (29 variants), and Setyawan-Curtarolo (23 variants) k-paths (`bz_reference.json`, `kpath_reference.json`, `pw_kmesh_reference.json`).
- Crystal symmetry, CIF parsing, slabs, polarity, and defects (`cif/`, `structure_tools_reference.json`).
- Magnetic supercells and orderings (`magnetic_reference.json`).
- Equations of state (Birch-Murnaghan and Murnaghan) (`eos_reference.json`).
- 1D self-consistent field toy solver (`scf1d_reference.json`).

## 5. Open questions triage & author-pending items

See the Release Triage section at the top of [`docs/OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md). Nothing open silently alters a displayed number; every unverified or heuristic figure carries an explicit caveat or badge in the UI.

**Blocking before flipping public search indexing (`chore/enable-indexing`):**
1. **Q-001**: Choose and commit repository `LICENSE` (code and text).
2. **Q-008**: Supply trimmed, POTCAR-free author VASP outputs in `data/author/` to populate Module 10 (`RCuO3`) results (currently marked `"Results pending: author data not yet supplied"`).
3. **Q-009**: Run `scripts/mp/fetch.py` + `build_shards.py` with the author's Materials Project API key and confirm attribution/licence text (`deploy.yml` already blocks synthetic sample data from live hosting).
4. **M11.2 manual pass**: Complete an NVDA or VoiceOver screen-reader pass on the interactive tools.
5. **Q-020 / Q-022 / Q-023 / Q-024 / Q-026**: Human review of draft prose/glossary entries before upgrading topic `status` from `draft` to `verified`.

## 6. Indexing switch (prepared, not merged)

Per D-027 and M11.3, `main` keeps `INDEXING_ENABLED = false` in `src/lib/site.ts` and `"categories:seo": "off"`, `"is-crawlable": "off"` in `lighthouserc.json`.

A single-commit branch `chore/enable-indexing` is pushed to `origin` (unmerged) that:
1. Sets `INDEXING_ENABLED = true` in `src/lib/site.ts` (enabling `Allow: /` + sitemap in `/robots.txt` and removing `noindex`).
2. Switches `"categories:seo": ["error", { "minScore": 0.95 }]` and `"is-crawlable": "error"` in `lighthouserc.json`.

Merge `chore/enable-indexing` only after the independent audit and the author-pending items above are signed off.

## 7. Exact reproduction commands

```bash
npm ci
npm run verify
npm run links
npm run size
npm run contrast
npm run test:e2e
```
