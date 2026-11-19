// The tags that have a picture (src/data/tag-visuals.json). Kept tiny so a tag card can decide whether to offer
// "Show me" without loading the mappings or any plot code; a test keeps it equal to the data file.
export const TAGS_WITH_VISUAL: readonly string[] = [
  'ISPIN',
  'MAGMOM',
  'ENCUT',
  'KSPACING',
  'ISMEAR',
  'SIGMA',
  'LDAUU',
  'LDAUJ',
  'IBRION',
  'ISIF',
  'NSW',
  'EDIFF',
  'EDIFFG',
  'NELM',
];
