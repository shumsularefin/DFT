// Camera words of a stage state (M16.2): iso, top, front, side, a, b, c, a*, b*, c* or a custom eye and up, turned into a
// view direction, an up vector and a zoom. Pure; shared by the live engine and the build-time poster.
import { normalize, type Vec3 } from './math';
import type { CameraSpec, SceneFrame } from './types';
import { namedView, type ViewName } from './views';

/** Default direction for "iso" when the frame has no lattice: a three-quarter view from the front right, slightly above. */
export const ISO_EYE: Vec3 = normalize([1, -1.35, 0.85]);

export function cameraForSpec(
  spec: CameraSpec | undefined,
  frame: Pick<SceneFrame, 'lattice'>,
): { eye: Vec3; up: Vec3; zoom: number } {
  const s = spec ?? 'iso';
  if (typeof s === 'object') return { eye: normalize(s.eye), up: s.up ?? [0, 0, 1], zoom: s.zoom ?? 1 };
  switch (s) {
    case 'top':
      return { eye: [0, 0, 1], up: [0, 1, 0], zoom: 1 };
    case 'front':
      return { eye: [0, -1, 0], up: [0, 0, 1], zoom: 1 };
    case 'side':
      return { eye: [1, 0, 0], up: [0, 0, 1], zoom: 1 };
    default: {
      if (!frame.lattice) return { eye: ISO_EYE, up: [0, 0, 1], zoom: 1 };
      const v = namedView(s as ViewName, frame.lattice);
      return { eye: v.eye, up: v.up, zoom: 1 };
    }
  }
}
