export const SITE = {
  name: 'DFT Handbook',
  tagline: 'Learn DFT and VASP by doing, in your browser.',
  version: '0.1.0',
} as const;

/**
 * Pages stay out of search engines until the release stage (D-027). M11.3 flips this one constant;
 * it drives the robots meta tag, robots.txt and the sitemap.
 */
export const INDEXING_ENABLED = false;

/** The eleven handbook modules (SPEC section 6), numbered as in the `module` front matter field. */
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
] as const;

export const moduleName = (n: number): string => MODULES[n - 1] ?? `Module ${n}`;

/** Top navigation. Tools that do not exist yet point at their "coming soon" card on /tools/. */
export const NAV = [
  { label: 'Handbook', href: '/handbook/' },
  { label: 'Tools', href: '/tools/' },
  { label: 'Studio', href: '/tools/#studio' },
  { label: 'Builder', href: '/tools/#builder' },
  { label: 'Practice', href: '/tools/#practice' },
] as const;

export const FOOTER_LINKS = [
  { label: 'About', href: '/about/' },
  { label: 'References', href: '/references/' },
  { label: 'Glossary', href: '/glossary/' },
  { label: 'Privacy', href: '/privacy/' },
  { label: 'Changelog', href: '/changelog/' },
] as const;
