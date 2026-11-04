// Colours of the Brillouin-zone view, kept apart from the three.js code so the 2D fallback can use them without loading it.
// @source S-057
// Okabe-Ito colours, so nothing depends on red against green.
export const BZ_COLORS = {
  edges: '#7b8494',
  faces: '#56b4e9',
  vectors: '#009e73',
  points: '#d55e00',
  gamma: '#cc79a7',
  path: '#0072b2',
  mesh: '#e69f00',
} as const;
