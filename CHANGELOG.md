# Changelog

All notable changes to the DFT Handbook are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
