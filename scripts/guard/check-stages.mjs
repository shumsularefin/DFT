// Consistency of the stage system:
//  * every "## Mx.y" stage in docs/milestones/*.md has a row in docs/PROGRESS.md and vice versa;
//  * every stage section contains the mandatory bold labels (the work-order template);
//  * statuses in PROGRESS.md are from the allowed set;
//  * "Depends on" only names stages that exist.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, rel, result } from './lib.mjs';

const REQUIRED = ['**Goal**', '**Depends on**', '**Size**', '**Deliverables**', '**Tasks**', '**Tests and reference values**', '**Done when**', '**Not in this stage**'];
const STATUSES = new Set(['todo', 'in-progress', 'partial', 'blocked', 'done']);
const STAGE_HEAD = /^## (M\d+\.\d+)\b/;

export function parseStages(text) {
  const stages = [];
  let cur = null;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) {
      if (cur) cur.body.push(line);
      continue;
    }
    const m = STAGE_HEAD.exec(line);
    if (m) {
      cur = { id: m[1], body: [] };
      stages.push(cur);
    } else if (/^# /.test(line)) {
      cur = null;
    } else if (cur) {
      cur.body.push(line);
    }
  }
  return stages.map((s) => ({ id: s.id, body: s.body.join('\n') }));
}

export default function run() {
  const problems = [];
  const msDir = path.join(ROOT, 'docs', 'milestones');
  const stages = [];
  for (const file of walk(msDir, { exts: ['.md'] })) {
    const text = fs.readFileSync(file, 'utf8');
    for (const s of parseStages(text)) stages.push({ ...s, file: rel(file) });
  }
  const ids = new Set();
  for (const s of stages) {
    if (ids.has(s.id)) problems.push(`${s.id} is defined twice`);
    ids.add(s.id);
    for (const label of REQUIRED) if (!s.body.includes(label)) problems.push(`${s.file}: stage ${s.id} is missing the label ${label}`);
    const dep = /\*\*Depends on\*\*:?\s*([^\n]*)/.exec(s.body);
    if (dep) for (const d of dep[1].match(/M\d+\.\d+/g) ?? []) if (!stages.some((x) => x.id === d)) problems.push(`${s.file}: stage ${s.id} depends on unknown stage ${d}`);
  }
  const progressFile = path.join(ROOT, 'docs', 'PROGRESS.md');
  if (!fs.existsSync(progressFile)) return result('stages', ['docs/PROGRESS.md is missing']);
  const rows = new Map();
  for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
    const m = /^\|\s*(M\d+\.\d+)\s*\|([^|]*)\|\s*([a-z-]+)\s*\|/.exec(line);
    if (m) rows.set(m[1], m[3]);
  }
  for (const id of ids) if (!rows.has(id)) problems.push(`docs/PROGRESS.md has no row for stage ${id}`);
  for (const [id, status] of rows) {
    if (!ids.has(id)) problems.push(`docs/PROGRESS.md lists ${id}, which is not defined in docs/milestones`);
    if (!STATUSES.has(status)) problems.push(`docs/PROGRESS.md: stage ${id} has invalid status "${status}"`);
  }
  if (ids.size === 0) problems.push('no stages found in docs/milestones');
  return result('stages', problems);
}
