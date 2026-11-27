// Badge labels and shapes, shared by Badge.astro and Badge.tsx. One shape per variant, so meaning never relies on colour.
export type BadgeVariant = 'illustrative' | 'heuristic' | 'toy-model' | 'computed' | 'sample' | 'verified';

export const BADGE_LABELS: Record<BadgeVariant, string> = {
  illustrative: 'Illustrative',
  heuristic: 'Heuristic',
  'toy-model': 'Toy model',
  computed: 'Computed',
  sample: 'Sample data',
  verified: 'Verified',
};

// dashed circle, triangle, square, filled circle, open square, check
export const BADGE_SHAPES: Record<BadgeVariant, string> = {
  illustrative:
    '<circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 1.6"/>',
  heuristic:
    '<path d="M6 1.5 11 10.5H1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  'toy-model': '<rect x="1.8" y="1.8" width="8.4" height="8.4" fill="currentColor"/>',
  computed: '<circle cx="6" cy="6" r="4.5" fill="currentColor"/>',
  sample: '<rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  verified:
    '<path d="M1.5 6.5 4.5 9.5 10.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
