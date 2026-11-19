// The preset scenes (src/data/scenes/*.json) and the named structures they refer to (src/data/scene-structures.json).
// Both files are written by scripts/data/build_scenes.py from the golden cells in tests/reference/kpaths.json.
import structures from '../../data/scene-structures.json';
import type { Structure } from '../crystal/types';
import { assertSpec, type SceneSpec } from './spec';

const raw = import.meta.glob('../../data/scenes/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

const presets = new Map<string, SceneSpec>();
for (const [path, data] of Object.entries(raw)) {
  assertSpec(data); // a bad preset fails the build, not the reader
  const id = path.replace(/^.*\/([^/]+)\.json$/, '$1');
  if (data.id !== id) throw new Error(`scene file ${id}.json has id "${data.id}"`);
  presets.set(id, data);
}

export const lookupStructure = (id: string): Structure | undefined =>
  (structures as unknown as Record<string, Structure>)[id];

export const sceneIds = (): string[] => [...presets.keys()].sort();

export function getScene(id: string): SceneSpec {
  const s = presets.get(id);
  if (!s) throw new Error(`unknown scene "${id}". Known: ${sceneIds().join(', ')}`);
  return s;
}
