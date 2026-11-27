// Self-tests for the guard scripts. Run: node --test scripts/guard/guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText } from './check-emdash.mjs';
import { PATTERNS } from './check-secrets.mjs';
import { MARKERS } from './check-potcar.mjs';
import { definedIds } from './check-sources.mjs';
import { parseStages } from './check-stages.mjs';
import runAll from './check-doc-links.mjs';
import { definedQ, definedD } from './check-refs.mjs';
import { sourceSections, checkCoverage } from './check-handbook-coverage.mjs';
import { STRICT as STAGES_STRICT, check3dStages, stageSceneOf } from './check-3d-stages.mjs';

const EM = '\u2014';

test('em dash detector finds U+2014 and ignores en dashes and hyphens', () => {
  assert.equal(checkText(`a ${EM} b`).length, 1);
  assert.equal(checkText('400\u2013700 eV and well-known').length, 0);
  assert.deepEqual(checkText(`ok\nbad ${EM} line`).map((h) => h.line), [2]);
});

test('secret patterns match realistic leaks and not harmless text', () => {
  const hit = (s) => PATTERNS.some(([, re]) => re.test(s));
  assert.ok(hit('-----BEGIN PRIVATE KEY-----'));
  assert.ok(hit('{"type": "service_account"}'));
  assert.ok(hit('apiKey: "AIza' + 'A'.repeat(35) + '"'));
  assert.ok(hit('ghp_' + 'a'.repeat(36)));
  assert.ok(hit('MP_API_KEY=' + 'x'.repeat(32)));
  assert.ok(!hit('MP_API_KEY is read from the environment'));
  assert.ok(!hit('PUBLIC_FIREBASE_API_KEY='));
});

test('POTCAR markers are conclusive only in combination', () => {
  const body = 'foo\n   local part\nbar\n   Description\nEnd of Dataset\n';
  assert.ok(MARKERS.filter((re) => re.test(body)).length >= 2);
  assert.ok(MARKERS.filter((re) => re.test('Description of the plan')).length < 2);
});

test('source registry parser reads IDs from table rows only', () => {
  const ids = definedIds('| S-001 | x |\n| S-002 | y |\ntext S-999 not a row\n');
  assert.deepEqual([...ids].sort(), ['S-001', 'S-002']);
});

test('stage parser splits on stage headings and stops at new milestones', () => {
  const text = '# M9\n## M9.1 First\n**Goal**: a\n## M9.2 Second\n**Goal**: b\n# Other\ntext';
  const stages = parseStages(text);
  assert.deepEqual(stages.map((s) => s.id), ['M9.1', 'M9.2']);
  assert.ok(stages[0].body.includes('**Goal**: a'));
});

test('stage parser ignores headings inside code fences', () => {
  const text = '# M9\n## M9.1 First\n**Goal**: a\n```bash\n# a shell comment\n## not a stage\n```\n**Tasks**: b\n';
  const stages = parseStages(text);
  assert.deepEqual(stages.map((s) => s.id), ['M9.1']);
  assert.ok(stages[0].body.includes('**Tasks**: b'));
});

test('doc link check runs on the repository', () => {
  const res = runAll();
  assert.equal(res.name, 'doc-links');
  assert.ok(Array.isArray(res.problems));
});

test('Q and D id parsers read headings and bold ids only', () => {
  assert.deepEqual([...definedQ('## Q-001. Title\ntext Q-999\n## Q-002. Other')], ['Q-001', 'Q-002']);
  assert.deepEqual([...definedD('**D-001. A.** text D-777 **D-010. B.**')], ['D-001', 'D-010']);
});

test('handbook coverage reads all 8 S-041 and 26 S-042 sections and finds every map entry in them', () => {
  const s = sourceSections();
  assert.equal(s.filter((x) => x.key.startsWith('S-041#')).length, 8);
  assert.equal(s.filter((x) => x.key.startsWith('S-042#')).length, 26);
  assert.deepEqual(checkCoverage().stale, []);
});

test('3D stage guard is strict (M16.15) and every topic has a stage whose scene exists', () => {
  assert.equal(STAGES_STRICT, true);
  assert.equal(stageSceneOf('---\nid: x\nstage:\n  scene: m02-orbital\n  states: []\n---\n'), 'm02-orbital');
  assert.equal(stageSceneOf('---\nid: x\n---\n'), null);
  const { topics, problems } = check3dStages();
  assert.ok(topics >= 83);
  assert.deepEqual(problems, []);
});
