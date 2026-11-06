// Lints the concept graph and the question bank (M6.1). Wired into `npm run lint:content`.
// Usage: node scripts/lint-questions.mjs [root] [--report]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSources } from './build/sources-to-json.mjs';
import { parseFrontMatter } from './lint-content.mjs';

const EM_DASH = '—';
export const MIN_PER_CONCEPT = 4;
export const MIN_HINTS = 2;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.mdx') ? [p] : [];
  });
}

/** Returns { problems, coverage } where coverage maps module -> [{ id, count }] for published concepts. */
export function lintQuestions(root) {
  const problems = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const sourceIds = new Set(
    parseSources(fs.readFileSync(path.join(root, 'docs', 'SCIENCE_SOURCES.md'), 'utf8')).map((s) => s.id),
  );

  // Concept graph (the full validation with cycle path lives in src/lib/learning/graph.ts and its tests).
  const conceptsPath = path.join(root, 'src', 'data', 'concepts.json');
  const concepts = JSON.parse(fs.readFileSync(conceptsPath, 'utf8'));
  const conceptById = new Map();
  for (const c of concepts) {
    if (conceptById.has(c.id)) problems.push(`concepts.json: duplicate concept id "${c.id}"`);
    conceptById.set(c.id, c);
    if (JSON.stringify(c).includes(EM_DASH)) problems.push(`concepts.json: "${c.id}" contains an em dash`);
  }
  for (const c of concepts)
    for (const p of c.prerequisites ?? [])
      if (!conceptById.has(p)) problems.push(`concepts.json: "${c.id}" has unknown prerequisite "${p}"`);

  // Questions.
  const qdir = path.join(root, 'src', 'data', 'questions');
  const questions = new Map();
  for (const f of fs
    .readdirSync(qdir)
    .filter((n) => /^module-\d+\.json$/.test(n))
    .sort()) {
    const file = rel(path.join(qdir, f));
    let list;
    try {
      list = JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8'));
    } catch (e) {
      problems.push(`${file}: not valid JSON (${e.message})`);
      continue;
    }
    for (const q of list) {
      const at = `${file}: ${q.id}`;
      if (questions.has(q.id))
        problems.push(`${at}: duplicate question id (also in ${questions.get(q.id).file})`);
      questions.set(q.id, { ...q, file });
      if (JSON.stringify(q).includes(EM_DASH)) problems.push(`${at}: contains an em dash`);
      if (!Array.isArray(q.concepts) || q.concepts.length === 0) problems.push(`${at}: no concepts`);
      for (const k of q.concepts ?? [])
        if (!conceptById.has(k)) problems.push(`${at}: concept "${k}" is not in concepts.json`);
      for (const s of q.sources ?? [])
        if (!sourceIds.has(s)) problems.push(`${at}: source ${s} is not in docs/SCIENCE_SOURCES.md`);
      if ((q.hints?.length ?? 0) < MIN_HINTS) problems.push(`${at}: needs at least ${MIN_HINTS} hints`);
      if (q.timeLimitSec !== undefined) problems.push(`${at}: timeLimitSec is not allowed (no timers)`);
      if (q.type === 'single' || q.type === 'multi') {
        for (const [i, o] of (q.options ?? []).entries())
          if (!o.why || !String(o.why).trim()) problems.push(`${at}: option ${i + 1} has no "why"`);
        const right = (q.options ?? []).filter((o) => o.correct).length;
        if (q.type === 'single' && right !== 1)
          problems.push(`${at}: single needs exactly one correct option`);
        if (q.type === 'multi' && right < 1) problems.push(`${at}: multi needs a correct option`);
      } else if (q.type === 'numeric') {
        if (typeof q.answer !== 'number') problems.push(`${at}: numeric needs an answer`);
        if (typeof q.tolerance !== 'number' || q.tolerance < 0)
          problems.push(`${at}: numeric needs a tolerance`);
      } else if (q.type === 'order') {
        if (!Array.isArray(q.items) || q.items.length < 2) problems.push(`${at}: order needs items`);
      } else problems.push(`${at}: unknown type "${q.type}"`);
    }
  }

  // Topics: <Check ids> and front matter concepts.
  for (const f of walk(path.join(root, 'src', 'content', 'handbook')).sort()) {
    const text = fs.readFileSync(f, 'utf8');
    const { data } = parseFrontMatter(text);
    for (const k of data?.concepts ?? [])
      if (!conceptById.has(k))
        problems.push(`${rel(f)}: front matter concept "${k}" is not in concepts.json`);
    for (const m of text.matchAll(/<Check\s+ids=\{\[([^\]]*)\]\}/g))
      for (const id of m[1].matchAll(/['"]([^'"]+)['"]/g))
        if (!questions.has(id[1])) problems.push(`${rel(f)}: <Check> id "${id[1]}" has no question`);
  }

  // Coverage: at least MIN_PER_CONCEPT questions per published concept.
  // Module 0 concepts are site orientation and carry no assessed content.
  const counts = new Map();
  for (const q of questions.values())
    for (const k of q.concepts ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  const coverage = {};
  for (const c of concepts) {
    if (c.status === 'planned' || c.module < 1) continue;
    const count = counts.get(c.id) ?? 0;
    (coverage[c.module] ??= []).push({ id: c.id, count });
    if (count < MIN_PER_CONCEPT)
      problems.push(
        `concept "${c.id}" (module ${c.module}) has ${count} question(s), needs ${MIN_PER_CONCEPT}`,
      );
  }
  return { problems, coverage, questions: questions.size, concepts: concepts.length };
}

export function coverageTable(coverage) {
  const lines = ['| Module | Concept | Questions |', '| --- | --- | --- |'];
  for (const [m, list] of Object.entries(coverage))
    for (const { id, count } of list) lines.push(`| ${m} | ${id} | ${count} |`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
  const { problems, coverage, questions, concepts } = lintQuestions(root);
  if (args.includes('--report')) {
    for (const [m, list] of Object.entries(coverage)) {
      const total = list.reduce((s, x) => s + x.count, 0);
      console.log(
        `module ${m}: ${list.length} concept(s), ${total} question(s), min ${Math.min(...list.map((x) => x.count))}`,
      );
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\nlint:questions found ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`lint:questions OK (${concepts} concepts, ${questions} questions)`);
}
