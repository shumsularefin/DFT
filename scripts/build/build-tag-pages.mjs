// Builds src/data/tag-pages.json: for each INCAR tag, the handbook topics whose front matter lists it in
// vaspTags (D-125). The Input Builder tag card links to them. A topic ranks higher the earlier the tag
// stands in its list (authors put a topic's main tags first), then the fewer tags it lists. Each tag keeps
// at most MAX_PAGES topics. The site tour in 00-start is left out, since its INCAR is only a format example.
// Run by `npm run build`. Usage: node scripts/build/build-tag-pages.mjs [outFile]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontMatter } from './build-commands.mjs';

export const MAX_PAGES = 3;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Parses a front matter list written as `[A, B, C]`. */
export function parseList(value) {
  const m = /^\[(.*)\]$/.exec((value ?? '').trim());
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function buildTagPages(root = '.') {
  const topicDir = path.join(root, 'src/content/handbook');
  const topics = walk(topicDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((file) => {
      const fm = frontMatter(fs.readFileSync(file, 'utf8'));
      // Same href as build-commands.mjs: the first path segment is the module folder, the rest is the topic.
      const rel = path
        .relative(topicDir, file)
        .replace(/\\/g, '/')
        .replace(/\.mdx$/, '');
      const [module, ...rest] = rel.split('/');
      const topic = rest.length ? rest.join('/') : fm.id;
      if (!fm.title) throw new Error(`build-tag-pages: ${rel} has no title`);
      return { module, href: `/handbook/${module}/${topic}/`, title: fm.title, tags: parseList(fm.vaspTags) };
    })
    .filter((t) => t.module !== '00-start');
  const byTag = {};
  for (const t of topics) {
    t.tags.forEach((tag, rank) => (byTag[tag] ??= []).push({ rank, count: t.tags.length, t }));
  }
  // Array.prototype.sort is stable, so ties keep the folder order (module, then file name).
  return Object.fromEntries(
    Object.keys(byTag)
      .sort()
      .map((tag) => [
        tag,
        byTag[tag]
          .sort((a, b) => a.rank - b.rank || a.count - b.count)
          .slice(0, MAX_PAGES)
          .map(({ t }) => ({ href: t.href, title: t.title })),
      ]),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2] ?? 'src/data/tag-pages.json';
  const pages = buildTagPages();
  fs.writeFileSync(out, JSON.stringify(pages, null, 2) + '\n');
  console.log(`build-tag-pages: ${Object.keys(pages).length} tags -> ${out}`);
}
