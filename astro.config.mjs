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

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://example.invalid',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react(), mdx(), sitemap({ filter: (page) => !/\/(design|offline)\/$/.test(page) })],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, { output: 'mathml' }]],
    }),
  },
});
