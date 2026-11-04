# Changelog

All notable changes to the DFT Handbook are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Second band-path convention (Setyawan-Curtarolo, the one pymatgen and the Materials Project use): all 23 lattice variants, selectable alongside the default HPKOT path (no UI yet).
- Recommended band path (HPKOT convention, the one SeeK-path uses): the special points, their coordinates and the path for any structure, for all 29 lattice variants, with a warning when a cell sits on the boundary between two variants (no UI yet).
- Brillouin zone geometry library: the exact first Brillouin zone (vertices, edges, faces, volume) for any lattice, checked against an independent Voronoi reference (no UI yet).
- Symmetry and structure files: find the space group of a POSCAR, CIF or XYZ file in your browser (the engine loads only when you ask), see what standardizing the cell changed in plain language with the transformation matrix, and read CIF files safely (partly filled sites are refused with an explanation). Check page at /design/symmetry-check/.
- k-point mesh lab: Monkhorst-Pack and Gamma-centred meshes drawn in the reciprocal cell, the number of irreducible points under the lattice symmetry, a plain explanation when a mesh breaks the symmetry, and a toy panel showing why metals need denser meshes than insulators.
- ENCUT lab: pick a cell and a cutoff, see the sphere of plane waves with the exact count next to the smooth estimate, a scaling hint, and a toy-model curve showing why a higher cutoff changes the energy (3D view loads on request; flat slice without WebGL).
- Convergence plotter tool: drop OSZICAR or OUTCAR files or paste a table, see where the energy stops changing with a threshold band and a plain-language explanation, and export SVG, PNG or CSV. Runs in your browser.
- Convergence series generator in the Input Builder: ENCUT and k-mesh test folders with INCAR, KPOINTS, POSCAR and job scripts, plus run, collect and POTCAR-assembly scripts, downloaded as one zip (never contains POTCAR content).
- Output readers and convergence check library: OSZICAR, OUTCAR and pasted series, with the rule that a setting counts as converged only when every later point stays within the threshold (no UI yet).
- File explorer for handbook pages: click any line of a POSCAR, KPOINTS or INCAR to read what it means at your level, plus a panel describing the fields in a POTCAR header (structure only, no POTCAR content).
- Input builder tool: paste a POSCAR, pick a task, edit and check an INCAR with plain-language explanations, choose k-points, write a SLURM or PBS job script, and download a zip of the input files (never a POTCAR). Runs in your browser; nothing is uploaded.
- INCAR validation engine: 33 sourced rules that catch risky settings, with one-click fixes (no UI yet).
- INCAR library and data: parser and writer, 71 documented tags and 16 starting presets built from the two handbooks (no UI yet).
- KPOINTS library: k-mesh sizes from KSPACING, resolution or length, mesh coordinates, file writers and a parser (no UI yet).
- Structure core library: lattice math, POSCAR reader and writer, composition and density helpers, and the tool hand-off store (no UI yet).
- Site shell: header with navigation, search, level switch, progress tracker and theme toggle, plus a footer
  and a keyboard-shortcut list.
- Landing page, handbook module map, About, Privacy and Tools pages.
- Reading progress saved on your device only, with a reset button.
- Handbook pages now have a sidebar, breadcrumbs, previous and next links and a "Mark complete" button.
- Module 1, "Why DFT exists": four topics, an interactive lab on how the cost of methods grows with system size, practice questions and 14 new glossary terms (all draft).
- Module 2, "Quantum basics without math": six topics, two interactive labs (a particle in a box and hydrogen orbitals as a 3D point cloud with a flat fallback), practice questions and 9 new glossary terms (all draft).
- Module 3, "The many-electron problem": five topics, two interactive labs (counting the exponential wall, and a density-to-potential map with N non-interacting electrons), practice questions and 6 new glossary terms (all draft).
- Design system, content system and one sample topic (draft).

### Notes

- The site is under construction and hidden from search engines until its first release.
