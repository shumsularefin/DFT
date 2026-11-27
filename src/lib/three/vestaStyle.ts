// One look for every 3D view on the site (D-122): the look of the site's VESTA-style structure viewer in the Studio
// (public/dft-studio/js/vesta.js on the layout branch). Plain data, no three.js import, so the SVG posters, the old
// scene classes and the new engine all read the same numbers. Element colours are the Jmol CPK convention as that
// viewer sets them; they are a drawing convention, not data (the element symbol is always shown as well).

/** Element colours, as the Studio's structure viewer draws them. */
export const ELEMENT_COLORS: Readonly<Record<string, string>> = {
  H: '#f0f0f0',
  He: '#d9ffff',
  Li: '#cc80ff',
  Be: '#c2ff00',
  B: '#ffb5b5',
  C: '#505050',
  N: '#3050f8',
  O: '#e62222',
  F: '#90e050',
  Ne: '#b3e3f5',
  Na: '#ab5cf2',
  Mg: '#8aff00',
  Al: '#bfa6a6',
  Si: '#4b7bec',
  P: '#ff8000',
  S: '#e8c828',
  Cl: '#1ff01f',
  K: '#8f40d4',
  Ca: '#3dff00',
  Sc: '#c4c4c4',
  Ti: '#77b5d9',
  V: '#a6a6ab',
  Cr: '#8a99c7',
  Mn: '#9c7ac7',
  Fe: '#c87d2e',
  Co: '#3a6cd4',
  Ni: '#45b868',
  Cu: '#c88033',
  Zn: '#7d80b0',
  Ga: '#c28f8f',
  Ge: '#668f8f',
  As: '#bd80e3',
  Se: '#ffa100',
  Br: '#a62929',
  Sr: '#00cc00',
  Y: '#94ffff',
  Zr: '#94e0e0',
  Nb: '#73c2c9',
  Mo: '#54b5b5',
  Ru: '#248f8f',
  Pd: '#006985',
  Ag: '#c0c0c0',
  In: '#a67573',
  Sn: '#668080',
  Sb: '#9e63b5',
  Te: '#d47a00',
  I: '#940094',
  Cs: '#57178f',
  Ba: '#22c55e',
  La: '#70d4ff',
  Ce: '#e9e39e',
  Pr: '#a7f3d0',
  Nd: '#6ee7b7',
  Pm: '#34d399',
  Sm: '#10b981',
  Eu: '#059669',
  Gd: '#45ffc7',
  Tb: '#30ffc7',
  Dy: '#1fffc7',
  Ho: '#00ff9c',
  Er: '#00e675',
  Tm: '#00d452',
  Yb: '#00bf38',
  Lu: '#00ab24',
  Hf: '#4dc2ff',
  Ta: '#4da6ff',
  W: '#2194d6',
  Re: '#267dab',
  Os: '#266696',
  Ir: '#175487',
  Pt: '#d0d0e0',
  Au: '#ffd123',
  Hg: '#b8b8d0',
  Tl: '#a6544d',
  Pb: '#575961',
  Bi: '#9e4fb5',
  Th: '#00baff',
  U: '#008fff',
};

/** Grey for an element the table does not list (as the Studio viewer does). */
export const UNKNOWN_ELEMENT_COLOR = '#94a3b8';

/** Colour of an element symbol; a label such as "Fe1" or "Fe_up" uses the element's colour. */
export function elementColor(symbol: string): string {
  const m = /^[A-Z][a-z]?/.exec(symbol.trim());
  const el = m ? (ELEMENT_COLORS[m[0]] ? m[0] : m[0][0]!) : '';
  return ELEMENT_COLORS[el] ?? UNKNOWN_ELEMENT_COLOR;
}

/**
 * Lights fixed in the scene, as in the Studio viewer: soft white ambient, a white key light from above front right and a
 * cool fill from below behind. Directions are in scene coordinates (z up); intensities are three r155+ units, the same
 * three version the Studio uses.
 */
export const VESTA_LIGHTS = {
  ambient: { color: 0xffffff, intensity: 0.58 },
  key: { color: 0xffffff, intensity: 0.72, position: [12, 18, 22] as const },
  fill: { color: 0xdbeafe, intensity: 0.35, position: [-16, -10, -14] as const },
} as const;

/** Surface finish of each kind of object (MeshStandardMaterial roughness and metalness). */
export const VESTA_MATERIAL = {
  atom: { roughness: 0.34, metalness: 0.14 },
  bond: { roughness: 0.38, metalness: 0.12 },
  arrow: { roughness: 0.28, metalness: 0.12 },
  surface: { roughness: 0.4, metalness: 0.05 },
} as const;

/** Sizes: atom radius = covalent radius x atomScale, bond tube radius in Angstrom, sphere tessellation. */
export const VESTA_SIZES = {
  atomScale: 0.42,
  bondRadius: 0.1,
  sphereSegments: [28, 22] as const,
  polyhedronOpacity: 0.48,
} as const;

/** Colours of the corner axes marker: a red, b green, c blue, each also labelled with its letter. */
export const GIZMO_COLORS = ['#ef4444', '#22c55e', '#3b82f6'] as const;
