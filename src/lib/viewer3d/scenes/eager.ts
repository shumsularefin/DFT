// Every scene, loaded at once: for the build (posters, the stage check) and for tests. Never imported by client code.
import type { SceneDef, SceneModule } from '../types';
import { SCENE_ID } from './index';

const all = import.meta.glob<SceneModule>('./m[0-9][0-9].ts', { eager: true });

export const SCENES: ReadonlyMap<string, SceneDef> = (() => {
  const out = new Map<string, SceneDef>();
  for (const [file, mod] of Object.entries(all)) {
    const prefix = file.replace(/^\.\/(m\d\d)\.ts$/, '$1');
    for (const [id, def] of Object.entries(mod.scenes)) {
      if (!SCENE_ID.test(id) || !id.startsWith(`${prefix}-`))
        throw new Error(`${file}: scene id "${id}" must start with "${prefix}-"`);
      if (def.id !== id) throw new Error(`${file}: key "${id}" has id "${def.id}"`);
      if (out.has(id)) throw new Error(`duplicate scene id "${id}"`);
      out.set(id, def);
    }
  }
  return out;
})();

export function getSceneDef(id: string): SceneDef {
  const d = SCENES.get(id);
  if (!d) throw new Error(`unknown scene "${id}"`);
  return d;
}
