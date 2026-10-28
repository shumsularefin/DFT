# Third-party notices

Code or data derived from other projects is recorded here with its licence. Ported or bundled MIT/BSD material must keep its copyright notice in this file (add the full text when a stage first uses it). Packages installed from npm keep their own licences in `node_modules` and need no entry unless their code is copied into this repository.

| Project | Licence | Used for | Stage |
|---|---|---|---|
| seekpath (Hinuma, Pizzi et al.) | MIT | HPKOT k-path algorithm port and test oracle | M5.3 |
| pymatgen | MIT | Setyawan-Curtarolo k-path port, Shannon radii and element data extraction, golden data | M5.4, M8.1, M10.1 |
| spglib / moyo (`@spglib/moyo-wasm`) | BSD-3-Clause / MIT or Apache-2.0 | Symmetry analysis (npm dependency, not copied) | M5.1 |
| RDKit (`@rdkit/rdkit`) | BSD-3-Clause | Molecule 2D layout and sanitization (npm dependency, not copied) | M10.3 |
| Materials Project data (via `mp-api`) | see Q-009 | Screening Studio dataset, attribution required | M9.1 |
| Fontsource: IBM Plex Sans, JetBrains Mono | SIL OFL 1.1 | Fonts (npm dependency) | M1.1 |

When you port code, add: project, version, file ported, copyright line, and the licence text, below this line.

---
