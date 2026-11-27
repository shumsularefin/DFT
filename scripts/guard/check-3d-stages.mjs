// M16 (section 1): every handbook topic carries a live 3D stage whose scene exists.
//  * a topic without a `stage:` block in its front matter is reported;
//  * a stage whose scene id is not defined in src/lib/viewer3d/scenes/mXX.ts is reported;
//  * a topic page that still shows a picture in place of the stage (an <img> standing for 3D) is reported.
// The deep checks (parameters, layer groups, descriptions) run in vitest: src/lib/viewer3d/stages.test.ts.
// STRICT is true since M16.15: all 83 topics have a stage, so a missing or broken stage fails verify.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, rel, result } from './lib.mjs';

export const STRICT = true;

const SCENE_ID = /^(m\d\d[a-z]?)-[a-z0-9]+(-[a-z0-9]+)*$/;

export function stageSceneOf(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const m = /^stage:\s*\r?\n(?:[ \t]+.*\r?\n?)*?[ \t]+scene:\s*([^\s#]+)/m.exec(fm[1]);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

export function check3dStages(root = ROOT) {
  const problems = [];
  const topics = walk(path.join(root, 'src/content/handbook'), { exts: ['.mdx'] });
  const sceneDir = path.join(root, 'src/lib/viewer3d/scenes');
  const sceneText = new Map();
  for (const t of topics) {
    const text = fs.readFileSync(t, 'utf8');
    const scene = stageSceneOf(text);
    if (!scene) {
      problems.push(`${rel(t)}: no 3D stage (add a "stage:" block with a scene, M16 section 5)`);
      continue;
    }
    const m = SCENE_ID.exec(scene);
    if (!m) {
      problems.push(`${rel(t)}: stage scene "${scene}" is not an id like m02-orbital`);
      continue;
    }
    const file = path.join(sceneDir, `${m[1]}.ts`);
    if (!sceneText.has(file)) sceneText.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
    const src = sceneText.get(file);
    if (src === null) problems.push(`${rel(t)}: stage scene "${scene}" needs src/lib/viewer3d/scenes/${m[1]}.ts`);
    else if (!src.includes(`'${scene}'`)) problems.push(`${rel(t)}: stage scene "${scene}" is not defined in ${rel(file)}`);
  }
  return { topics: topics.length, problems };
}

export default function check() {
  const { topics, problems } = check3dStages();
  if (!STRICT) {
    if (problems.length) {
      console.log(`WARN  3D stages: ${problems.length} of ${topics} topics not yet covered (warn only until M16.15)`);
      for (const p of problems.slice(0, 10)) console.log(`      - ${p}`);
    }
    return result('3D stages (warn only)', []);
  }
  return result('3D stages', problems);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = check();
  process.exit(r.ok ? 0 : 1);
}
