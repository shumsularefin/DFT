// Question bank and concept graph linter (M6.1), run by `npm run lint:content`.
// Every message is one line: "<file>: <what is wrong and how to fix it>".
// Usage: node scripts/lint-questions.mjs [--coverage]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { questionSchema } from '../src/lib/learning/questions.ts';
import { buildGraph } from '../src/lib/learning/graph.ts';
import { parseFrontMatter } from './lint-content.mjs';
import { parseSources } from './build/sources-to-json.mjs';

const MIN_PER_CONCEPT = 4;

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

export function lintQuestions(root = '.') {
  const problems = [];
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const sourceIds = new Set(
    parseSources(fs.readFileSync(path.join(root, 'docs', 'SCIENCE_SOURCES.md'), 'utf8')).map((s) => s.id),
  );

  const conceptsFile = path.join(root, 'src', 'data', 'concepts.json');
  const concepts = JSON.parse(fs.readFileSync(conceptsFile, 'utf8'));
  let graph = null;
  try {
    graph = buildGraph(concepts);
  } catch (e) {
    problems.push(`${rel(conceptsFile)}: ${e.message}`);
  }
  const conceptIds = new Set(concepts.map((c) => c.id));

  const ids = new Map();
  const perConcept = new Map();
  const qdir = path.join(root, 'src', 'data', 'questions');
  for (const f of walk(qdir)
    .filter((f) => /module-\d+\.json$/.test(f))
    .sort()) {
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [i, raw] of list.entries()) {
      const where = `${rel(f)}: question ${raw?.id ?? `#${i}`}`;
      const res = questionSchema.safeParse(raw);
      if (!res.success) {
        for (const issue of res.error.issues)
          problems.push(`${where}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
        continue;
      }
      const q = res.data;
      if (ids.has(q.id)) problems.push(`${where}: id is already used in ${ids.get(q.id)}`);
      ids.set(q.id, rel(f));
      if (q.hints.length < 2) problems.push(`${where}: give at least two hints`);
      if ('options' in q)
        for (const [k, o] of q.options.entries())
          if (o.why.trim().length < 10) problems.push(`${where}: option ${k} needs a "why" that explains it`);
      for (const s of q.sources)
        if (!sourceIds.has(s)) problems.push(`${where}: source ${s} is not in docs/SCIENCE_SOURCES.md`);
      for (const c of q.concepts) {
        if (!conceptIds.has(c)) problems.push(`${where}: concept "${c}" is not in src/data/concepts.json`);
        perConcept.set(c, (perConcept.get(c) ?? 0) + 1);
      }
    }
  }

  // Topics: every <Check ids> exists, every front matter concept exists and is published.
  const usedConcepts = new Set();
  for (const f of walk(path.join(root, 'src', 'content', 'handbook')).filter((f) => f.endsWith('.mdx'))) {
    const text = fs.readFileSync(f, 'utf8');
    const { data } = parseFrontMatter(text);
    for (const key of ['concepts', 'requires'])
      for (const c of Array.isArray(data?.[key]) ? data[key] : []) {
        if (!conceptIds.has(c))
          problems.push(
            `${rel(f)}: front matter ${key} lists "${c}", which is not in src/data/concepts.json`,
          );
        if (key === 'concepts') usedConcepts.add(c);
      }
    for (const m of text.matchAll(/<Check ids=\{\[([^\]]*)\]\}/g))
      for (const [, id] of m[1].matchAll(/'([^']+)'/g))
        if (!ids.has(id)) problems.push(`${rel(f)}: <Check> lists ${id}, which is not in any question file`);
  }
  for (const c of concepts) {
    if (c.status === 'planned' && usedConcepts.has(c.id))
      problems.push(`${rel(conceptsFile)}: concept "${c.id}" is used by a topic, so set status "published"`);
    if (c.status === 'published' && (perConcept.get(c.id) ?? 0) < MIN_PER_CONCEPT)
      problems.push(
        `${rel(conceptsFile)}: published concept "${c.id}" has ${perConcept.get(c.id) ?? 0} question(s); write at least ${MIN_PER_CONCEPT}`,
      );
  }

  const coverage = [];
  for (const m of [...new Set(concepts.map((c) => c.module))].sort((a, b) => a - b)) {
    const cs = concepts.filter((c) => c.module === m);
    const pub = cs.filter((c) => c.status === 'published');
    coverage.push({
      module: m,
      concepts: cs.length,
      published: pub.length,
      questions: cs.reduce((n, c) => n + (perConcept.get(c.id) ?? 0), 0),
      minPerPublished: pub.length ? Math.min(...pub.map((c) => perConcept.get(c.id) ?? 0)) : null,
    });
  }
  return { problems, questions: ids.size, concepts: concepts.length, coverage, graph };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { problems, questions, concepts, coverage } = lintQuestions(path.resolve('.'));
  if (process.argv.includes('--coverage')) {
    console.log(
      '| Module | Concepts | Published | Questions | Min per published concept |\n|---|---|---|---|---|',
    );
    for (const r of coverage)
      console.log(
        `| ${r.module} | ${r.concepts} | ${r.published} | ${r.questions} | ${r.minPerPublished ?? '-'} |`,
      );
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\nlint:questions found ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`lint:questions OK (${questions} questions, ${concepts} concepts)`);
}
