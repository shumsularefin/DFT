#!/usr/bin/env bash
# Regenerates src/components/studio/css/tailwind.css with Tailwind 3.4.17 (the version the Studio was written for).
# Needs network access to npm the first time. Run from the repository root. Utilities only: every rule is scoped
# under .studio-root and there is no preflight (D-105), so nothing here can restyle the site shell.
set -euo pipefail
printf '@tailwind utilities;\n' > /tmp/dft-studio-tw-in.css
npx --yes tailwindcss@3.4.17 -c scripts/studio/tailwind.config.cjs -i /tmp/dft-studio-tw-in.css \
  -o src/components/studio/css/tailwind.css --minify
