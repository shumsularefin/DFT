#!/usr/bin/env bash
# Regenerates public/dft-studio/css/tailwind.css with Tailwind 3.4.17 (the version the Studio was written for).
# Needs network access to npm the first time. Run from the repository root.
set -euo pipefail
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > /tmp/dft-studio-tw-in.css
npx --yes tailwindcss@3.4.17 -c scripts/studio/tailwind.config.cjs -i /tmp/dft-studio-tw-in.css \
  -o public/dft-studio/css/tailwind.css --minify
