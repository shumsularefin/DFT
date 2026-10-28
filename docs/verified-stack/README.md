# Verified stack (starter files)

These files were produced and exercised in a scratch spike on 2026-10-27 (build, unit test, `astro check`,
ESLint, Pagefind, Playwright with WebGL, axe-core, Lighthouse CI all ran), and a dry run of M0.1 built
a fresh project from these files alone (build, typecheck, lint, unit test, two-project Playwright smoke with axe). Stage M0.1 copies them
into place instead of inventing configuration. They are references, not live config: the `.reference`
suffix keeps them out of tooling.

| File | Becomes |
|---|---|
| `package.json.reference` | `package.json` dependency pins (add the `addLater` packages only when their stage starts) |
| `astro.config.mjs.reference` | `astro.config.mjs` |
| `eslint.config.js.reference` | `eslint.config.js` |
| `tsconfig.json.reference` | `tsconfig.json` |
| `playwright.config.ts.reference` | `playwright.config.ts` |
| `serve.mjs.reference` | `scripts/build/serve.mjs` (static server used by Playwright; `astro preview` daemonizes in Astro 7) |
| `moyo-node.reference.mjs` | not copied; the verified pattern for loading `@spglib/moyo-wasm` in Node tests (M5.1) |
| `lighthouserc.json.reference` | `lighthouserc.json` (M0.2). Every assertion starts as `warn`; M11.2 turns them into `error`. `categories:seo` and `is-crawlable` are `off` until M11.3 because pages are deliberately `noindex` (D-027); the other SEO audits are asserted one by one instead |

Why these exact versions, and what failed otherwise, is in `docs/DECISIONS.md` D-002.
Run Lighthouse CI in a cloud session with `CHROME_PATH=/opt/pw-browsers/chromium npx lhci autorun`.
