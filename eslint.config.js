// VERIFIED 2026-10-27 (spike): ESLint 10 + typescript-eslint 8.72 + eslint-plugin-astro 3.2.
// eslint-plugin-jsx-a11y is NOT used: it does not support ESLint 10. Accessibility is enforced with
// axe-core in Playwright instead (docs/DECISIONS.md D-002).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'public/pagefind/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.lighthouseci/',
      'docs/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  // Node globals for config files and build scripts (VERIFIED 2026-10-27: without this, ESLint reports
  // "'process' is not defined" in astro.config.mjs). Declared inline so no extra package is needed.
  {
    files: ['*.config.{js,mjs,ts}', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
];
