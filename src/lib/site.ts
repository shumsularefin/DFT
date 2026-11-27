export const SITE = {
  name: 'DFT Handbook',
  tagline: 'Learn DFT and VASP by doing, in your browser.',
  version: '0.1.0',
} as const;

/**
 * Pages stay out of search engines until the release stage (D-027). The unmerged
 * `chore/enable-indexing` branch flips this one constant; it drives the robots meta tag,
 * robots.txt and the sitemap.
 */
export const INDEXING_ENABLED = false;

/** The twelve handbook modules (SPEC section 6), numbered as in the `module` front matter field. */
export const MODULES = [
  'Why DFT exists',
  'Quantum basics without math',
  'The many-electron problem and why density helps',
  'Hohenberg-Kohn, Kohn-Sham and the SCF loop',
  'Practical choices',
  'VASP files',
  'Running a calculation',
  'Convergence testing and common errors',
  'Analysis',
  'Worked example: a perovskite oxide',
  'Screening Studio and Material Builder',
  'Lattice response and properties',
] as const;

export const moduleName = (n: number): string => MODULES[n - 1] ?? `Module ${n}`;

/** Sidebar navigation, grouped as in the app shell (D-105). The first link must stay "Learn" (keyboard order test). */
export const NAV_GROUPS = [
  {
    label: 'Study',
    items: [
      { label: 'Learn', href: '/learn/', icon: 'path' },
      { label: 'Handbook', href: '/handbook/', icon: 'book' },
      { label: 'Practice', href: '/practice/', icon: 'check' },
      { label: 'Progress', href: '/progress/', icon: 'trend' },
    ],
  },
  {
    label: 'Build',
    items: [
      { label: 'Material Builder', href: '/builder/', icon: 'cube' },
      { label: 'Input Builder', href: '/tools/input-builder/', icon: 'file' },
      { label: 'Screening', href: '/studio/', icon: 'filter' },
    ],
  },
  {
    label: 'Calculate',
    items: [
      { label: 'Convergence', href: '/tools/convergence/', icon: 'chart' },
      { label: 'k-path', href: '/tools/kpath/', icon: 'kpath' },
      { label: 'Magnetic', href: '/tools/magnetic/', icon: 'magnet' },
      { label: 'Error finder', href: '/errors/', icon: 'search' },
      { label: 'All tools', href: '/tools/', icon: 'grid' },
    ],
  },
] as const;

/** Flat list of the sidebar links. */
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

export const FOOTER_LINKS = [
  { label: 'About', href: '/about/' },
  { label: 'References', href: '/references/' },
  { label: 'Glossary', href: '/glossary/' },
  { label: 'Privacy', href: '/privacy/' },
  { label: 'Changelog', href: '/changelog/' },
] as const;
