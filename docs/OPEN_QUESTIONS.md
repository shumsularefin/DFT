# Open questions

Anything unverified goes here instead of being guessed. Format: ID, question, why it matters, how to close it, owner, status. Builders add new entries with the next free `Q-nnn` and point to them from `it.todo` tests. Do not delete an entry; mark it `closed` with the resolution.

| ID | Status | Owner |
|---|---|---|
| Q-001 | open | author |
| Q-002 | open | author + builder (M8.1) |
| Q-003 | open | builder (needs arxiv access) or author (PDF) |
| Q-004 | open | author (5-minute VASP run) |
| Q-005 | open | builder (M8.4) |
| Q-006 | open | author |
| Q-007 | open | author |
| Q-008 | open | author |
| Q-009 | open | author + builder (M9.1) |
| Q-010 | open | builder (M9.3, needs vasp.at) |
| Q-011 | open | author |
| Q-012 | open | builder (M8.2, M10.1) |
| Q-013 | open | author (one VASPKIT run) |
| Q-014 | open | builder (M4.1) |
| Q-015 | open | author |
| Q-016 | open | builder (M8.2) |
| Q-017 | open | author (confirm erratum) |
| Q-018 | open | builder (M3.2, needs vasp.at) or author (one run) |
| Q-019 | open | author |

## Q-001. Repository licence
Which licence for the code and which for the written content and data (a common split: MIT for code, CC BY 4.0 for original text)? Affects `LICENSE`, the footer and the references page. Until decided: no LICENSE file; `THIRD_PARTY_NOTICES.md` lists upstream licences. **Owner: author.**

## Q-002. Shannon radii: licence and completeness
The tolerance explorer bundles Shannon (1976) radii built from pymatgen's table (pymatgen is MIT; the numbers are Shannon's published data). Two things are unverified: (a) whether bundling a compiled copy of the table needs more than attribution; (b) completeness. pymatgen has 492 spin-resolved entries; check against the original table (Acta Cryst. A32, 751) or the Imperial College online database, listing any missing rows. 34 textbook anchor values agree, but they were written down after some pymatgen values had been seen, so that is a consistency check only; this question is about a genuinely independent comparison. **Close:** M8.1 diffs the dataset against the original and records the result here; the author confirms the licence position.

## Q-003. Bartel tau: equation, threshold and radius conventions
Implemented from memory: tau = r_X/r_B - n_A (n_A - (r_A/r_B)/ln(r_A/r_B)), perovskite predicted when tau < 4.18 (Bartel et al., Sci. Adv. 5, eaav0693, 2019). The paper could not be fetched when the plan was made (arxiv.org and PMC unreachable). Also unconfirmed: which Shannon coordination numbers the paper used for A, B, X, and how it treats mixed oxidation states. Sanity values from the golden file look right (SrTiO3 3.80, CsPbBr3 4.10, CsPbI3 4.30). **Close:** read the paper (allow arxiv.org / pmc.ncbi.nlm.nih.gov, or the author attaches the PDF to the session); M8.2 must not be marked done until this is closed or the UI shows "formula not yet confirmed against the paper".

## Q-004. KSPACING and VASPKIT resolution to k-mesh rule
The rounding rule VASP applies for KSPACING and the one VASPKIT task 102 applies for its "resolution" (in 2 pi / Angstrom) could not be read (vasp.at unreachable). Candidates are in `tests/reference/pw_kmesh_reference.json` (`kspacing_candidates`: ceil, round half up, int plus 0.999). **Calibration (author, 5 minutes per run):** take fcc Cu with the primitive cell (a = 3.61 Angstrom, vectors (0,a/2,a/2), (a/2,0,a/2), (a/2,a/2,0)); each reciprocal vector has length |b| = 3.0146 1/Angstrom including 2 pi. Run VASP with `NSW = 0` and `KSPACING = 0.3`, no KPOINTS file, then read the mesh from OUTCAR (the line that starts `generate k-points for:` prints three integers; if your version words it differently, use the subdivisions in IBZKPT). Do three runs with `KSPACING = 0.3`, `0.28` and `0.30145` (ratios |b|/KSPACING = 10.0487, 10.7665, 10.0004). The expected mesh per rule is: **ceil 11, 11, 11**; **round-half-up 10, 11, 10**; **int(x + 0.999) 11, 11, 10**; **truncate 10, 10, 10**. The three runs together separate all four rules (the golden file holds the first three; truncation is listed for completeness). Report the integers. Do the same with `vaspkit -task 102` at resolution 0.04 and report the mesh it writes. **Close:** record the rule in D-016 and pin it in tests.

## Q-005. Perovskite region boundaries
The t-mu map needs region boundaries from the literature. Derivable without a citation: mu >= sqrt(2) - 1 = 0.414 (octahedral hole), mu < sqrt(3) - 1 = 0.732 (cubic coordination), the classic radius-ratio limits. Widely quoted for t: roughly 0.8 to 1.0 for perovskites, cubic near 0.9 to 1.0, tilted below. Formability-window papers (for example Li et al. on ABO3 and ABX3 formability) are cited from memory only. **Close:** M8.4 reads and cites the exact windows, or labels the map regions "textbook ranges" and does not show window numbers it has not verified.

## Q-006. Firebase Spark plan limits
v1 of the SPEC says hosting transfer is 10 GB per month in current sources but 360 MB per day in older ones. firebase.google.com was unreachable when checked, so neither is confirmed, nor the Firestore figures (1 GiB storage, 50K reads, 20K writes, 20K deletes per day) or whether Cloud Storage for Firebase is unavailable on Spark. **Design rule until closed:** assume the stricter 360 MB/day. **Close:** author opens the pricing page and records the current numbers here; M0.2 and M11.1 re-compute the page-weight budget against them.

## Q-007. Network access for builder sessions
Builders cannot verify against papers or the VASP wiki if the cloud environment blocks them. Suggested allowed domains: `vasp.at`, `www.vasp.at`, `arxiv.org`, `export.arxiv.org`, `doi.org`, `pmc.ncbi.nlm.nih.gov`, `firebase.google.com`, `docs.astro.build`, `github.com`, `raw.githubusercontent.com`, `spglib.readthedocs.io`, `pymatgen.org`, `docs.materialsproject.org`, `abulafia.mt.ic.ac.uk`. See `docs/SETUP_FIREBASE.md` section 5 for where to set it. Without it, stages still run but record "could not verify against source" items here. **Owner: author.**

## Q-008. Author example data
The worked example (module 10) and parser validation need real files from the author's calculations, trimmed and without POTCAR content. See `data/author/README.md`. Until supplied, parsers are tested on fixtures written to the documented formats, and the worked example is built with a visible "Illustrative data" badge. **Owner: author.**

## Q-009. Materials Project terms and scope
Confirm the current licence for redistributing derived data (believed CC BY 4.0 with attribution), API rate limits, and which subset to ship so the sharded data stays "a few MB gzipped". `mp-api 0.47.0` supports `db_version` snapshots; record the version and date used. Needs the author's API key (never committed). **Close:** M9.1 documents the terms and the chosen query in the data README.

## Q-010. PAW availability table
Which elements have recommended VASP PAW potentials in the PBE set (and their recommended names such as Ti_pv). Source is the VASP wiki "Available PAW potentials" page. Needed by the feasibility check. **Close:** M9.3 builds the table from the wiki with the page cited, or the author supplies the list.

## Q-011. Cost and toxicity flags data
Cost tiers need a cited price source (for example USGS Mineral Commodity Summaries, public domain) and toxicity flags need a cited list (for example EU RoHS restricted substances). Neither could be fetched. **Close:** author supplies the source tables, or the Studio ships without a cost filter and says so.

## Q-012. Oxidation-state data provenance
Common and uncommon oxidation states per element are needed for charge-balance checks. Candidates: pymatgen's `common_oxidation_states` / `oxidation_states` (MIT) or SMACT (MIT code, but its data may derive from ICSD statistics). Planning found that pymatgen's `Common oxidation states` lists only +2 for Cu (unusable: it would flag Cu(I) as unusual), while SMACT 4.0.2 ships ICSD 2024 occurrence counts that separate common from rare states sensibly (Cu +2 56 %, +1 41 %, +3 3 %; `tests/reference/element_reference.json`). Proposed: use the SMACT counts with a 10 % share threshold. Still open: whether redistributing statistics derived from ICSD needs more than attribution. **Close:** M8.2 adopts the proposal or another source, records it, and the author confirms the licence position.

## Q-013. VASPKIT 303 convention
The Workflow Handbook says VASPKIT 303 uses the same algorithm as SeeK-path (HPKOT). **Close (author, one run):** run `vaspkit -task 303` on a Cu fcc primitive cell and check that `KPATH.in` follows `Γ-X-U | K-Γ-L-W-X` (the HPKOT golden path), not `Γ-X-W-K-Γ-L-U-W-L-K | U-X`. If it differs, change D-005's default.

## Q-014. Pulay stress warning threshold
The convergence plotter warns when pressure is not converged where energy is. The threshold (default 5 kB) is a heuristic with no cited basis. **Close:** M4.1 either finds a citable guideline or keeps it adjustable and labelled "heuristic".

## Q-015. Firebase and GitHub wiring state
Is the Firebase project created, the GitHub repository variable `FIREBASE_PROJECT_ID` and secret `FIREBASE_SERVICE_ACCOUNT` set, and is the repository connected to the Firebase console? See `docs/SETUP_FIREBASE.md`. M0.2 cannot show a live deploy without them. **Owner: author.**

## Q-016. Mixed-site weighting
Mixed A or B sites use occupancy-weighted averages of ionic radius and of oxidation state (a documented, common convention, not a result from the tau paper). **Close:** M8.2 finds a citation for the convention used in the literature, or labels it "linear mixing convention" in the UI.

## Q-017. Erratum in the author's Workflow Handbook: odd versus even Monkhorst-Pack meshes
The "Input and output files" table lists "Odd MP meshes on hexagonal cells (use Gamma-centred)" as a common KPOINTS mistake. The numerical test says the opposite: with VASP's Monkhorst-Pack formula k = (2r - N - 1)/(2N), **odd N includes Gamma and is symmetric; even N is shifted off Gamma and breaks the point-group symmetry** of a hexagonal lattice (checked with spglib on P6_3/mmc Mg for N = 2 to 8; `tests/reference/pw_kmesh_reference.json`, `mesh_point_group_symmetry`). The same holds for the fcc primitive cell, but not for sc or bcc primitive cells. The handbook's advice (use Gamma-centred meshes for hexagonal and trigonal cells) is right; the word "odd" appears to be a slip for "even". **Close:** the author confirms; the site's text and the M3.2 hexagonal rule then say "even Monkhorst-Pack meshes". Until confirmed the rule is written as "Monkhorst-Pack meshes can break hexagonal symmetry, and even ones do" with this test as its evidence.

## Q-018. KPOINTS fully automatic ("Auto") length mode
The planned formula `N_i = max(1, int(R_k |b_i| + 0.5))`, with |b_i| the reciprocal lattice vector length **without** 2 pi, is recalled from the VASP wiki KPOINTS page and was not checked. **Close:** read the KPOINTS page (needs vasp.at), or the author runs VASP once with a KPOINTS file `Auto` / `0` / `Auto` / `20` on the fcc Cu primitive cell (|b| without 2 pi = 0.47979 1/Angstrom, so the recalled rule gives int(20 x 0.47979 + 0.5) = 10) and reports the mesh.

## Q-019. LMAXMIX missing from the handbook's SCF and band INCARs
The Workflow Handbook's dictionary says LMAXMIX = 4 (d) or 6 (f) is "vital for +U and for ICHARG = 11 runs on d/f systems", and its "ISTART and ICHARG" rule says LMAXMIX must be identical between the SCF and the ICHARG = 11 run. Its relaxation INCAR sets `LMAXMIX = 4`, but the "SCF (101 -> ST, edited)" and "route B run on KPATH.in" INCARs, written for the same magnetic d-element example (`MAGMOM = 2*5.0 4*0.6`), do not. Either the omission is deliberate (and the dictionary is too strong), or both INCARs should carry `LMAXMIX = 4`. The site's validator (V018) warns on the band INCAR either way. **Close:** the author decides; the presets and the content follow.
