// Content linter for handbook topics (docs/CONTENT_GUIDE.md). `npm run lint:content`.
// Every message is one line: "<file>: <what is wrong and how to fix it>".
// Usage: node scripts/lint-content.mjs [rootDir]   (rootDir defaults to the repository root)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glossarySchema, handbookSchema, SECTIONS, SOURCE_ID } from '../src/lib/content-schema.mjs';
import { parseSources } from './build/sources-to-json.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const SECTION_COMPONENTS = SECTIONS.map(([c]) => c);
const SELF_CLOSING = new Set(['Lab', 'Check']);

/** Minimal front matter reader: `key: value`, inline arrays, booleans, numbers, quoted strings, `# comments`. */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: null, body: text, bodyStart: 0 };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]] = scalar(kv[2].trim());
  }
  return { data, body: text.slice(m[0].length), bodyStart: m[0].length };
}

function scalar(v) {
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => scalar(x.trim()));
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^(['"])(.*)\1$/, '$2');
}

/** Removes fenced code blocks and inline code so tags and `$` inside code are not linted as content. */
function stripCode(body) {
  return body
    .replace(/```[\s\S]*?```/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (s) => ' '.repeat(s.length));
}

/**
 * Lints one topic. ctx: { glossaryIds:Set, sourceIds:Set, topicRoutes:Set, seenIds:Map }.
 * Returns an array of one-line messages.
 */
export function lintTopic(file, text, ctx) {
  const out = [];
  const say = (msg) => out.push(`${file}: ${msg}`);

  if (text.includes(EM_DASH)) say('contains an em dash (U+2014); use a comma, colon, period or parentheses');

  const { data, body } = parseFrontMatter(text);
  if (!data) {
    say('missing front matter block (--- ... ---) at the top of the file');
    return out;
  }
  const parsed = handbookSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      say(`front matter "${issue.path.join('.') || '(root)'}": ${issue.message}`);
  } else {
    const fm = parsed.data;
    if (fm.status !== 'draft' && fm.sources.length === 0) {
      say(`status is "${fm.status}" but sources is empty; add at least one S-nnn id or set status: draft`);
    }
    const prev = ctx.seenIds.get(fm.id);
    if (prev) say(`front matter id "${fm.id}" is already used by ${prev}; ids must be unique`);
    else ctx.seenIds.set(fm.id, file);
    for (const s of fm.sources) {
      if (!ctx.sourceIds.has(s))
        say(`front matter sources lists ${s}, which is not in docs/SCIENCE_SOURCES.md`);
    }
  }

  const clean = stripCode(body);

  // Sections: presence and order of the nine anatomy components.
  const noLab = data.noLab === true;
  const found = [];
  for (const m of clean.matchAll(new RegExp(`^<(${SECTION_COMPONENTS.join('|')})[\\s>/]`, 'gm')))
    found.push(m[1]);
  let last = -1;
  for (const [component] of SECTIONS) {
    if (component === 'Lab' && noLab) continue;
    if (!found.includes(component))
      say(`missing section <${component}>; every topic needs all nine sections (Lab only if noLab: true)`);
  }
  for (const c of found) {
    const i = SECTION_COMPONENTS.indexOf(c);
    if (i < last) {
      say(`section <${c}> is out of order; required order is ${SECTION_COMPONENTS.join(', ')}`);
      break;
    }
    last = i;
  }
  for (const c of new Set(found)) {
    if (found.filter((x) => x === c).length > 1) say(`section <${c}> appears more than once`);
  }

  // Empty sections.
  for (const m of clean.matchAll(
    /<(Why|Intuition|TheMath|InVasp|WhatChanges|Mistakes|GoDeeper)>([\s\S]*?)<\/\1>/g,
  )) {
    if (m[2].replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim() === '')
      say(`section <${m[1]}> is empty; write something or remove it`);
  }
  for (const c of SELF_CLOSING) {
    const tag = new RegExp(`<${c}\\b([^>]*)/?>`).exec(clean);
    if (tag && c === 'Lab' && !/\bid=/.test(tag[1])) say('<Lab> needs an id prop naming the lab');
    if (tag && c === 'Check' && !/\bids=/.test(tag[1])) say('<Check> needs an ids prop listing question ids');
  }

  // Levels.
  for (const m of clean.matchAll(/<Level\b([^>]*)>/g)) {
    if (!/\b(min|max)=/.test(m[1])) say('<Level> needs a min or a max prop (beginner, intermediate or pro)');
    const bad = /\b(min|max)="([^"]*)"/.exec(m[1]);
    if (bad && !['beginner', 'intermediate', 'pro'].includes(bad[2]))
      say(`<Level ${bad[1]}="${bad[2]}"> is not a level; use beginner, intermediate or pro`);
  }

  // Terms and citations.
  for (const m of clean.matchAll(/<Term\s+id="([^"]+)"/g)) {
    if (!ctx.glossaryIds.has(m[1]))
      say(`<Term id="${m[1]}"> is not in src/data/glossary.json; add the term first`);
  }
  for (const m of clean.matchAll(/<Cite\s+id="([^"]+)"/g)) {
    if (!SOURCE_ID.test(m[1])) say(`<Cite id="${m[1]}"> is not an S-nnn id`);
    else if (!ctx.sourceIds.has(m[1])) say(`<Cite id="${m[1]}"> is not in docs/SCIENCE_SOURCES.md`);
  }

  // TODO markers.
  if (/\bTODO\b/.test(text.slice(text.indexOf('\n---') + 4)))
    say('contains an unresolved TODO; finish it or move it to docs/OPEN_QUESTIONS.md');

  // Math delimiters: `$$` must pair up, and so must single `$` once `$$` and escaped dollars are removed.
  const noDisplay = clean.replace(/\\\$/g, '');
  const display = (noDisplay.match(/\$\$/g) ?? []).length;
  if (display % 2 !== 0) say('unbalanced $$ math delimiters');
  const inline = (noDisplay.replace(/\$\$/g, '').match(/\$/g) ?? []).length;
  if (inline % 2 !== 0) say('unbalanced $ math delimiters (escape a literal dollar sign as \\$)');

  // Links into the handbook must reach an existing topic (or the handbook index).
  const links = [
    ...clean.matchAll(/\]\((\/handbook\/[^)#\s]*)/g),
    ...clean.matchAll(/href="(\/handbook\/[^"#]*)"/g),
  ];
  for (const m of links) {
    const route = m[1].endsWith('/') ? m[1] : m[1] + '/';
    if (route !== '/handbook/' && !ctx.topicRoutes.has(route))
      say(`link ${m[1]} does not match any topic; check the module folder and file name`);
  }
  return out;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.mdx') ? [p] : [];
  });
}

/** Lints the glossary and every topic under root/src/content/handbook. Returns { problems, topics }. */
export function lintAll(root) {
  const problems = [];
  const registerPath = path.join(root, 'docs', 'SCIENCE_SOURCES.md');
  const sourceIds = new Set(parseSources(fs.readFileSync(registerPath, 'utf8')).map((s) => s.id));

  const glossaryPath = path.join(root, 'src', 'data', 'glossary.json');
  const glossaryIds = new Set();
  if (fs.existsSync(glossaryPath)) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    } catch (e) {
      problems.push(`src/data/glossary.json: not valid JSON (${e.message})`);
    }
    if (json) {
      const g = glossarySchema.safeParse(json);
      if (!g.success)
        for (const i of g.error.issues)
          problems.push(`src/data/glossary.json: entry ${i.path.join('.')}: ${i.message}`);
      for (const t of Array.isArray(json) ? json : []) {
        if (glossaryIds.has(t.id)) problems.push(`src/data/glossary.json: duplicate term id "${t.id}"`);
        glossaryIds.add(t.id);
        for (const s of t.sources ?? [])
          if (!sourceIds.has(s))
            problems.push(`src/data/glossary.json: term "${t.id}" cites ${s}, which is not in the register`);
        if (JSON.stringify(t).includes(EM_DASH))
          problems.push(`src/data/glossary.json: term "${t.id}" contains an em dash`);
      }
    }
  }

  const base = path.join(root, 'src', 'content', 'handbook');
  const files = walk(base).sort();
  const topicRoutes = new Set(
    files.map(
      (f) =>
        '/handbook/' +
        path
          .relative(base, f)
          .replace(/\.mdx$/, '')
          .split(path.sep)
          .join('/') +
        '/',
    ),
  );
  const ctx = { glossaryIds, sourceIds, topicRoutes, seenIds: new Map() };
  for (const f of files) {
    problems.push(
      ...lintTopic(path.relative(root, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8'), ctx),
    );
  }
  return { problems, topics: files.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = path.resolve(process.argv[2] ?? '.');
  const { problems, topics } = lintAll(root);
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\nlint:content found ${problems.length} problem(s) in ${topics} topic(s)`);
    process.exit(1);
  }
  console.log(`lint:content OK (${topics} topic(s))`);
}
