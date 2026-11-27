/* global module */
// Tailwind 3.4.17 config for the Material Builder workspace (DFT Studio code). The CDN runtime it replaces
// cannot run under the site CSP, so the CSS is generated once and committed: run
// scripts/studio/build-tailwind.sh after changing classes.
// Native hosting (D-105): every utility is scoped under .studio-root (important selector strategy), there is
// no preflight (src/components/studio/css/workspace.css has a scoped reset instead), the dark variant follows
// the site theme, and the Studio's accent and status colours are the site tokens.
const token = (v) => `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;
module.exports = {
  important: '.studio-root',
  corePlugins: { preflight: false },
  darkMode: [
    'variant',
    [
      ':root[data-theme="dark"] &',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }',
    ],
  ],
  content: ['./src/components/studio/studio-body.html', './public/dft-studio/js/*.js'],
  theme: {
    extend: {
      // The site sidebar (--sidebar-w, 15.5rem) sits beside the workspace from 64rem up, so the wide breakpoints
      // move out by its width: lg and xl apply when the workspace itself is about 1024 and 1280 px wide.
      screens: { lg: '1272px', xl: '1528px', '2xl': '1800px' },
      colors: {
        blue: { 500: token('--accent'), 600: token('--accent') },
        amber: { 400: token('--warn'), 500: token('--warn'), 600: token('--warn') },
        emerald: { 400: token('--ok'), 600: token('--ok') },
        green: { 600: token('--ok') },
        red: { 500: token('--danger') },
        rose: { 500: token('--danger') },
        sky: { 500: token('--st-sky') },
        purple: { 500: token('--st-purple') },
        'on-accent': token('--accent-contrast'),
      },
    },
  },
  plugins: [],
};
