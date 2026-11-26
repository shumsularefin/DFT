/* global module */
// Tailwind 3.4.17 config for DFT Studio. The CDN runtime it replaces cannot run under the site CSP,
// so the CSS is generated once and committed: run scripts/studio/build-tailwind.sh after changing classes.
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/dft-studio/index.astro',
    './src/components/studio/studio-body.html',
    './public/dft-studio/js/*.js',
  ],
  theme: { extend: {} },
  plugins: [],
};
