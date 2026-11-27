// The scene registry (M16.3). A scene id is "mXX-name" or "mXXy-name": the file `mXX.ts` (or `mXXy.ts`, a second file for
// one module, for example m05s.ts for spin and magnetism) in this folder exports `scenes`, a record
// from id to SceneDef. On the client each module file is its own lazy chunk, loaded only when a stage asks for one of its
// scenes, so a topic page never downloads the generators of other modules.
import type { SceneDef, SceneModule } from '../types';

export const SCENE_ID = /^(m\d\d[a-z]?)-[a-z0-9]+(-[a-z0-9]+)*$/;

const lazy = import.meta.glob<SceneModule>(['./m*.ts', '!./m*.test.ts']);

export const moduleFileOf = (id: string): string => {
  const m = SCENE_ID.exec(id);
  if (!m) throw new Error(`bad scene id "${id}": expected "mXX-name" or "mXXy-name"`);
  return `./${m[1]}.ts`;
};

export async function loadScene(id: string): Promise<SceneDef> {
  const file = moduleFileOf(id);
  const load = lazy[file];
  if (!load) throw new Error(`no scene module ${file} for "${id}"`);
  const mod = await load();
  const def = mod.scenes[id];
  if (!def) throw new Error(`scene "${id}" is not in ${file}. Known: ${Object.keys(mod.scenes).join(', ')}`);
  return def;
}
