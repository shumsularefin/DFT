// Builds src/data/errors.json from the two extracted handbooks (M7.4).
// Run: node scripts/build/build-errors.mjs
// Text comes from scripts/__generated__/*.json (S-041 troubleshooting, S-042 error index). Only the merge
// map, categories, message strings and one-line plain explanations are authored here.
import { readFileSync, writeFileSync } from 'node:fs';

/** Field Handbook fix texts replaced by the Workflow Handbook's advice (D-110). */
const FIX_TEXT = {
  'Change ALGO (e.g. Normal → Fast, or All).':
    'Change ALGO to All, or back to Normal if it was Fast (the Workflow Handbook lists Fast as a cause of this error and avoids it for magnetic or +U systems).',
};

const field = JSON.parse(readFileSync('scripts/__generated__/field-handbook.json', 'utf8'));
const work = JSON.parse(readFileSync('scripts/__generated__/workflow-handbook.json', 'utf8'));
const fieldById = new Map(field.TROUBLE.flatMap((p) => p.items.map((i) => [i.id, i])));
const rowId = (n) => `w-${String(n).padStart(2, '0')}`;
const rows = work.errors.map((e, i) => ({ ...e, id: rowId(i + 1) }));
const row = (n) => rows[n - 1];

const clean = (s) => s.replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<[^>]+>/g, '');
const splitFix = (s) =>
  s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

// [id, category, fieldId|null, workflowRows[], messages, keywords, plain, extraCauses, extraFixes, incarByFixText]
const E = [
  [
    'job-died',
    'start-up',
    't-crash',
    [],
    [],
    ['job died', 'crashed', 'killed', 'no output', 'where to look'],
    'The run stopped and you do not know why. VASP writes its errors to the screen log, not to OUTCAR, so start there.',
    [],
    [],
    {},
  ],
  [
    'wavecar-mismatch',
    'start-up',
    't-wavecar',
    [16],
    ['Error reading WAVECAR', 'the number of k-points / bands changed, WAVECAR mismatch'],
    ['wavecar', 'restart', 'istart'],
    'VASP tried to reuse the saved wavefunctions from an earlier run, but the file is broken or does not match this run.',
    ['Reading WAVECAR from a different setup (workflow handbook).'],
    [],
    { 'Delete the WAVECAR, or set ISTART = 0.': { ISTART: '0' } },
  ],
  [
    'ions-too-close',
    'start-up',
    't-ions',
    [13],
    ['The distance between some ions is very small'],
    ['overlapping atoms', 'duplicate atoms', 'scale', 'cartesian direct'],
    'Two atoms sit almost on top of each other, which nearly always means the structure file was read wrongly.',
    ['Duplicate sites from a CIF (workflow handbook).'],
    [],
    {},
  ],
  [
    'ibzkpt-lattice-class',
    'symmetry-kpoints',
    't-ibzkpt',
    [],
    [
      'VERY BAD NEWS! internal error in subroutine IBZKPT',
      'Reciprocal lattice and k-lattice belong to different class of lattices',
    ],
    ['ibzkpt', 'monkhorst', 'k mesh symmetry', 'hexagonal'],
    'The k-point mesh does not have the same symmetry as the crystal, so VASP cannot reduce it.',
    [],
    [],
    { 'Last resort: ISYM = 0.': { ISYM: '0' } },
  ],
  [
    'tetrahedron-few-kpoints',
    'symmetry-kpoints',
    't-tetra',
    [11],
    [
      'Tetrahedron method fails for NKPT<4',
      'Tetrahedron method fails (number of k-points < 4)',
      'Tetrahedron method fails',
    ],
    ['tetrahedron', 'ismear -5', 'few k points', 'gamma only'],
    'The tetrahedron method needs at least four distinct k-points and your run has fewer.',
    ['ISMEAR = -5 set somewhere, for example copied from another INCAR (workflow handbook).'],
    [],
    { 'Use ISMEAR = 0 with SIGMA = 0.05.': { ISMEAR: '0', SIGMA: '0.05' } },
  ],
  [
    'relax-became-md',
    'ionic',
    't-md',
    [],
    [],
    ['temperature', 'T=', 'molecular dynamics', 'atoms fly', 'ibrion default'],
    'You asked for several ionic steps without choosing a relaxation method, so VASP ran molecular dynamics.',
    [],
    [],
    { 'Set IBRION = 2 (or 1) explicitly in every relaxation INCAR.': { IBRION: '2' } },
  ],
  [
    'primitive-cell',
    'symmetry-kpoints',
    't-prim',
    [9],
    ['PRICEL: found a more primitive cell', 'Found a more primitive cell'],
    ['primitive cell', 'bravais', 'supercell'],
    'VASP found that your cell is a repeat of a smaller one. That is fine for a supercell you built on purpose.',
    [],
    [],
    {},
  ],
  [
    'scf-not-converging',
    'electronic',
    't-scf',
    [],
    [],
    ['nelm', 'not converge', 'charge sloshing', 'oscillates', 'stalls', 'scf'],
    'The electronic loop keeps going without settling, which is usually a sign that the structure or the mixing needs attention.',
    [],
    [],
    {
      'ALGO = All (or Damped), and raise NELM to 150–200.': { ALGO: 'All', NELM: '200' },
      'Reduce mixing: AMIX = 0.1, BMIX = 0.0001 (linear mixing for slabs and charge sloshing); for magnets also AMIX_MAG = 0.4, BMIX_MAG = 0.0001.':
        { AMIX: '0.1', BMIX: '0.0001' },
    },
  ],
  [
    'davidson-zhegv',
    'electronic',
    't-zhegv',
    [2, 3],
    [
      'Sub-Space-Matrix is not hermitian in DAV',
      'Sub-Space-Matrix is not hermitian',
      'Error EDDDAV: Call to ZHEGV failed',
      'EDDDAV: Call to ZHEGV failed',
    ],
    ['davidson', 'eddav', 'subspace', 'hermitian', 'zhegv'],
    'The numerical solver for the electron states broke down, often because of a bad structure or a clumsy starting point.',
    ['Ill-conditioned subspace, often bad geometry or random start (workflow handbook).'],
    ['ALGO = All or Damped, delete WAVECAR, check interatomic distances (workflow handbook).'],
    { 'Restart without WAVECAR (ISTART = 0).': { ISTART: '0' } },
  ],
  [
    'brmix',
    'electronic',
    't-brmix',
    [6],
    [
      'BRMIX: very serious problems the old and the new charge density differ',
      'BRMIX: very serious problems',
    ],
    ['brmix', 'charge density differ', 'mixer'],
    'The charge density that was read in does not belong to the structure now being calculated.',
    ['CHGCAR or WAVECAR from a different structure (workflow handbook).'],
    [],
    {
      'Restart without CHGCAR/WAVECAR (ICHARG = 2, ISTART = 0).': { ICHARG: '2', ISTART: '0' },
      'Set ISYM = 0 if symmetry changes between steps.': { ISYM: '0' },
    },
  ],
  [
    'large-entropy',
    'electronic',
    't-entropy',
    [],
    [],
    ['entropy', 'eentro', 't*s', 'sigma too large'],
    'The smearing is so wide that the smeared energy no longer matches the energy at zero smearing.',
    [],
    [],
    {
      'For insulators use ISMEAR = 0 with SIGMA = 0.05, or ISMEAR = −5 for static runs.': {
        ISMEAR: '0',
        SIGMA: '0.05',
      },
    },
  ],
  [
    'relax-not-finishing',
    'ionic',
    't-relax',
    [],
    [],
    ['not finish', 'nsw reached', 'forces oscillate', 'ediffg', 'required accuracy'],
    'The relaxation keeps stepping without reaching your force target.',
    [],
    [],
    {
      'Tighten EDIFF (1E-6 or 1E-7) and set NELMIN = 4–6.': { EDIFF: '1E-6', NELMIN: '4' },
      'Reduce POTIM to ~0.1.': { POTIM: '0.1' },
      'Switch IBRION = 2 → 1 for the final steps (or 3 for poor starts).': { IBRION: '1' },
      'Use PREC = Accurate and LREAL = .FALSE. for small cells; test ADDGRID.': {
        PREC: 'Accurate',
        LREAL: '.FALSE.',
      },
    },
  ],
  [
    'zbrent',
    'ionic',
    't-zbrent',
    [1],
    ['ZBRENT: fatal error in bracketing'],
    ['zbrent', 'bracketing', 'line search', 'conjugate gradient'],
    'The relaxation algorithm could not find the bottom of the energy valley along its search direction.',
    ['Line minimization in CG failed; poor forces or step (workflow handbook).'],
    [],
    { 'Tighten EDIFF.': { EDIFF: '1E-6' }, 'Switch to IBRION = 1, or reduce POTIM.': { IBRION: '1' } },
  ],
  [
    'pulay-stress',
    'ionic',
    't-pulay',
    [],
    [],
    ['pulay', 'volume changes', 'isif 3', 'external pressure', 'static energy disagrees'],
    'The basis set was fixed for the starting cell, so a cell that changes size feels a false pressure.',
    [],
    [],
    {},
  ],
  [
    'slab-vacuum-collapse',
    'ionic',
    't-slab',
    [],
    [],
    ['slab', 'vacuum', 'isif 3', 'c axis shrinks'],
    'The cell was allowed to change shape, and with nothing resisting, the empty layer was squeezed away.',
    [],
    [],
    { 'Use ISIF = 2 for slabs, surfaces and molecules in a box.': { ISIF: '2' } },
  ],
  [
    'moment-collapse',
    'magnetism',
    't-moment',
    [18],
    [],
    ['moment collapses', 'mag=0', 'magnetic moment zero', 'ispin', 'magmom'],
    'The magnetic moment fell to zero, either because spin was not switched on or because the starting guess was too small.',
    ['Starting MAGMOM too small, or the non-magnetic state really is lower (workflow handbook).'],
    ['Start at 3–5 μB and compare energies (workflow handbook).'],
    { 'Check ISPIN = 2.': { ISPIN: '2' } },
  ],
  [
    'afm-ends-fm',
    'magnetism',
    't-afm',
    [],
    [],
    ['antiferromagnetic', 'afm', 'ferromagnetic', 'moments equal', 'magmom order'],
    'An antiferromagnetic start turned ferromagnetic, usually because the starting pattern was written in the wrong atom order.',
    [],
    [],
    { 'ISYM = 0 if you need symmetry breaking beyond the starting pattern.': { ISYM: '0' } },
  ],
  [
    'fermi-shift',
    'output',
    't-fermi',
    [],
    [],
    ['fermi level', 'e-fermi', 'shifted bands', 'gap wrong place', 'vbm'],
    'The zero of energy is in a different place in two runs, so the plots do not line up.',
    [],
    [],
    {},
  ],
  [
    'bands-wrong',
    'output',
    't-bands',
    [],
    [],
    ['band structure wrong', 'jagged bands', 'noisy bands', 'icharg 11', 'nbands'],
    'The band plot looks jagged or has the wrong gap, usually because the density was not read from the right SCF run.',
    [],
    [],
    { 'Copy CHGCAR from the SCF of the same structure; set ICHARG = 11.': { ICHARG: '11' } },
  ],
  [
    'bader-charges',
    'output',
    't-bader',
    [],
    [],
    ['bader', 'charges', 'laechg', 'aeccar', 'fft grid'],
    'Bader charges depend on the density grid and on including the core density, so they move with your settings.',
    [],
    [],
    { 'Set LAECHG = .TRUE.; use AECCAR0 + AECCAR2 as the reference.': { LAECHG: '.TRUE.' } },
  ],
  [
    'vasprun-xml',
    'output',
    't-xml',
    [],
    [],
    ['vasprun.xml', 'xml parse', 'pymatgen', 'ase', 'unfinished'],
    'The analysis tool cannot read vasprun.xml because the job stopped before the file was closed.',
    [],
    [],
    {},
  ],
  [
    'slow-or-oom',
    'performance',
    't-slow',
    [],
    [],
    ['slow', 'out of memory', 'oom', 'kpar', 'ncore', 'lreal'],
    'The run is slow or runs out of memory, which is often a parallel layout that does not suit the system.',
    [],
    [],
    {
      'Large cells (> ~20 atoms): LREAL = Auto.': { LREAL: 'Auto' },
      'Set LWAVE and LCHARG to .FALSE. when the files are not needed.': {
        LWAVE: '.FALSE.',
        LCHARG: '.FALSE.',
      },
    },
  ],
  [
    'eddrmm-zhegv',
    'electronic',
    null,
    [4],
    ['EDDRMM: call to ZHEGV failed'],
    ['eddrmm', 'rmm-diis', 'zhegv', 'fast', 'veryfast'],
    'The faster electron solver failed. A slower one is more robust.',
    [],
    [],
    { 'ALGO = Normal instead of Fast/VeryFast': { ALGO: 'Normal' } },
  ],
  [
    'zpotrf',
    'electronic',
    null,
    [5],
    ['LAPACK: Routine ZPOTRF failed'],
    ['zpotrf', 'lapack', 'overlap matrix', 'distorted structure', 'corrupt wavecar'],
    'A matrix inside the solver was not valid, which points at a damaged structure or a damaged WAVECAR.',
    [],
    [],
    { 'Delete WAVECAR': {}, 'ALGO = Normal': { ALGO: 'Normal' } },
  ],
  [
    'sgrcon',
    'symmetry-kpoints',
    null,
    [7],
    ['VERY BAD NEWS! internal error in subroutine SGRCON'],
    ['sgrcon', 'symmetry detection', 'symprec', 'isym'],
    'VASP found symmetry that does not agree with the coordinates you gave it.',
    [],
    [],
    { 'ISYM = 0': { ISYM: '0' } },
  ],
  [
    'inverse-rotation',
    'symmetry-kpoints',
    null,
    [8],
    ['inverse of rotation matrix was not found'],
    ['inverse of rotation matrix', 'symprec', 'off symmetric sites'],
    'Atoms sit slightly off the positions the symmetry needs, so VASP cannot close the symmetry group.',
    [],
    [],
    { 'SYMPREC = 1E-4 or larger': { SYMPREC: '1E-4' } },
  ],
  [
    'too-few-bands',
    'electronic',
    null,
    [10],
    ['TOO FEW BANDS'],
    ['too few bands', 'nbands', 'partially filled top band'],
    'The calculation has too few empty bands, so the top band is still partly filled.',
    [],
    [],
    { 'Increase NBANDS by 20–30%': {} },
  ],
  [
    'magmom-count',
    'magnetism',
    null,
    [12],
    ["Error reading item 'MAGMOM'", 'Error reading item MAGMOM'],
    ['magmom count', 'nions', 'error reading item'],
    'The number of MAGMOM values does not equal the number of atoms.',
    [],
    [],
    {},
  ],
  [
    'real-optlay',
    'performance',
    null,
    [14],
    ['REAL_OPTLAY: internal error', 'RSPHER'],
    ['real_optlay', 'rspher', 'real space projection', 'lreal'],
    'The real-space projection step failed. Switching it off is the standard remedy.',
    [],
    [],
    { 'LREAL = .FALSE.': { LREAL: '.FALSE.' } },
  ],
  [
    'cnormn',
    'ionic',
    null,
    [15],
    ['WARNING: CNORMN: search vector ill defined'],
    ['cnormn', 'search vector', 'ill defined'],
    'The relaxation step was too large, or the electrons were not converged well enough.',
    [],
    [],
    {},
  ],
  [
    'dfpt-ncore',
    'performance',
    null,
    [17],
    [],
    ['lepsilon', 'ibrion 7', 'ibrion 8', 'ncore npar', 'dfpt', 'band parallelization'],
    'Perturbation-theory runs cannot use band parallelization, so NCORE and NPAR must be removed.',
    [],
    [],
    {},
  ],
  [
    'imaginary-phonons',
    'advanced',
    null,
    [19],
    [],
    ['imaginary phonon', 'negative frequency', 'phonon instability'],
    'Phonon modes with imaginary frequency can mean a loose calculation or a real structural instability.',
    [],
    [],
    {
      'EDIFF 1E-8, EDIFFG −0.001, ADDGRID, larger DIM': {
        EDIFF: '1E-8',
        EDIFFG: '-0.001',
        ADDGRID: '.TRUE.',
      },
    },
  ],
  [
    'elastic-negative',
    'advanced',
    null,
    [20],
    [],
    ['negative elastic constants', 'odd elastic constants', 'voigt', 'residual stress'],
    'Elastic constants came out negative or odd, which usually points to leftover stress or too coarse settings.',
    [],
    [],
    {},
  ],
];

const CATS = {
  'start-up': 'Starting a run',
  electronic: 'Electronic convergence',
  ionic: 'Ionic relaxation',
  'symmetry-kpoints': 'Symmetry and k-points',
  magnetism: 'Magnetism',
  output: 'Output and post-processing',
  performance: 'Performance and parallel runs',
  advanced: 'Phonons and elastic constants',
};

const TITLES = {
  'job-died': 'The job died and I do not know why',
  'wavecar-mismatch': 'Error reading WAVECAR, or a stop right after start-up',
  'ions-too-close': 'The distance between some ions is very small',
  'ibzkpt-lattice-class': 'IBZKPT: k-lattice belongs to a different class of lattices',
  'tetrahedron-few-kpoints': 'Tetrahedron method fails (fewer than 4 k-points)',
  'relax-became-md': 'A relaxation ran as molecular dynamics',
  'primitive-cell': 'Found a more primitive cell',
  'scf-not-converging': 'The electronic loop does not converge',
  'davidson-zhegv': 'Sub-Space-Matrix is not hermitian, or EDDDAV ZHEGV failed',
  brmix: 'BRMIX: very serious problems',
  'large-entropy': 'Large entropy term (T*S) in OUTCAR',
  'relax-not-finishing': 'The relaxation does not finish in NSW steps',
  zbrent: 'ZBRENT: fatal error in bracketing',
  'pulay-stress': 'The lattice keeps changing when ISIF = 3 is rerun (Pulay stress)',
  'slab-vacuum-collapse': 'The vacuum layer of a slab disappeared',
  'moment-collapse': 'The magnetic moment collapses to zero',
  'afm-ends-fm': 'An antiferromagnetic start ends ferromagnetic',
  'fermi-shift': 'Bands or DOS look shifted',
  'bands-wrong': 'The band structure looks wrong or noisy',
  'bader-charges': 'Bader charges change with settings',
  'vasprun-xml': 'pymatgen or ASE cannot read vasprun.xml',
  'slow-or-oom': 'The run is slow or runs out of memory',
  'eddrmm-zhegv': 'EDDRMM: call to ZHEGV failed',
  zpotrf: 'LAPACK: Routine ZPOTRF failed',
  sgrcon: 'SGRCON: symmetry detection error',
  'inverse-rotation': 'Inverse of rotation matrix was not found',
  'too-few-bands': 'Too few bands (NBANDS too small)',
  'magmom-count': 'Error reading item MAGMOM',
  'real-optlay': 'REAL_OPTLAY: internal error',
  cnormn: 'CNORMN: search vector ill defined',
  'dfpt-ncore': 'LEPSILON or IBRION = 7, 8 with NCORE or NPAR',
  'imaginary-phonons': 'Imaginary phonon modes',
  'elastic-negative': 'Negative or odd elastic constants',
};
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const out = E.map(
  ([id, category, fid, wrows, messages, keywords, plain, extraCauses, extraFixes, incarFor]) => {
    const f = fid ? fieldById.get(fid) : null;
    if (fid && !f) throw new Error(`missing field entry ${fid}`);
    const rs = wrows.map(row);
    const title = TITLES[id];
    if (!title) throw new Error(`no title for ${id}`);
    const symptoms = [...(f ? [clean(f.symptom), clean(f.signs)] : []), ...rs.map((r) => r.message)].filter(
      (x, i, a) => x && a.indexOf(x) === i,
    );
    const causes = [
      ...(f ? [clean(f.cause)] : []),
      ...rs.map((r) => r.cause),
      ...extraCauses.map((c) => c),
    ].filter((x, i, a) => x && a.indexOf(x) === i);
    const fixTexts = [
      // D-110: the Field Handbook suggests "Normal -> Fast"; the Workflow Handbook lists ALGO = Fast as a cause of the
      // Davidson errors and advises against Fast for magnetic and +U systems. The author chose the Workflow Handbook.
      ...(f ? f.fix.map(clean).map((t) => FIX_TEXT[t] ?? t) : []),
      ...rs.flatMap((r) => splitFix(clean(r.fix)).map(up)),
      ...extraFixes,
    ];
    const fixes = [];
    for (const t of fixTexts) {
      const key = Object.keys(incarFor).find((k) => up(k) === t);
      if (fixes.some((x) => x.text === t)) continue;
      const e = { text: t };
      if (key && Object.keys(incarFor[key]).length) e.incar = incarFor[key];
      fixes.push(e);
    }
    // The fixes are already unique; an INCAR-change key that matches no fix text is a typo.
    for (const k of Object.keys(incarFor))
      if (!fixes.some((x) => x.text === up(k))) throw new Error(`${id}: no fix text "${k}"`);
    const sources = [...(f ? [fid] : []), ...rs.map((r) => r.id)];
    const related = f ? f.rel : [];
    return { id, title, category, messages, keywords, symptoms, plain, causes, fixes, related, sources };
  },
);

writeFileSync('src/data/errors.json', JSON.stringify({ categories: CATS, entries: out }, null, 2) + '\n');
console.log(`${out.length} unique entries from ${fieldById.size} field + ${rows.length} workflow rows`);
