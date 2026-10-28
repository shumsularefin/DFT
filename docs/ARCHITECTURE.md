# Architecture

Applies to every stage. Where a work order and this file disagree, the work order wins and the builder records the difference in `docs/DECISIONS.md`.

## 1. Shape of the system

Static site on Firebase Hosting. Astro prerenders all pages. React islands (labs and tools) hydrate on demand. All computation (parsing, geometry, symmetry, physics toys, adaptive engine) runs in the browser, heavy parts in Web Workers or WebAssembly, always lazily loaded. Optional Firebase Auth and Firestore are used only for progress sync, behind an explicit user action.

```
 browser
 ├─ prerendered HTML + tiny vanilla "chrome" (header, level, theme, progress, search)
 ├─ React islands: labs, tools            (lazy, per page)
 │    └─ Web Workers: parsing, meshing, symmetry (moyo wasm), marching cubes, toy solvers
 ├─ Three.js scene controllers            (lazy, after user action or when visible)
 ├─ localStorage (progress, prefs) / sessionStorage (tool hand-off)
 └─ optional: Firebase Auth + Firestore (progress sync only)
```

## 2. Repository layout

```
src/
  pages/              Astro routes (see section 4)
  layouts/            BaseLayout, HandbookLayout, ToolLayout
  components/
    ui/               design-system primitives (Astro, vanilla; React only when stateful)
    chrome/           header, nav, level/theme switch, progress bar, search (vanilla TS)
    handbook/         topic-anatomy components, <Level>, <Term>, <Cite>, VaspFile, Quiz
    labs/             lab islands (React) + LabShell
    tools/<tool>/     tool UIs (React islands), one folder per tool
  content/handbook/   MDX topics: <NN-module-slug>/<topic>.mdx   (content collection)
  lib/                PURE TypeScript domain logic, no DOM, no React, fully unit-tested
    crystal/ vasp/ perovskite/ chem/ physics/ learning/ mp/
    handoff.ts storage.ts site.ts
  workers/            thin worker entry points that call lib/
  stores/             zustand vanilla stores (level, theme, progress, learner)
  styles/             tokens.css, base.css, utilities
  data/               build-time JSON (each file under 100 KB): glossary, vasp tags, concept graph...
public/
  data/               lazy runtime datasets, version in the path (shannon/v1/, mp/<db-version>/)
  examples/           author-supplied example outputs (trimmed, no POTCAR)
  icons/ manifest.webmanifest robots.txt
scripts/
  guard/              repo guards (pure Node)
  reference/          Python generators for golden test data
  build/              post-build scripts (service worker, size check, sources->json)
  data/ mp/           data pipelines run by the author or a builder
tests/
  reference/          golden JSON (generated, never hand-edited)
  e2e/                Playwright
docs/                 process, decisions, reports, work orders
data/author/          raw author samples before trimming (see its README)
```

Rule: **`src/lib/` imports nothing from `src/components/`, `src/pages/`, React or the DOM.** Components import `lib/`, never the reverse. Tests live next to the code as `*.test.ts`.

## 3. Conventions

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any` in `src/lib/`. Prefer small pure functions and plain data. Immutable updates.
- Units live in the name when not obvious: `encutEv`, `kspacingInvA`, `volumeA3`, `energyEvPerAtom`. Lattices are 3x3 row-major arrays whose **rows are lattice vectors in Angstrom** (VASP POSCAR convention). Reciprocal lattices include the factor 2 pi, rows in 1/Angstrom. Fractional coordinates are `[number, number, number]`.
- Shared core types (defined in M3.1 in `src/lib/crystal/types.ts`, extended not redefined later):

```ts
export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];            // rows = lattice vectors, Angstrom
export interface Structure {
  readonly lattice: Mat3;
  readonly species: readonly string[];                      // one element symbol per site ('Ti')
  readonly labels?: readonly string[];                      // optional raw POSCAR label per site ('Ti_pv')
  readonly frac: readonly Vec3[];                           // fractional coordinates
  readonly comment?: string;
  readonly selective?: readonly (readonly [boolean, boolean, boolean])[];
}
```
- Every result type that depends on a heuristic carries `heuristic: true` and the UI shows the "Heuristic" badge.
- Errors: lib functions throw typed errors (`class ParseError extends Error { line?: number }`) or return `{ ok: false, issues }` for user-input validation; never `console.log` in lib.
- Randomness only through a seeded PRNG (`mulberry32`) passed in, so tests are deterministic.
- Accessibility: every canvas has a text alternative and a data table or description next to it; every control has an accessible name; focus is visible; no information by color alone.

## 4. Routes (all prerendered)

`/` landing · `/handbook/` map of modules · `/handbook/<module>/<topic>/` · `/tools/` index · `/tools/tolerance-factor/` · `/tools/input-builder/` · `/tools/convergence/` · `/tools/kpath/` · `/studio/` · `/builder/` · `/practice/` review queue · `/progress/` mastery map · `/errors/` error finder · `/references/` · `/changelog/` · `/about/` (method, disclaimer) · `/privacy/` · `/design/` (component gallery, `noindex`) · `/offline/` · `404`.
Trailing slash always (`trailingSlash: 'always'`).

## 5. Tool hand-off

`src/lib/handoff.ts` (created in M3.1, extended later):

```ts
export type ToolId = 'tolerance-factor' | 'input-builder' | 'convergence' | 'kpath' | 'studio' | 'builder';
export interface SiteSpec {                                  // one crystallographic site, possibly mixed
  readonly occupants: readonly { symbol: string; oxidation: number; cn: number; spin?: 'HS' | 'LS'; fraction: number }[];
}
export type Handoff =
  | { v: 1; kind: 'structure'; from: ToolId; structure: Structure; label?: string }
  | { v: 1; kind: 'composition'; from: ToolId; a: SiteSpec; b: SiteSpec; x: SiteSpec; label?: string }
  | { v: 1; kind: 'molecule'; from: ToolId; xyz: string; smiles?: string };
```
`sendHandoff(h, toUrl)` writes `sessionStorage['dft:handoff']` and navigates; the receiving tool calls `takeHandoff(kinds)` once on load, which reads and clears it. Payloads are validated on receipt (never trust storage). Small compositions may also travel in the URL fragment so links can be shared.

## 6. Data and versioning

- Build-time data in `src/data/*.json` (each under 100 KB), imported where used. Each file has a top-level `_meta` with `source` IDs, `generated`, `version`.
- Runtime datasets in `public/data/<name>/<version>/...`, fetched lazily, content-hashed or versioned by path, with a small `manifest.json` that is revalidated. The service worker uses stale-while-revalidate for them.
- Never ship user data anywhere. Files the user drops are parsed in the page and discarded.

## 7. npm script contract (created in M0.1, extended only by additive scripts)

| Script | What it does |
|---|---|
| `dev` | `astro dev` |
| `build` | `astro build` then `scripts/build/postbuild.mjs` (Pagefind index, service worker, sources JSON) |
| `preview` | `astro preview` |
| `format` / `format:check` | Prettier write / check |
| `lint` | ESLint |
| `typecheck` | `astro check` |
| `test` | `vitest run` |
| `test:e2e` | Playwright (builds first) |
| `guard` | `node --test scripts/guard/guard.test.mjs && node scripts/guard/run-all.mjs` |
| `lint:content` | content linter (from M1.2) |
| `size` | `node scripts/build/check-size.mjs` against `budgets.json` (from M0.2) |
| `lhci` | Lighthouse CI against `dist/` (from M0.2) |
| `verify` | `format:check`, `lint`, `typecheck`, `test`, `guard`, `build`, `size` (and `lint:content` once it exists) |

## 8. Performance budgets (gzip, enforced by `budgets.json` from M0.2)

Measured on the built `dist/`. React plus react-dom client measured **65.7 KB gzipped** in the spike, so a page with a React island starts there.

| Page class | Initial JavaScript | Notes |
|---|---|---|
| Content page (no island) | at most 15 KB | vanilla chrome only |
| Page with a lab or tool island | at most 200 KB | SPEC limit; React counts |
| Total CSS on any page | at most 30 KB | tokens plus page styles |
| Fonts on first view | at most 100 KB | latin subsets, 2 families |
| Lazy chunks | listed in `budgets.json` | three, moyo wasm 277 KB, RDKit 2.4 MB, datasets |

3D scene code, WebAssembly and datasets never load before a user action or visibility trigger. Every lazy asset has a loading state and an error state.

## 9. Security and privacy

- No secrets in the repo (guard). Firebase web config via `PUBLIC_FIREBASE_*` only (D-026).
- No analytics or third-party requests at runtime. No external fonts or CDNs.
- Content Security Policy is added in M11.2 (needs `wasm-unsafe-eval` and `worker-src blob:`); until then headers include `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Firestore rules: owner-only documents, shape and size validated; tested with the emulator (M6.5).
- File drops: size caps (default 25 MB), text decoding with fallback, parsing in a worker for anything over 1 MB, no `eval`, no HTML injection (render text with `textContent` or framework escaping).
