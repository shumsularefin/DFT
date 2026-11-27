// VERIFIED 2026-10-27 (spike). Astro 7: remark/rehype plugins go through unified() from
// @astrojs/markdown-remark; passing them directly under `markdown` is deprecated.
// KaTeX is rendered at build time as MathML (no client JS, no KaTeX CSS, no math fonts).
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The Material Builder's scripts in public/dft-studio have no hash in their names, so a browser can keep an
// old vesta.js next to a new three.js chunk. boot.ts adds this hash of all of them to each script's URL.
function studioVersion(dir = 'public/dft-studio') {
  const hash = createHash('sha256');
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((e) => {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else hash.update(p).update(readFileSync(p));
      });
  walk(dir);
  return hash.digest('hex').slice(0, 12);
}

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://example.invalid',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react(), mdx(), sitemap({ filter: (page) => !/\/(design|offline)\/$/.test(page) })],
  vite: { define: { __STUDIO_VERSION__: JSON.stringify(studioVersion()) } },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, { output: 'mathml' }]],
    }),
  },
});
