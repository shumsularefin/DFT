# Open questions

Anything unverified goes here instead of being guessed. Format: ID, question, why it matters, how to close it, owner, status. Builders add new entries with the next free `Q-nnn` and point to them from `it.todo` tests. Do not delete an entry; mark it `closed` with the resolution.

| ID | Status | Owner |
|---|---|---|
| Q-001 | open | author |
| Q-002 | open | author + builder (M8.1) |
| Q-003 | closed | builder (needs arxiv access) or author (PDF) |
| Q-004 | closed | author (5-minute VASP run) |
| Q-005 | open | builder (M8.4) |
| Q-006 | closed | author |
| Q-007 | closed | author |
| Q-008 | open | author |
| Q-009 | open | author + builder (M9.1) |
| Q-010 | open | builder (M9.3, needs vasp.at) |
| Q-011 | open | author |
| Q-012 | open | builder (M8.2, M10.1) |
| Q-013 | closed | author (one VASPKIT run) |
| Q-014 | open | builder (M4.1) |
| Q-015 | closed | author |
| Q-016 | open | builder (M8.2) |
| Q-017 | closed | author (confirm erratum) |
| Q-018 | closed | builder (M3.2, needs vasp.at) or author (one run) |
| Q-019 | open | author |
| Q-020 | open | author or auditor (before any glossary or topic is marked verified) |
| Q-021 | open | builder (M11.2) |
| Q-022 | open | author or auditor |
| Q-023 | open | author |
| Q-024 | open | author or auditor |
| Q-025 | closed | builder (M6.1) |
| Q-026 | open | author or auditor |
| Q-027 | open | author or auditor |
| Q-028 | open | author |
| Q-029 | open | author |
| Q-030 | open | author |
| Q-031 | open | author |
| Q-032 | open | author |
| Q-033 | open | author |
| Q-034 | open | author |
| Q-035 | open | author |
| Q-036 | open | author |
| Q-037 | open | author |
| Q-038 | closed | author |
| Q-039 | open | author |
| Q-040 | open | author |
| Q-041 | closed | auditor |

## Q-001. Repository licence
Which licence for the code and which for the written content and data (a common split: MIT for code, CC BY 4.0 for original text)? Affects `LICENSE`, the footer and the references page. Until decided: no LICENSE file; `THIRD_PARTY_NOTICES.md` lists upstream licences. **Update 2026-11-04:** the secrets `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` are set (screenshot from the author) and the deploy workflow has succeeded on every merge to main since; the live site URL was not opened from the builder environment, so please confirm it shows the latest stage. **Owner: author.**

**Update 2026-11-11 (open-question sweep):** still the author's decision. Deploy confirmed: the "Deploy to Firebase Hosting" and CI workflows succeeded on every merge to main (latest: PR #28, run 42847082247).

## Q-002. Shannon radii: licence and completeness
The tolerance explorer bundles Shannon (1976) radii built from pymatgen's table (pymatgen is MIT; the numbers are Shannon's published data). Two things are unverified: (a) whether bundling a compiled copy of the table needs more than attribution; (b) completeness. pymatgen has 492 spin-resolved entries; check against the original table (Acta Cryst. A32, 751) or the Imperial College online database, listing any missing rows. 34 textbook anchor values agree, but they were written down after some pymatgen values had been seen, so that is a consistency check only; this question is about a genuinely independent comparison. **Close:** M8.1 diffs the dataset against the original and records the result here; the author confirms the licence position.

**Update 2026-11-11 (open-question sweep):** unchanged; the comparison belongs to M8.1, which has not started. arxiv.org and pmc.ncbi.nlm.nih.gov are now reachable from builder sessions.

## Q-003. Bartel tau: equation, threshold and radius conventions
Implemented from memory: tau = r_X/r_B - n_A (n_A - (r_A/r_B)/ln(r_A/r_B)), perovskite predicted when tau < 4.18 (Bartel et al., Sci. Adv. 5, eaav0693, 2019). The paper could not be fetched when the plan was made (arxiv.org and PMC unreachable). Also unconfirmed: which Shannon coordination numbers the paper used for A, B, X, and how it treats mixed oxidation states. Sanity values from the golden file look right (SrTiO3 3.80, CsPbBr3 4.10, CsPbI3 4.30). **Close:** read the paper (allow arxiv.org / pmc.ncbi.nlm.nih.gov, or the author attaches the PDF to the session); M8.2 must not be marked done until this is closed or the UI shows "formula not yet confirmed against the paper".

**Closed 2026-11-11.** Read Bartel et al. (arXiv:1801.07700, S-003): Eq. (2) is tau = r_X/r_B - n_A (n_A - (r_A/r_B)/ln(r_A/r_B)), r_A > r_B by definition, perovskite when tau < 4.18 ("decision boundary optimized using a decision tree"). Radii (Methods, "Radii assignment"): oxidation states are chosen from Shannon's allowed states by charge balance (if several pairs balance, the electronegativity ratio 0.9 < chi_C/chi_C' < 1.1 picks the pair minimising |n_C - n_C'|, otherwise maximising it), then the Shannon radius closest to coordination number 12 for A and 6 for B; the larger cation is A. For A2BB'X6, r_B is the arithmetic mean of the two B radii. M8.2 can implement this as read.

## Q-004. KSPACING and VASPKIT resolution to k-mesh rule
The rounding rule VASP applies for KSPACING and the one VASPKIT task 102 applies for its "resolution" (in 2 pi / Angstrom) could not be read (vasp.at unreachable). Candidates are in `tests/reference/pw_kmesh_reference.json` (`kspacing_candidates`: ceil, round half up, int plus 0.999). **Calibration (author, 5 minutes per run):** take fcc Cu with the primitive cell (a = 3.61 Angstrom, vectors (0,a/2,a/2), (a/2,0,a/2), (a/2,a/2,0)); each reciprocal vector has length |b| = 3.0146 1/Angstrom including 2 pi. Run VASP with `NSW = 0` and `KSPACING = 0.3`, no KPOINTS file, then read the mesh from OUTCAR (the line that starts `generate k-points for:` prints three integers; if your version words it differently, use the subdivisions in IBZKPT). Do three runs with `KSPACING = 0.3`, `0.28` and `0.30145` (ratios |b|/KSPACING = 10.0487, 10.7665, 10.0004). The expected mesh per rule is: **ceil 11, 11, 11**; **round-half-up 10, 11, 10**; **int(x + 0.999) 11, 11, 10**; **truncate 10, 10, 10**. The three runs together separate all four rules (the golden file holds the first three; truncation is listed for completeness). Report the integers. Do the same with `vaspkit -task 102` at resolution 0.04 and report the mesh it writes. **Close:** record the rule in D-016 and pin it in tests.

**Closed 2026-11-11 from the documentation.** The VASP wiki KSPACING page (S-019) gives N_i = max(1, ceiling(|b_i| 2 pi / KSPACING)); the VASPKIT tutorial (S-058) gives N = max(1, |b_i| / kpr) "rounded to the next integer greater than or equal to N". Both are the `ceil` rule, the code's default since D-016. The calibration run is no longer needed, though it would still be a welcome independent check.

## Q-005. Perovskite region boundaries
The t-mu map needs region boundaries from the literature. Derivable without a citation: mu >= sqrt(2) - 1 = 0.414 (octahedral hole), mu < sqrt(3) - 1 = 0.732 (cubic coordination), the classic radius-ratio limits. Widely quoted for t: roughly 0.8 to 1.0 for perovskites, cubic near 0.9 to 1.0, tilted below. Formability-window papers (for example Li et al. on ABO3 and ABX3 formability) are cited from memory only. **Close:** M8.4 reads and cites the exact windows, or labels the map regions "textbook ranges" and does not show window numbers it has not verified.

**Update 2026-11-11 (open-question sweep):** unchanged; belongs to M8.4.

## Q-006. Firebase Spark plan limits
v1 of the SPEC says hosting transfer is 10 GB per month in current sources but 360 MB per day in older ones. firebase.google.com was unreachable when checked, so neither is confirmed, nor the Firestore figures (1 GiB storage, 50K reads, 20K writes, 20K deletes per day) or whether Cloud Storage for Firebase is unavailable on Spark. **Design rule until closed:** assume the stricter 360 MB/day. **Close:** author opens the pricing page and records the current numbers here; M0.2 and M11.1 re-compute the page-weight budget against them.

**Closed 2026-11-11.** firebase.google.com/pricing (S-059), Spark column: Hosting 10 GB stored and **360 MB/day** transfer (the stricter figure the design already assumed); Firestore 1 GiB stored, 50K reads, 20K writes, 20K deletes per day; Cloud Storage "Not applicable" on Spark. No budget change needed.

## Q-007. Network access for builder sessions
Builders cannot verify against papers or the VASP wiki if the cloud environment blocks them. Suggested allowed domains: `vasp.at`, `www.vasp.at`, `arxiv.org`, `export.arxiv.org`, `doi.org`, `pmc.ncbi.nlm.nih.gov`, `firebase.google.com`, `docs.astro.build`, `github.com`, `raw.githubusercontent.com`, `spglib.readthedocs.io`, `pymatgen.org`, `docs.materialsproject.org`, `abulafia.mt.ic.ac.uk`. See `docs/SETUP_FIREBASE.md` section 5 for where to set it. Without it, stages still run but record "could not verify against source" items here. **Owner: author.**

**Closed 2026-11-11.** Builder sessions now reach vasp.at (wiki raw pages), arxiv.org, export.arxiv.org, doi.org, pmc.ncbi.nlm.nih.gov and firebase.google.com. vaspkit.com serves a certificate that fails verification intermittently; pages were read only over verified connections. Questions that needed the network were worked through in this sweep.

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

**Closed 2026-11-11.** The VASPKIT tutorial (S-058) states: "For the suggested k-paths of bulk materials, VASPKIT uses the same algorithm as seek-path website (Hinuma et al. 2017)". D-005's HPKOT default stands. An actual 303 run on fcc Cu would still be a nice confirmation.

## Q-014. Pulay stress warning threshold
The convergence plotter warns when pressure is not converged where energy is. The threshold (default 5 kB) is a heuristic with no cited basis. **Close:** M4.1 either finds a citable guideline or keeps it adjustable and labelled "heuristic".

**M4.1 update:** no citable guideline was found (the VASP wiki was unreachable). `pressureThresholdKb` defaults to 5 and is an option; the explanation text calls it heuristic. The question stays open until the author supplies a basis.

**Update 2026-11-11 (open-question sweep):** read the VASP wiki "Pulay stress" page (S-019): it explains the origin and says to converge ENCUT, but gives no numeric pressure threshold. The 5 kB value stays adjustable and labelled heuristic.

## Q-015. Firebase and GitHub wiring state
Is the Firebase project created, the GitHub repository variable `FIREBASE_PROJECT_ID` and secret `FIREBASE_SERVICE_ACCOUNT` set, and is the repository connected to the Firebase console? See `docs/SETUP_FIREBASE.md`. M0.2 cannot show a live deploy without them. **Owner: author.**

**Closed 2026-11-11.** The project is wired: CI and "Deploy to Firebase Hosting" succeeded on every merge to main (PRs 25 to 28). `.firebaserc` keeps a placeholder on purpose; the workflow takes the ID from the `FIREBASE_PROJECT_ID` variable.

## Q-016. Mixed-site weighting
Mixed A or B sites use occupancy-weighted averages of ionic radius and of oxidation state (a documented, common convention, not a result from the tau paper). **Close:** M8.2 finds a citation for the convention used in the literature, or labels it "linear mixing convention" in the UI.

**Update 2026-11-11 (open-question sweep):** partial citation found: Bartel et al. (S-003) take r_B as the arithmetic mean of the two B-site radii for A2BB'X6 and note that the geometric mean changes the label for only 14 of 918 compounds. That supports linear mixing of radii for equal occupancy. Occupancy-weighted oxidation states remain a convention; M8.2 cites S-003 for radii and labels the rest "linear mixing convention".

## Q-017. Erratum in the author's Workflow Handbook: odd versus even Monkhorst-Pack meshes
The "Input and output files" table lists "Odd MP meshes on hexagonal cells (use Gamma-centred)" as a common KPOINTS mistake. The numerical test says the opposite: with VASP's Monkhorst-Pack formula k = (2r - N - 1)/(2N), **odd N includes Gamma and is symmetric; even N is shifted off Gamma and breaks the point-group symmetry** of a hexagonal lattice (checked with spglib on P6_3/mmc Mg for N = 2 to 8; `tests/reference/pw_kmesh_reference.json`, `mesh_point_group_symmetry`). The same holds for the fcc primitive cell, but not for sc or bcc primitive cells. The handbook's advice (use Gamma-centred meshes for hexagonal and trigonal cells) is right; the word "odd" appears to be a slip for "even". **Close:** the author confirms; the site's text and the M3.2 hexagonal rule then say "even Monkhorst-Pack meshes". Until confirmed the rule is written as "Monkhorst-Pack meshes can break hexagonal symmetry, and even ones do" with this test as its evidence.

**Closed 2026-11-11.** The VASP wiki KPOINTS page (S-019) says for hexagonal lattices: "Avoid Monkhorst-Pack meshes with an even number of in-plane subdivisions", and that the Monkhorst-Pack mode "adds a further shift of 1/2 that breaks the threefold symmetry" for even subdivisions. The erratum is confirmed; the site's text now cites the wiki instead of this question. The author may want to correct the word "odd" in their own handbook file.

## Q-018. KPOINTS fully automatic ("Auto") length mode
The planned formula `N_i = max(1, int(R_k |b_i| + 0.5))`, with |b_i| the reciprocal lattice vector length **without** 2 pi, is recalled from the VASP wiki KPOINTS page and was not checked. **Close:** read the KPOINTS page (needs vasp.at), or the author runs VASP once with a KPOINTS file `Auto` / `0` / `Auto` / `20` on the fcc Cu primitive cell (|b| without 2 pi = 0.47979 1/Angstrom, so the recalled rule gives int(20 x 0.47979 + 0.5) = 10) and reports the mesh.

**Closed 2026-11-11.** The VASP wiki KPOINTS page, "Fully automatic mesh": N_i = int(max(1, R_k |b_i| + 0.5)), with b_i . a_j = delta_ij (no 2 pi), and the note that R_k = 2 pi / KSPACING makes it similar to KSPACING. That is the formula in `meshFromLength`; the `it.todo` is replaced by tests.

## Q-019. LMAXMIX missing from the handbook's SCF and band INCARs
The Workflow Handbook's dictionary says LMAXMIX = 4 (d) or 6 (f) is "vital for +U and for ICHARG = 11 runs on d/f systems", and its "ISTART and ICHARG" rule says LMAXMIX must be identical between the SCF and the ICHARG = 11 run. Its relaxation INCAR sets `LMAXMIX = 4`, but the "SCF (101 -> ST, edited)" and "route B run on KPATH.in" INCARs, written for the same magnetic d-element example (`MAGMOM = 2*5.0 4*0.6`), do not. Either the omission is deliberate (and the dictionary is too strong), or both INCARs should carry `LMAXMIX = 4`. The site's validator (V018) warns on the band INCAR either way. **Close:** the author decides; the presets and the content follow.

## Q-020. Glossary definitions and the sample topic are unverified
The 70 glossary terms in `src/data/glossary.json` (modules 1 to 3; 14 added in M2.2, 9 in M2.3, 6 in M2.4) were written in plain language from general textbook knowledge and each points at a register source (S-011, S-012, S-018, S-031, S-047 to S-050, S-008, S-010), but no source has been read for these specific wordings: the register marks most of them `cited-from-memory`. The sample topic's one factual claim (the Planck constant is fixed exactly by the definition of the SI units) cites S-031 (`cross-checked` for hbar and m_e only). **Close:** the author or auditor reads the definitions against the cited books, edits wording where needed, and upgrades the sources' status in `docs/SCIENCE_SOURCES.md`. Until then the glossary page says its definitions are drafts.

## Q-021. MathML fonts
Build-time MathML (D-008) renders correctly in Chromium on the build machine, but the Greek letter nu in $E = h\nu$ looks like a Latin v in the body font. The topic stylesheet lists math fonts (Cambria Math, STIX Two Math, Latin Modern Math, Noto Sans Math) that were not available to test. **Close:** M11.2 checks MathML in WebKit and Firefox, and per D-008 switches a formula to `htmlAndMathml` with the needed KaTeX fonts if one renders poorly.

## Q-022. Formal scaling exponents in the cost-of-exactness lab
The lab (`src/lib/physics/scaling.ts`) draws Kohn-Sham DFT as N^3 (S-049) and Hartree-Fock N^4, MP2 N^5, CCSD N^6, CCSD(T) N^7 (S-048). These are standard textbook formal scalings recalled from memory; both books are `cited-from-memory` in the register and no page was read. The force-field curve (roughly linear) and the exact-solution curve (exponential shape, arbitrary rate) are drawn as "qualitative" and claim no number. **Close:** the author or auditor checks the exponents against S-048 and S-049 (page numbers go in the register notes), and confirms that "Hartree-Fock N^4" is the form meant (formal, not the effective scaling of modern codes). **Owner: author or auditor.**

## Q-023. Module 1 wording that needs a human check
Statements in `src/content/handbook/01-why-dft/` that rest on general knowledge and the cited-from-memory register, not on a page that was read: (1) common functionals underestimate band gaps (S-027, S-025); (2) ground-state DFT says nothing directly about excited states (S-011); (3) VASP is commercial and needs a licence (S-010); (4) hybrid functionals cost more than semilocal ones (S-025); (5) the Materials Project example (S-024). Also the "Why this site exists" note on the roadmap page is the author's story, paraphrased from SPEC section 1, in third person. **Close:** the author reads the roadmap note and the four pages, edits the wording, and the auditor checks claims 1 to 5 before any Module 1 topic is set to `verified`. **Owner: author.**

## Q-024. Module 2 wording and numbers that need a human check
Statements in `src/content/handbook/02-quantum-basics/` that rest on general knowledge and the `cited-from-memory` register (S-047, S-050, S-036, S-049) and not on a page that was read: (1) electron diffraction shows the wave side of electrons; (2) the 1.2264 angstrom wavelength at 100 eV is computed from hbar^2/2m (S-031, tested) and matches the textbook 12.264/sqrt(E) rule; (3) hydrogen energy depends only on n, so shells are degenerate, and the node counts n-l-1 radial and l angular; (4) shell capacity 2n^2 and 2, 6, 10, 14 per subshell (tested against the orbital list); (5) that parallel spins are favoured in degenerate levels and that this underlies magnetic atoms and iron; (6) that VASP assumes closed-shell pairing unless `ISPIN = 2` and that this raises cost; (7) that VASP projects onto s, p and d character; (8) band, gap and metal versus insulator sketch (S-050, S-036) and that common DFT approximations underestimate gaps (S-049); (9) VASP tag names `ENCUT`, `ISMEAR`, `SIGMA`, `CHGCAR`, `WAVECAR`. **Close:** the author or auditor reads these against the cited books and the VASP wiki, edits wording, and upgrades the register status.

## Q-025. Module 1 questions have fewer than four items per concept
`src/data/questions/module-01.json` (M2.2) has 17 questions, 3 to 5 per topic, but the concept tags are finer than that, so some concepts (for example `simulation`) have only 2. CONTENT_GUIDE section 7 asks for four per concept. The shape test enforces this for module 2 only. **Close:** add questions or merge concept tags for module 1 and enable the check for it (`perConcept` in `questions.test.ts`).

**Closed (M6.1):** module 1 concept tags merged (`materials-from-atoms`, `quantum-mechanics` into `simulation`; `scaling` into `method-ladder`; `ground-state` into `dft-scope`; `vasp-workflow` into `roadmap`) and four `how-to-use` questions added; every published concept now has at least four questions and `lint-questions.mjs` enforces it.

## Q-026. Module 3 wording that needs a human check
Statements in `src/content/handbook/03-many-electrons/` that rest on general knowledge and the `cited-from-memory` register (S-011, S-048, S-049, S-012, S-047), not on a page that was read: (1) the electronic Hamiltonian written in the many-electron page and the role of the pair repulsion term; (2) the Born-Oppenheimer wording; (3) "full configuration interaction mixes all determinants and its count is C(M, N)" (S-048), and that symmetry only reduces the count by a modest factor; (4) the density definition n(r) = N times the integral over the other coordinates (S-048); (5) the one-electron formula V = E + (hbar^2/2m) psi''/psi (derived from the Schrodinger equation, tested numerically, but the statement that it is the one-electron case of Hohenberg-Kohn is from S-011 memory); (6) Hohenberg-Kohn stated for a non-degenerate ground state; (7) the Kohn-Sham energy split E = T_s + int v n + E_H + E_xc (S-012) and that only E_xc is unknown; (8) VASP facts: `CHGCAR` holds the density, `NELECT` defaults from POTCAR valence electrons, only valence electrons explicit, `GGA` tag. **Close:** the author or auditor reads these against the cited books and the VASP wiki, and upgrades the register status.

## Q-027. M3.1 inputs that could not be verified, and one work-order number that is wrong
(1) The work order (M3-input-builder.md, M3.1 tests) says an fcc primitive cell with a = 3.61 has volume 11.7607 A^3 "(a^3/4)". But 3.61^3 / 4 = 11.76147. The test uses a^3/4 computed in code and 11.76147 to 4 decimals, not 11.7607; the tolerance was not loosened to fit the stated number. **Close:** the author corrects the work order. (2) `src/data/atomic-masses.json` is generated from pymatgen's element table (S-034), which derives from IUPAC standard atomic weights; it was not compared with the IUPAC publication (offline), and conventional single values stand in for weight intervals. Density in g/cm^3 uses CODATA 2018 u in grams (S-031). **Close:** compare a handful of elements against the IUPAC table and upgrade the register status.

**Update 2026-11-11 (open-question sweep):** (1) done: the work order now says 11.76147. (2) still open.

## Q-028. M3.3 tag data the handbooks do not state
(1) About 40 of the 71 tags have default "Not stated in the handbooks" and every tag has vaspVersion "6.x" with a note that the minimum version was not checked; the vasp.at wiki was not read. The author should fill these from the wiki (S-019). (2) Tag `handbook` links are null until the handbook pages exist. (3) The beginner and "what breaks" texts are new wording and need author review. (4) Left out on purpose: the two phonopy config blocks (band.conf, mesh.conf; not INCAR), the Field Handbook OUT, INP, TROUBLE and RECIPES records (belong to M4 and later stages), and the 20 Workflow error rows (M3.4 rules).

**Update 2026-11-11 (open-question sweep):** item (1): 34 of the 35 tags without a handbook default now carry the default from their VASP wiki page (TAGDEF/DEF line, S-019), marked "(VASP wiki, TAG page)" in `src/data/vasp-tags.json` (table in `scripts/build/build-vasp-data.mjs`). IDIPOL has no default on the wiki and stays "not stated". Minimum versions and items (2) to (4) remain open.

## Q-029. M3.4 judgement calls to confirm
(1) V010: the work order says NSW > 0 with IBRION absent is an error, but the Field Handbook states the default is -1 when NSW <= 1 (no molecular dynamics). The rule fires for NSW > 1 only. (2) V013: any NCORE value counts as set, including NCORE = 1; the handbooks say to comment it out. Confirm NCORE = 1 is also unwanted. (3) V003, V018: the d and f element lists are standard chemistry, not taken from a handbook; confirm Lu, Lr and group 12 are classed as you want. (4) V004 counts the full k-mesh, not the symmetry-reduced count, so a mesh just at 4 points can still fail in VASP. (5) V007 treats an absent SIGMA as 0.2 as the handbooks state. (6) V027 does not judge AEXX or HFSCREEN when absent because the handbooks do not state their defaults. (7) While writing M3.4, the M3.3 tag text for LEPSILON and LELF said NCORE = 1; the handbook says to comment NCORE out, so the text was corrected.

**Update 2026-11-11 (open-question sweep):** for (6): the wiki gives AEXX = 0.25 when LHFCALC = .TRUE. and HFSCREEN = 0 by default (Q-028). V027 could now judge absent values; that is a validator change for the author to approve.

## Q-030. M3.6 file explorer: statements to confirm against the VASP wiki
(1) ENMIN: the work order lists it for the POTCAR header panel, but neither handbook describes it, so the panel says it is not explained yet. Provide a sourced sentence. (2) The POSCAR, KPOINTS and INCAR line explanations in `src/lib/vasp/annotate.ts` follow the VASP wiki file-format pages from memory (S-019 is cited-from-memory, Q-007). Check in particular: a negative scale means target volume; three scale values scale x, y, z; Auto-mode length gives a denser mesh when larger (the formula itself is Q-018). (3) OSZICAR and OUTCAR-excerpt kinds have no default annotations until M4.1 supplies parsers; callers can pass their own.

**Update 2026-11-11 (open-question sweep):** (1) ENMIN now has a sourced sentence (VASP wiki ENMIN and POTCAR pages: the minimum viable cutoff; the largest ENMIN applies; used by default only with PREC = Low). (2) POSCAR page confirms: a negative scale is the target volume, three scale values scale x, y and z (all must be positive). KPOINTS Auto mode: closed with Q-018. (3) unchanged.

## Q-031. M4.1 judgement calls and unvalidated formats
(1) Every OSZICAR and OUTCAR line pattern was written from the handbooks and the work order and tested on hand-written fixtures plus the generated OSZICAR golden file; none was run on a real VASP output (Q-008). Please supply real trimmed files in `data/author/`. (2) D-014 says a series with no earlier qualifying point is "only-last-point". Read literally, that case is exactly "not converged" (the last index always qualifies vacuously), so `analyzeSeries` returns `not-converged` and the `only-last-point` status is never produced; it stays in the type. Confirm, or say what distinction was meant (for example, converged at the second-to-last point, which currently gives `converged` plus a warning that one later point confirms it). (3) `monotonic` means the distance to the final value never grows from one point to the next. (4) Series with no `natoms` are treated as per atom as given, with a warning. (5) A noncollinear `mag=` line with three numbers keeps only the first.

## Q-032. M4.2 convergence series: judgement calls to confirm
(1) ENCUT grid: the work order says the series always includes the value nearest 1.3 x ENMAX rounded to 10, yet `encutSeries(400)` must equal the author's seven values (which lack 520) while `encutSeries(520)` must contain 680. Implemented as: when ENMAX is a multiple of 50 the plain 50 eV grid is returned; otherwise 1.3 x ENMAX rounded to 10 is added when missing. Confirm this is the intended rule. (2) The "size check" warning fires above 100000 atom x k-point units (full mesh, summed over runs). The number is a user-interface threshold, not a measured cost; replace it if you have timings from your cluster. (3) `collect.sh` prints `label,E_sigma0,pressure_kB,nions`, taking pressure as field 4 of the `external pressure` line and NIONS as the last field of the first `NIONS` line; checked on hand-written OUTCAR lines only (same caveat as Q-031). (4) The plotter (M4.3) must take x from the label (`encut_450`, `kpt_0.04`) because `collect.sh` has no x column; `parseSeriesLabel` already does this.

## Q-033. M4.3 convergence plotter: statements to confirm
(1) The explanation text (why the setting matters, the Pro note that differences rather than total energy converge) is written from the handbook's convergence section and D-014; confirm the wording. (2) The 1.3 x ENMAX advice is shown for ENCUT series only; confirm it should not also appear when a relaxation is not planned. (3) OSZICAR files give F and E0 only, so "energy without entropy" is not available from them and the row is skipped for that quantity; say if you want a fallback. (4) File and folder naming (`encut_450`, `kpt_0.04`, `kpt_6x6x6`) is the only way x is read from files; other names need the table. (5) Only OSZICAR and OUTCAR formats from the hand-written fixtures were tested (Q-031).

## Q-034. M4.4 ENCUT lab: statements to confirm
(1) The work exponent 1.5 in the scaling hint is a rule of thumb, not sourced; confirm or give a source (S-049, S-050 are cited from memory). (2) The toy potential strengths (Kronig-Penney 6 eV, width 1 Angstrom in a 4 Angstrom cell; cosine 2 eV) are chosen only to give a visible curve; confirm that is acceptable for teaching. (3) Whether the lab should also show VASP's own plane-wave count (NPLWV, reported in OUTCAR) once real output is available; VASP's basis includes a different G-grid convention for FFT, which was not verified here.

## Q-035. M4.5 k-point mesh lab: statements to confirm
(1) The lab counts irreducible points from the lattice point group only; a real crystal with atoms can have fewer operations (M5.1 will use spglib or moyo). The notice says so; confirm the wording. (2) The Monkhorst-Pack set uses VASP's formula (shift on even n only); other codes shift differently. (3) The "metals need denser meshes" explanation (Fermi surface cuts the zone, algebraic versus exponential decay) is supported by the toy numbers and standard teaching (S-049) but the claim for real metals is not tested here; confirm it may be stated at that level. (4) The reference for the toy plot is a 600 by 600 mesh except for the unsmeared metal (exact -8t/pi^2); confirm that is acceptable.

## Q-036. M5.1 CIF fixtures and sources to confirm
(1) `tests/reference/cif/triclinic_P1bar.sym.cif` stores the cell angles 82, 85, 79 degrees while `expected.json` (and the P1 file) list 82, 95, 101; the volume (130.7089) and the space group (P-1) agree, so it is an equivalent cell and the parser is right to read what the file says. The test skips only the angle comparison for that file; the golden file was not edited. Please confirm that the generator (`scripts/reference/gen_cif_fixtures.py`) intends the symmetrized writer to re-reduce the cell. (2) S-054 (XYZ format) is cited from memory; the format is informal, confirm the extended-XYZ `Lattice=` convention. (3) The CIF grammar is the subset in S-034 (no `save_` frames, no Cartesian-only atom lists); confirm that is acceptable for user uploads.

## Q-037. M5.3 HPKOT sources to confirm
(1) The port follows SeeK-path 2.2.2 code and tables and reproduces its output for 39 structures; it was **not** checked against the paper itself (S-006), so a table entry that SeeK-path and the paper disagree on would not be caught. **Close (author, ~15 min):** send me Hinuma et al. 2017 (arXiv:1602.06402) and I compare the 29 point tables and Table 3 with `variants.json`. (2) The paper's Niggli step (Grosse-Kunstleve et al. 2004, S-055) was not read; the port follows spglib's C code, whose result agrees with SeeK-path on the 4 triclinic cells. (3) SeeK-path's own edge-case behaviour for exact ties (for example `a == c` in tI, or exactly 90 degree reciprocal angles in aP) is reproduced, but only the tI case is exercised by a test constructed at the boundary; the others are covered by the same code path, not by separate fixtures. (4) Q-013 (does VASPKIT 303 really use HPKOT) is still open.

**Update 2026-11-11 (open-question sweep):** (1) done: all 29 variants in `variants.json` (points, parameter formulas, recommended paths, Tables 67 to 92) and every P and P^-1 matrix of Table 3 were compared with the arXiv version of the paper by eye, table by table. No difference. (4) closed with Q-013. (2) and (3) remain.

## Q-038. M5.4 Setyawan-Curtarolo sources to confirm
(1) The port reproduces pymatgen (39 golden structures, 20 of the 23 variants) but the 23 tables were **not** compared with the paper (S-005). **Close (author, ~15 min):** send me Setyawan and Curtarolo 2010 (arXiv:1004.2974) and I compare Table 2 and the appendix formulas with `setyawan.ts`. (2) orcf3, mclc2 and mclc4 are not in the golden file. orcf3 and mclc2 are tested with cells built on the boundary (variant, path, a key point); for mclc4 a numerical scan found that with the equality b cos(a)/c + b^2 sin^2(a)/a^2 = 1 and alpha < 90 the reciprocal gamma is never below 90, so no real cell seems to reach it. Its table is therefore checked only against the pymatgen source (an `it.todo` names this question). Confirm that mclc4 is meant to be a degenerate case. (3) The three deliberate differences in D-048. (4) pymatgen `kpath.py` has a `hin_tol`-free path for triclinic cells whose reciprocal angles are mixed; pymatgen returns no path there and we throw. Not exercised by any golden structure.

**Closed 2026-11-11.** (1) All 23 variants in `setyawan.ts` were compared with Tables 2 to 21 and Figures 1 to 25 of arXiv:1004.2974: points, parameter formulas and paths agree. One cosmetic difference: Table 17 lists F_3 for MCLC1 as well as MCLC2; the code defines it for MCLC2 only. F_3 is on neither path, so no output changes. (2) The paper defines MCLC4 by an equality (b cos alpha/c + b^2 sin^2 alpha/a^2 = 1), so it is a boundary case by construction, as the scan found. (3) D-048 stays a documented decision. (4) The paper's TRI variants cover only all-acute, all-obtuse and the 90-degree cases, so throwing on mixed reciprocal angles matches the paper.

## Q-039. M5.6 VASPKIT KPATH.in layout and other items to confirm
(1) The `KPATH.in` download is VASPKIT-style (the same line-mode content as KPOINTS, which the protocol in S-042 relies on with `cp KPATH.in KPOINTS`); the exact layout VASPKIT writes was **not** compared with a real file. **Close (author, ~5 min):** send me a `KPATH.in` that VASPKIT wrote and I compare it with `writeKpathIn`. An `it.todo` names this question. (2) VASP line mode takes one point count for the whole file, so hand-set per-segment counts apply to the table, the animation and the CSV/JSON but a KPOINTS file uses the largest count; the page says so. Confirm that is the behaviour you want (D-050). (3) The `KPOINTS_OPT` route A/B text follows your protocol (S-042); please check the wording matches how you run it.

**Update 2026-11-11 (open-question sweep):** (1) done: `writeKpathIn` now writes the layout shown in the VASPKIT tutorial (S-058): `Line-Mode`, 15-column numbers with 10 decimals, bare labels, a blank line between segments; a test reproduces a documented row character for character. (2) and (3) still need the author.

## Q-040. Contact route for deleting a sync account
With sync on (M6.5), "Delete my synced data" removes the Firestore record, but the Firebase Authentication account (Google id and email) can only be deleted by the site owner in the Firebase console, and the site has no contact route. **Close:** the author adds a contact (email or form) to `/about/` and `/privacy/`, or decides that the Auth record may be deleted by the user from the client (`deleteUser`, which needs a recent sign-in) and a stage adds that button.


## Q-041. Sign convention of Marzari-Vanderbilt cold smearing
`src/lib/physics/smearing.ts` uses x = (epsilon - mu)/sigma and the broadened delta function exp(-(x + 1/sqrt2)^2)(2 + sqrt2 x)/sqrt(pi), which is the form in the work order, exp(-(u - 1/sqrt2)^2)(2 - sqrt2 u)/sqrt(pi), with u = (mu - epsilon)/sigma = -x. The u convention was taken from the widely used implementation in Quantum ESPRESSO (`w0gauss` with `ngauss = -1`), not read from S-016 (paywalled, network unavailable). The tests check the convention-independent properties (integral 1, zero first moment) and that occupations are never negative but exceed 1 below the Fermi level, the property cold smearing was designed for. **Close:** read S-016 and confirm that the paper's variable is (mu - epsilon)/sigma; if it is the other sign, mirror the function and the "never negative" test.

**Closed 2026-11-11.** Eq. (1) of the paper (arXiv:cond-mat/9903147) is delta(x) = (1/sqrt pi) exp(-(x - 1/sqrt2)^2)(2 - sqrt2 x) with x = (mu - epsilon)/sigma, exactly the u convention in the code. A test now evaluates Eq. (1) in the paper's own variable and checks the code against it.

## Q-042. M7.4 error finder: statements to confirm
(1) Nine entries (job died, MD instead of relax, entropy, Pulay, slab, AFM, imaginary phonons, elastic, too few bands and similar) have no printed VASP message in the handbooks, so they match by keywords only; no exact strings were invented. Send real log lines to add them. (2) Workflow rows such as "ERROR: the number of k-points / bands changed, WAVECAR mismatch" and "TOO FEW BANDS" are handbook labels, not confirmed VASP output; the first is kept as a message string, the second is symptom text only. (3) The Beginner cut (first cause, first two fixes) is an editorial choice. (4) Wording of the six topics, especially the Heuristic notes, needs your check.
