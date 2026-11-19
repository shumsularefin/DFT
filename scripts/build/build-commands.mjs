// Builds the command palette index: pages, tools, handbook topics, VASP tags and glossary terms.
// Output: public/data/commands/commands.v1.json (versioned name; the palette fetches it on first open).
// Run by `npm run build` and `npm run dev` (predev). Usage: node scripts/build/build-commands.mjs [outFile]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const INDEX_VERSION = 1;

/** Static routes. Each must exist in src/pages (checked below), so the palette cannot point at a missing page. */
export const PAGES = [
  ['/', 'Home', 'Pages', ['start', 'landing']],
  ['/handbook/', 'Handbook', 'Pages', ['learn', 'topics', 'modules', 'read']],
  ['/tools/', 'All tools', 'Pages', ['tools']],
  ['/glossary/', 'Glossary', 'Pages', ['terms', 'definitions']],
  ['/references/', 'References', 'Pages', ['sources', 'citations', 'bibliography']],
  ['/about/', 'About', 'Pages', ['author', 'project']],
  ['/privacy/', 'Privacy', 'Pages', ['data', 'storage', 'uploads']],
  ['/changelog/', 'Changelog', 'Pages', ['news', 'versions', 'releases']],
  [
    '/tools/input-builder/',
    'Input builder',
    'Tools',
    ['incar', 'kpoints', 'poscar', 'vasp', 'inputs', 'prepare'],
  ],
  ['/tools/convergence/', 'Convergence plotter', 'Tools', ['encut', 'kpoints', 'converge', 'energy', 'plot']],
  [
    '/tools/kpath/',
    'Brillouin zone and k-path',
    'Tools',
    ['kpath', 'bands', 'bandstructure', 'hpkot', 'zone'],
  ],
  [
    '/tools/eos/',
    'Equation of state fit',
    'Tools',
    ['eos', 'birch', 'murnaghan', 'bulk', 'modulus', 'lattice', 'volume'],
  ],
];

/** Reads `key: value` lines from the front matter block of an MDX file. Enough for id, title, module. */
export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function buildIndex(root = '.') {
  const commands = [];
  const pageExists = (href) => {
    const rel = href === '/' ? 'index' : href.replace(/^\/|\/$/g, '');
    return (
      ['.astro', '.ts'].some((ext) => fs.existsSync(path.join(root, 'src/pages', rel + ext))) ||
      fs.existsSync(path.join(root, 'src/pages', rel, 'index.astro'))
    );
  };
  for (const [href, title, group, keywords] of PAGES) {
    if (!pageExists(href)) throw new Error(`build-commands: no page for ${href}`);
    commands.push({ id: `route:${href}`, title, group, keywords, href });
  }
  const topicDir = path.join(root, 'src/content/handbook');
  for (const file of walk(topicDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()) {
    const fm = frontMatter(fs.readFileSync(file, 'utf8'));
    // Same split as src/lib/topic.ts splitId: the first path segment is the module, the rest is the topic.
    const rel = path
      .relative(topicDir, file)
      .replace(/\\/g, '/')
      .replace(/\.mdx$/, '');
    const [module, ...rest] = rel.split('/');
    const topic = fm.id || rest.join('/');
    if (!fm.title) throw new Error(`build-commands: ${rel} has no title`);
    commands.push({
      id: `topic:${rel}`,
      title: fm.title,
      group: 'Handbook',
      keywords: [fm.module ? `module ${fm.module}` : 'topic'],
      href: `/handbook/${module}/${rest.length ? rest.join('/') : topic}/`,
    });
  }
  const tags = JSON.parse(fs.readFileSync(path.join(root, 'src/data/vasp-tags.json'), 'utf8')).tags;
  for (const t of tags) {
    commands.push({
      id: `tag:${t.name}`,
      title: `${t.name}: ${t.summary.beginner
        .split(/(?<=\.)\s/)[0]
        .replace(/\.$/, '')
        .slice(0, 70)}`,
      group: 'Tags',
      keywords: [t.name, 'incar', 'tag', t.group],
      href: `/tools/input-builder/?tag=${encodeURIComponent(t.name)}`,
    });
  }
  const terms = JSON.parse(fs.readFileSync(path.join(root, 'src/data/glossary.json'), 'utf8'));
  for (const g of terms) {
    commands.push({
      id: `term:${g.id}`,
      title: g.label,
      group: 'Terms',
      keywords: ['glossary'],
      href: `/glossary/#${g.id}`,
    });
  }
  return { version: INDEX_VERSION, commands };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2] ?? 'public/data/commands/commands.v1.json';
  const index = buildIndex();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(index));
  console.log(`build-commands: ${index.commands.length} commands -> ${out}`);
}
