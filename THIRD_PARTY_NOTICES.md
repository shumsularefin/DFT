# Third-party notices

Code or data derived from other projects is recorded here with its licence. Ported or bundled MIT/BSD material must keep its copyright notice in this file (add the full text when a stage first uses it). Packages installed from npm keep their own licences in `node_modules` and need no entry unless their code is copied into this repository.

| Project | Licence | Used for | Stage |
|---|---|---|---|
| seekpath 2.2.2 (Hinuma, Pizzi et al.) | MIT | HPKOT k-path algorithm port, band-path tables, test oracle (full text below) | M5.3 |
| pymatgen | MIT | Setyawan-Curtarolo k-path port, Shannon radii and element data extraction, golden data | M5.4, M8.1, M10.1 |
| spglib / moyo (`@spglib/moyo-wasm`) | BSD-3-Clause / MIT or Apache-2.0 | Symmetry analysis (npm dependency, not copied) | M5.1 |
| spglib 2.8.0 `niggli.c` | BSD-3-Clause | Niggli reduction ported to `src/lib/crystal/niggli.ts` (full text below) | M5.3 |
| RDKit (`@rdkit/rdkit`) | BSD-3-Clause | Molecule 2D layout and sanitization (npm dependency, not copied) | M10.3 |
| Materials Project data (via `mp-api`) | see Q-009 | Screening Studio dataset, attribution required | M9.1 |
| Marching-cubes case tables (Paul Bourke, from Cory Gene Bloyd) via three.js `examples/jsm/objects/MarchingCubes.js` | MIT (three.js) | `src/lib/physics/marchingCubesTables.ts`, copied data, integrity tested | M7.5 |
| Fontsource: IBM Plex Sans, JetBrains Mono | SIL OFL 1.1 | Fonts (npm dependency) | M1.1 |

When you port code, add: project, version, file ported, copyright line, and the licence text, below this line.

---

## seekpath 2.2.2 (MIT), ported in M5.3

Files read and ported to TypeScript (`src/lib/crystal/kpath/hpkot.ts`) or converted to JSON (`src/data/kpath/hpkot/`):
`seekpath/hpkot/__init__.py` (extended Bravais lattice selection, aP handling, point evaluation, augmented path),
`seekpath/hpkot/spg_mapping.py` (primitive transformation matrices P and invP, primitive cell with duplicate removal),
`seekpath/hpkot/tools.py` (cell parameters, reciprocal cell, k-parameter expressions),
`seekpath/hpkot/spg_db.py` (space group to Bravais family, centring, inversion; converted to `spacegroups.json`),
`seekpath/hpkot/band_path_data/<variant>/{k_vector_parameters,points,path}.txt` (29 variants; converted to `variants.json` by `scripts/build/convert-hpkot-tables.mjs`).

```
The MIT License (MIT)

Copyright (c), 2016-2023, Giovanni Pizzi, PAUL SCHERRER INSTITUT (Laboratory
for Materials Simulations), ECOLE POLYTECHNIQUE FEDERALE DE
LAUSANNE (Theory and Simulation of Materials (THEOS) and National Centre for
Computational Design and Discovery of Novel Materials (NCCR MARVEL)),
Switzerland. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## spglib 2.8.0 `src/niggli.c` (BSD-3-Clause), ported in M5.3

Ported to `src/lib/crystal/niggli.ts` (the eight Niggli steps and their restart rule). The file header reads Copyright (C) 2023 Atsushi Togo; the repository licence file reads Copyright (c) 2024, Spglib team.

```
Copyright (c) 2024, Spglib team

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.
* Neither the name of the <organization> nor the
  names of its contributors may be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT
HOLDER> BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## pymatgen (MIT), ported in M5.4

Files read and ported to TypeScript (`src/lib/crystal/kpath/setyawan.ts`):
`pymatgen/symmetry/kpath.py` (`KPathSetyawanCurtarolo`: variant selection and the 23 point and path tables),
`pymatgen/symmetry/analyzer.py` (`get_conventional_standard_structure`, `get_primitive_standard_structure`),
`pymatgen/core/lattice.py` (LLL reduction). Source: the `pymatgen-core` 2026.10.31 wheel (license file copied below).

```
The MIT License (MIT)
Copyright (c) 2011-2012 MIT & The Regents of the University of California,
through Lawrence Berkeley National Laboratory

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
