#!/usr/bin/env node
// Builds src/data/vasp-tags.json and src/data/incar-presets.json from the extracted handbooks
// (scripts/__generated__/, made by extract-handbooks.mjs) plus the hand-written text below.
// Hand-written here: group, type, beginner text, "what breaks" text, related tags. Everything else (defaults, typical
// values, intermediate and pro text, corrections, preset entries and their comments) comes from the handbooks.
// Nothing is invented: a default the handbooks do not state is recorded as such (Q-028).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gen = (n) => JSON.parse(readFileSync(resolve(root, 'scripts', '__generated__', n), 'utf8'));
const field = gen('field-handbook.json');
const wf = gen('workflow-handbook.json');
const strip = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------------------------------------
const incars = wf.incarBlocks.filter((b) => b.kind === 'incar');
const frag = (name) =>
  wf.incarBlocks.find(
    (b) => b.kind === 'fragment' && (name === 'MAGMOM' ? b.name === 'MAGMOM' : b.caption.includes('+U')),
  );
const byCaption = (s) => {
  const b = incars.find((x) => x.caption.includes(s));
  if (!b) throw new Error(`no INCAR block with caption containing "${s}"`);
  return b;
};

/** Parse the simple INCAR text of a block (same rules as src/lib/vasp/incar.ts for this input). */
function entriesOf(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const m = /^([A-Za-z_0-9]+)\s*=\s*([^#!]*?)\s*(?:[#!]\s*(.*))?$/.exec(raw.trim());
    if (!m || raw.trim().startsWith('#')) continue;
    out.push({ name: m[1].toUpperCase(), value: m[2].trim(), ...(m[3] ? { comment: m[3].trim() } : {}) });
  }
  return out;
}
const PH = {
  ENCUT: '<1.3 x largest ENMAX in your POTCAR>',
  MAGMOM: '<one value per atom, in POSCAR order>',
  NBANDS: '<about 3 x the NBANDS of the SCF run, rounded up to a multiple of the core count>',
  LDAUL: '<one value per species, in POSCAR order>',
  LDAUU: '<one value per species, in POSCAR order>',
  LDAUJ: '<one value per species, in POSCAR order>',
};
const withPlaceholders = (es, names) =>
  es.map((e) => (names.includes(e.name) && PH[e.name] ? { ...e, placeholder: PH[e.name] } : e));
const only = (es, names) => es.filter((e) => names.includes(e.name));
const without = (es, names) => es.filter((e) => !names.includes(e.name));

const relax = entriesOf(byCaption('relaxation').text);
const scf = entriesOf(byCaption('SCF').text);
const routeB = entriesOf(byCaption('route B').text);
const optics = entriesOf(byCaption('optics').text);
const elastic = entriesOf(byCaption('elastic').text);
const phonon = entriesOf(byCaption('each displacement').text);
const dfpt = entriesOf(byCaption('DFPT').text);
const bader = entriesOf(byCaption('Bader').text);
const r2scan = entriesOf(byCaption('r2SCAN').text);
const mbj = entriesOf(byCaption('mBJ').text);
const hse = entriesOf(byCaption('HSE06').text);
const dftu = entriesOf(frag('+U').text);
const magF = frag('MAGMOM').text.split('\n');

const H = ['S-019', 'S-041', 'S-042'];
const v = (id, title, entries, extra = {}) => ({ id, title, requires: [], ...extra, entries });

const presets = [
  {
    id: 'relax',
    title: 'Relax a bulk crystal',
    summary: 'Step 1 of the protocol: find the equilibrium cell and positions.',
    protocolStage: 1,
    fragment: false,
    sources: H,
    notes: [
      'Use ISIF = 2 instead of 3 for slabs and defects (no cell change).',
      'For metals the handbook suggests ISMEAR = 1, SIGMA = 0.1 to 0.2.',
    ],
    variants: [
      v('default', 'Bulk cell relaxation', withPlaceholders(relax, ['ENCUT', 'MAGMOM']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS'],
      }),
    ],
  },
  {
    id: 'static',
    title: 'Static SCF in the same folder',
    summary: 'Step 2 of the protocol: one converged single-point run that reads the relaxation WAVECAR.',
    protocolStage: 2,
    fragment: false,
    sources: H,
    notes: [
      'IBRION is not written: with NSW = 0 its default is already -1.',
      'Tighten EDIFF step by step: 1E-5, then 1E-6 (then 1E-8 before optics).',
    ],
    variants: [
      v('default', 'Static run', withPlaceholders(without(scf, ['LORBIT', 'NEDOS']), ['ENCUT', 'MAGMOM']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS', 'WAVECAR from the relaxation (ISTART = 1)'],
      }),
    ],
  },
  {
    id: 'dos',
    title: 'Total and projected density of states',
    summary: 'The step 2 SCF run with projections switched on; the DOS is read from DOSCAR.',
    protocolStage: 2,
    fragment: false,
    sources: H,
    notes: [
      'No extra VASP run: the DOS comes from the SCF run with LORBIT = 11.',
      'A denser k-mesh in the SCF gives a smoother DOS.',
    ],
    variants: [
      v('default', 'SCF with projections', withPlaceholders(scf, ['ENCUT', 'MAGMOM']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS', 'WAVECAR from the relaxation (ISTART = 1)'],
      }),
    ],
  },
  {
    id: 'band',
    title: 'Band structure',
    summary:
      'Step 3 of the protocol. A line-mode path cannot be self-consistent, so the path eigenvalues come from one of two routes.',
    protocolStage: 3,
    fragment: false,
    sources: H,
    notes: [
      'The SCF density must come from a uniform k-mesh, not from the path.',
      'Use the standardized primitive cell from the k-path tool for the POSCAR.',
    ],
    variants: [
      v(
        'route-a',
        'Route A: one SCF with KPOINTS_OPT (VASP 6.3 or newer)',
        withPlaceholders(scf, ['ENCUT', 'MAGMOM']),
        {
          vaspMin: '6.3',
          requires: ['POSCAR', 'POTCAR', 'KPOINTS (uniform mesh)', 'KPOINTS_OPT (a copy of KPATH.in)'],
          note: 'Same INCAR as the SCF run, without ICHARG = 11.',
        },
      ),
      v(
        'route-b',
        'Route B: path as KPOINTS, reading the SCF density',
        withPlaceholders(routeB, ['ENCUT', 'MAGMOM']),
        {
          requires: [
            'POSCAR',
            'POTCAR',
            'KPOINTS (the path, KPATH.in)',
            'CHGCAR from the SCF run (keep a backup)',
          ],
        },
      ),
    ],
  },
  {
    id: 'convergence',
    title: 'Convergence test (ENCUT and k-points)',
    summary: 'Step 0: single-point runs that change one setting at a time.',
    protocolStage: 0,
    fragment: false,
    sources: ['S-042'],
    notes: [
      'Test on the unrelaxed structure. Pick the smallest setting where the energy changes by less than 1 meV/atom from the next step up.',
      'Keep ENCUT fixed while you scan k-points, and the reverse.',
    ],
    variants: [
      v(
        'default',
        'Static run for a scan',
        withPlaceholders(
          only(scf, [
            'PREC',
            'ENCUT',
            'EDIFF',
            'ALGO',
            'NELM',
            'ISMEAR',
            'SIGMA',
            'LREAL',
            'ISPIN',
            'MAGMOM',
            'NSW',
          ]).map((e) => (e.name === 'ENCUT' ? { ...e, comment: 'the value being tested' } : e)),
          ['ENCUT', 'MAGMOM'],
        ),
        { requires: ['POSCAR', 'POTCAR', 'KPOINTS'] },
      ),
    ],
  },
  {
    id: 'spin',
    title: 'Magnetic configurations',
    summary: 'Compare non-magnetic, ferromagnetic and antiferromagnetic starts in the same supercell.',
    protocolStage: null,
    fragment: true,
    sources: H,
    notes: [
      'Merge into a relax or static template. The examples are for a 4 transition-metal plus 8 oxygen supercell.',
      'Use the same supercell for every configuration, and check each run kept its intended pattern.',
    ],
    variants: [
      v('nm', 'Non-magnetic', [{ name: 'ISPIN', value: '1' }]),
      v('fm', 'Ferromagnetic', [
        { name: 'ISPIN', value: '2' },
        {
          name: 'MAGMOM',
          value: magF
            .find((l) => l.startsWith('MAGMOM = 4*4.0'))
            .split('=')[1]
            .trim(),
          placeholder: PH.MAGMOM,
        },
      ]),
      v('afm-1', 'Antiferromagnetic, layered', [
        { name: 'ISPIN', value: '2' },
        { name: 'MAGMOM', value: '4.0 4.0 -4.0 -4.0 8*0.0', placeholder: PH.MAGMOM },
      ]),
      v('afm-2', 'Antiferromagnetic, checkerboard', [
        { name: 'ISPIN', value: '2' },
        { name: 'MAGMOM', value: '4.0 -4.0 -4.0 4.0 8*0.0', placeholder: PH.MAGMOM },
      ]),
    ],
  },
  {
    id: 'dftu',
    title: 'DFT+U',
    summary: 'Hubbard U for localized d or f electrons (Dudarev scheme).',
    protocolStage: null,
    fragment: true,
    sources: H,
    notes: [
      'Put the same LDAU tags in every step: relax, SCF, DOS and bands.',
      'LDAUL, LDAUU and LDAUJ need one entry per species in POSCAR order; a missing entry silently shifts values to the wrong element.',
      'Total energies with different U are not comparable.',
    ],
    variants: [
      v(
        'default',
        'Dudarev +U block (example for Fe O)',
        withPlaceholders(dftu, ['LDAUL', 'LDAUU', 'LDAUJ', 'MAGMOM']),
      ),
    ],
  },
  {
    id: 'hybrid',
    title: 'Hybrid functional (HSE06)',
    summary: 'Screened exact exchange for better gaps, at a much higher cost.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: [
      'Start from a converged PBE WAVECAR.',
      'ICHARG = 11 does not work with hybrids; band paths need zero-weight k-points instead.',
    ],
    variants: [
      v('default', 'HSE06 SCF', withPlaceholders(hse, ['ENCUT']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS', 'WAVECAR from a converged PBE run'],
      }),
    ],
  },
  {
    id: 'vdw',
    title: 'van der Waals correction',
    summary: 'A dispersion correction for layered, molecular and adsorption systems.',
    protocolStage: null,
    fragment: true,
    sources: ['S-042'],
    notes: [
      'Add to a relaxation template. The handbook lists 11 (D3), 12 (D3-BJ) and 20 (TS) as common values.',
    ],
    variants: [
      v('d3', 'D3', [{ name: 'IVDW', value: '11', comment: 'D3' }]),
      v('d3-bj', 'D3 with Becke-Johnson damping', [{ name: 'IVDW', value: '12', comment: 'D3-BJ' }]),
    ],
  },
  {
    id: 'elastic',
    title: 'Elastic constants',
    summary: 'Step 4 of the protocol: finite distortions with IBRION = 6 and ISIF = 3.',
    protocolStage: 4,
    fragment: false,
    sources: H,
    notes: [
      'NCORE is commented out on purpose: IBRION = 6 runs without band parallelization.',
      'Re-relax with the same ENCUT first.',
    ],
    variants: [
      v('default', 'Finite-difference elastic tensor', withPlaceholders(elastic, ['ENCUT', 'MAGMOM']), {
        requires: ['POSCAR (relaxed)', 'POTCAR', 'KPOINTS'],
      }),
    ],
  },
  {
    id: 'optics',
    title: 'Optical properties',
    summary: 'Step 5 of the protocol: dielectric function from an SCF run with extra empty bands.',
    protocolStage: 5,
    fragment: false,
    sources: H,
    notes: [
      'Converge the SCF to EDIFF 1E-6 to 1E-8 first, read NBANDS from its OUTCAR, then use about three times that, rounded up to a multiple of the core count.',
    ],
    variants: [
      v('default', 'LOPTICS run', withPlaceholders(optics, ['ENCUT', 'NBANDS', 'MAGMOM']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS', 'WAVECAR from the SCF run (optional)'],
      }),
    ],
  },
  {
    id: 'phonon-finite-displacement',
    title: 'Phonons: each displacement',
    summary: 'The INCAR used for every displaced supercell in the phonopy route.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: ['For magnetic systems set MAGMOM for the supercell, not the primitive cell.'],
    variants: [
      v('default', 'Single displacement', withPlaceholders(phonon, ['ENCUT']), {
        requires: ['POSCAR-xxx (displaced supercell)', 'POTCAR', 'KPOINTS (scaled for the supercell)'],
      }),
    ],
  },
  {
    id: 'dielectric',
    title: 'Dielectric tensor and Born charges (DFPT)',
    summary: 'Static dielectric tensor, Born effective charges and Gamma phonons by perturbation theory.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: [
      'Insulators only. NCORE must not be set.',
      'For hybrid or meta-GGA functionals use IBRION = 6 with LCALCEPS = .TRUE. instead.',
    ],
    variants: [
      v('default', 'DFPT', withPlaceholders(dfpt, ['ENCUT']), {
        requires: ['POSCAR (relaxed)', 'POTCAR', 'KPOINTS'],
      }),
    ],
  },
  {
    id: 'bader',
    title: 'Bader charge analysis',
    summary: 'An SCF run that also writes the all-electron reference density.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: ['Refine the FFT grid for accurate charges (about twice the default; see OUTCAR).'],
    variants: [
      v('default', 'LAECHG run', withPlaceholders(bader, ['ENCUT', 'MAGMOM']), {
        requires: ['POSCAR', 'POTCAR', 'KPOINTS'],
      }),
    ],
  },
  {
    id: 'r2scan',
    title: 'r2SCAN meta-GGA',
    summary: 'A meta-GGA functional, started from a converged PBE run.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: [
      'Add to a static template and remove any GGA tag.',
      'The handbook adds rVV10 dispersion for SCAN with LUSE_VDW = .TRUE. and BPARAM = 15.7 (11.95 for r2SCAN).',
    ],
    variants: [
      v('default', 'r2SCAN SCF', r2scan, {
        requires: ['POSCAR', 'POTCAR (meta-GGA capable)', 'KPOINTS', 'WAVECAR from a converged PBE run'],
      }),
    ],
  },
  {
    id: 'mbj',
    title: 'Modified Becke-Johnson band gap',
    summary: 'A potential-only functional for band gaps. It gives no total energy or forces.',
    protocolStage: null,
    fragment: false,
    sources: H,
    notes: ['Use the PBE geometry. By default the parameter c is computed self-consistently; CMBJ fixes it.'],
    variants: [
      v('default', 'mBJ SCF', mbj, {
        requires: ['POSCAR (PBE geometry)', 'POTCAR', 'KPOINTS', 'WAVECAR from a PBE run'],
      }),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------------------------
// [name, group, type, beginner, breaks, related, dictionary row key (first tag of its row) or null]
const T = [
  [
    'PREC',
    'accuracy',
    'string',
    'Picks how fine the calculation grids are. Use Accurate for anything that needs forces or stress.',
    'Normal can give wrap-around errors and noisy forces or stress.',
    ['ENCUT', 'ADDGRID', 'LREAL'],
    'PREC',
  ],
  [
    'ENCUT',
    'accuracy',
    'real',
    'The size of the plane-wave basis, set as an energy in eV. Bigger is more accurate and slower.',
    'Too low gives wrong stress and lattice constants. Changing it between runs you compare makes the energies incomparable.',
    ['PREC', 'ISIF', 'EDIFF'],
    'ENCUT',
  ],
  [
    'EDIFF',
    'electronic',
    'real',
    'How tightly each electronic loop must converge. Smaller means more accurate forces and response properties.',
    'Too loose gives noisy forces and false imaginary phonon modes.',
    ['EDIFFG', 'NELM', 'ALGO'],
    'EDIFF',
  ],
  [
    'EDIFFG',
    'ionic',
    'real',
    'When to stop a relaxation. A negative number means: stop when every force is smaller than that many eV per angstrom.',
    'A positive value stops on energy change, which can end a relaxation too early. EDIFF should be at least 10 times smaller than any energy-based EDIFFG.',
    ['EDIFF', 'IBRION', 'NSW'],
    'EDIFFG',
  ],
  [
    'NELM',
    'electronic',
    'int',
    'The most electronic steps allowed for each ionic step.',
    'If a step reaches NELM, the forces are not converged. Fix the mixing first rather than only raising NELM.',
    ['EDIFF', 'ALGO', 'NELMIN'],
    'NELM',
  ],
  [
    'NELMIN',
    'electronic',
    'int',
    'The fewest electronic steps allowed for each ionic step.',
    'Too small can end the electronic loop too early and give poor forces.',
    ['NELM', 'EDIFF'],
    'NELMIN',
  ],
  [
    'NELMDL',
    'electronic',
    'int',
    'How many start-up steps let the random starting wavefunctions settle before the density is updated. The value is negative: -5 by default, -12 for difficult starts.',
    'A bad start can make the first steps wander; the handbook uses a more negative value for difficult starts.',
    ['NELM', 'ALGO'],
    'NELMDL',
  ],
  [
    'ALGO',
    'electronic',
    'string',
    'Chooses the method used to find the electron states. Normal is the safe choice; All or Damped help hard cases.',
    'The wrong choice can stall or oscillate in magnetic, +U, hybrid and meta-GGA runs.',
    ['NELM', 'LMIXTAU', 'TIME'],
    'ALGO',
  ],
  [
    'ISMEAR',
    'smearing',
    'int',
    'How electrons are spread over energy levels near the Fermi level. 0 with a small SIGMA is the safe default for this handbook.',
    'Method 1 on a semiconductor gives wrong energies. Method -5 should not be used for band paths or metal forces.',
    ['SIGMA', 'NEDOS', 'KSPACING'],
    'ISMEAR',
  ],
  [
    'SIGMA',
    'smearing',
    'real',
    'The width of that spreading, in eV. Small for insulators, larger for metals.',
    'Too wide blurs gaps and adds an entropy error; check the T*S term in OUTCAR is below about 1 meV per atom.',
    ['ISMEAR', 'NEDOS'],
    'SIGMA',
  ],
  [
    'ISPIN',
    'spin',
    'int',
    'Turns spin polarization on (2) or off (1). Use 2 for magnetic materials and open-shell atoms.',
    'A spin-polarized run with no starting moment can stay non-magnetic.',
    ['MAGMOM', 'NUPDOWN', 'LORBIT'],
    'ISPIN',
  ],
  [
    'MAGMOM',
    'spin',
    'real-array',
    'The starting magnetic moment of each atom, in the same order as the POSCAR. Write 4*3.0 for four atoms at 3.0.',
    'The count must equal the number of atoms; a wrong count or order starts the wrong magnetic state.',
    ['ISPIN', 'ISYM', 'NUPDOWN'],
    'MAGMOM',
  ],
  [
    'NUPDOWN',
    'spin',
    'int',
    'Forces the difference between spin-up and spin-down electrons to a fixed number.',
    'Left on by mistake it holds the system in a spin state that is not the ground state.',
    ['ISPIN', 'MAGMOM'],
    'NUPDOWN',
  ],
  [
    'LORBIT',
    'dos',
    'int',
    'Asks VASP to also write the density of states split by atom and orbital. Use 11.',
    'Without it there is no projected DOS or PROCAR for plots by atom or orbital.',
    ['NEDOS', 'ISPIN'],
    'LORBIT',
  ],
  [
    'NEDOS',
    'dos',
    'int',
    'The number of energy points in the density of states. More points give a smoother curve.',
    'The default is too coarse for clean projected DOS and optical spectra.',
    ['EMIN', 'EMAX', 'LORBIT', 'LOPTICS'],
    'NEDOS',
  ],
  [
    'EMIN',
    'dos',
    'real',
    'The lowest energy of the DOS window, in eV on VASP absolute scale.',
    'A window that misses the Fermi level wastes points where you do not plot.',
    ['EMAX', 'NEDOS'],
    'EMIN/EMAX',
  ],
  [
    'EMAX',
    'dos',
    'real',
    'The highest energy of the DOS window, in eV on VASP absolute scale.',
    'A window that misses the Fermi level wastes points where you do not plot.',
    ['EMIN', 'NEDOS'],
    'EMIN/EMAX',
  ],
  [
    'ISTART',
    'restart',
    'int',
    'Whether to start from random wavefunctions (0) or read the saved WAVECAR (1).',
    'Reading a corrupted or mismatched WAVECAR stops the run at start-up.',
    ['ICHARG', 'LWAVE'],
    'ISTART',
  ],
  [
    'ICHARG',
    'restart',
    'int',
    'Where the starting electron density comes from. 2 builds it from atoms, 1 reads CHGCAR, 11 reads CHGCAR and keeps it fixed.',
    '11 needs a CHGCAR from the same structure, ENCUT, POTCAR and spin setting, and does not work with hybrids.',
    ['ISTART', 'LCHARG', 'LMAXMIX'],
    'ICHARG',
  ],
  [
    'IBRION',
    'ionic',
    'int',
    'Chooses what VASP does with the ions: nothing, relax them, or displace them to get force constants.',
    'Left unset with NSW above 1 it defaults to molecular dynamics. Always set it explicitly for relaxations.',
    ['NSW', 'ISIF', 'POTIM', 'NFREE'],
    'IBRION',
  ],
  [
    'ISIF',
    'ionic',
    'int',
    'Chooses what may change in a relaxation: only ions (2), ions and the whole cell (3), or ions and cell shape at fixed volume (4).',
    'ISIF = 3 on a slab changes the vacuum. ISIF = 3 is required with IBRION = 6 for elastic constants.',
    ['IBRION', 'ENCUT', 'NSW'],
    'ISIF',
  ],
  [
    'NSW',
    'ionic',
    'int',
    'The most ionic steps allowed. 0 means a single calculation with no ion movement.',
    'Reaching NSW is not convergence. Check the output for the message that the required accuracy was reached.',
    ['IBRION', 'EDIFFG'],
    'NSW',
  ],
  [
    'POTIM',
    'ionic',
    'real',
    'The step size for moving ions, or the displacement size for finite differences, in angstrom.',
    'Too large makes relaxations oscillate or fail with ZBRENT errors.',
    ['IBRION', 'NFREE'],
    'POTIM',
  ],
  [
    'NFREE',
    'ionic',
    'int',
    'How many displacements per direction in finite-difference runs. 4 is more accurate and costs twice as much as 2.',
    'Too few displacements leave more anharmonic error in force constants and elastic constants.',
    ['IBRION', 'POTIM'],
    'NFREE',
  ],
  [
    'LREAL',
    'accuracy',
    'string',
    'Chooses whether some projections are done in real space (faster) or reciprocal space (more exact).',
    'Real-space projection adds small errors; use .FALSE. for phonons, elastic constants and final energies.',
    ['PREC', 'ADDGRID'],
    'LREAL',
  ],
  [
    'ADDGRID',
    'accuracy',
    'bool',
    'Adds an extra fine grid for some charges. It lowers noise in forces at little cost.',
    'Without it, phonon force constants can be noisier.',
    ['PREC', 'LREAL'],
    'ADDGRID',
  ],
  [
    'LASPH',
    'accuracy',
    'bool',
    'Includes small non-spherical effects inside the atoms. Turn it on for d and f elements.',
    'Missing it for +U, hybrids or d/f elements gives less accurate results; meta-GGA runs require it.',
    ['LMAXMIX', 'METAGGA', 'LDAU'],
    'LASPH',
  ],
  [
    'LMAXMIX',
    'mixing',
    'int',
    'How much detail about d and f electrons is kept when mixing densities. Use 4 for d elements, 6 for f.',
    'The low default loses d/f occupation information, which matters for +U and for ICHARG = 11 runs.',
    ['LASPH', 'LDAU', 'ICHARG'],
    'LMAXMIX',
  ],
  [
    'AMIX',
    'mixing',
    'real',
    'How strongly new density is mixed in each step. Lower values calm unstable runs.',
    'Too high can cause charge sloshing in metals, slabs and magnets.',
    ['BMIX', 'AMIX_MAG'],
    'AMIX/BMIX',
  ],
  [
    'BMIX',
    'mixing',
    'real',
    'A second mixing parameter that works with AMIX.',
    'Poor values slow or stall the SCF loop.',
    ['AMIX', 'BMIX_MAG'],
    'AMIX/BMIX',
  ],
  [
    'AMIX_MAG',
    'mixing',
    'real',
    'The same as AMIX, but for the magnetization density.',
    'Wrong values can make magnetic moments oscillate between steps.',
    ['AMIX', 'BMIX_MAG', 'MAGMOM'],
    'AMIX_MAG/BMIX_MAG',
  ],
  [
    'BMIX_MAG',
    'mixing',
    'real',
    'The same as BMIX, but for the magnetization density.',
    'Wrong values can make magnetic moments oscillate between steps.',
    ['AMIX_MAG', 'BMIX', 'MAGMOM'],
    'AMIX_MAG/BMIX_MAG',
  ],
  [
    'NBANDS',
    'electronic',
    'int',
    'How many electron states (bands) are calculated, including empty ones.',
    'Optics gives poor results without extra empty bands. It must exceed the number of occupied bands.',
    ['LOPTICS', 'NCORE'],
    'NBANDS',
  ],
  [
    'NCORE',
    'parallel',
    'int',
    'How many cores work together on one band. It tunes speed only.',
    'Must be commented out for IBRION = 6, IBRION 7/8, LEPSILON and LELF runs, or the run can fail.',
    ['KPAR', 'LREAL'],
    'NCORE',
  ],
  [
    'KPAR',
    'parallel',
    'int',
    'Splits the k-points into groups that run side by side. It tunes speed only.',
    'A value that does not divide the core count wastes cores; more groups use more memory.',
    ['NCORE'],
    'KPAR',
  ],
  [
    'LWAVE',
    'restart',
    'bool',
    'Whether to save the wavefunctions to WAVECAR at the end.',
    'Turned off in a run you later want to restart from, the WAVECAR is missing. Left on, it uses disk space.',
    ['ISTART', 'LCHARG'],
    'LWAVE/LCHARG',
  ],
  [
    'LCHARG',
    'restart',
    'bool',
    'Whether to save the charge density to CHGCAR at the end.',
    'An SCF run must write CHGCAR if a later run uses ICHARG = 11.',
    ['ICHARG', 'LWAVE'],
    'LWAVE/LCHARG',
  ],
  [
    'LAECHG',
    'output',
    'bool',
    'Writes the extra files needed for accurate Bader charge analysis.',
    'Without the all-electron reference density the Bader charges are less reliable.',
    ['LCHARG'],
    'LAECHG',
  ],
  [
    'LVHAR',
    'output',
    'bool',
    'Writes the electrostatic potential to LOCPOT, used for work functions and band alignment.',
    'Not set, there is no LOCPOT to read the vacuum level from.',
    ['LDIPOL', 'IDIPOL'],
    'LVHAR',
  ],
  [
    'LELF',
    'output',
    'bool',
    'Writes the electron localization function to ELFCAR for plots of bonding.',
    'Must run with NCORE = 1, or the run can fail.',
    ['NCORE'],
    'LELF',
  ],
  [
    'LOPTICS',
    'optics',
    'bool',
    'Calculates how the material responds to light (the dielectric function) from the electron states.',
    'Without enough empty bands (NBANDS) the spectrum is unreliable.',
    ['NBANDS', 'CSHIFT', 'NEDOS'],
    'LOPTICS',
  ],
  [
    'CSHIFT',
    'optics',
    'real',
    'The smoothing width used when computing the optical spectrum, in eV.',
    'Smaller values sharpen peaks but need a denser k-mesh and more NEDOS points.',
    ['LOPTICS', 'NEDOS'],
    'CSHIFT',
  ],
  [
    'LEPSILON',
    'dielectric',
    'bool',
    'Calculates the static dielectric tensor and Born effective charges by perturbation theory.',
    'Insulators only, needs NCORE = 1, and is not for hybrid functionals (use LCALCEPS).',
    ['IBRION', 'LRPA', 'LCALCEPS'],
    'LEPSILON',
  ],
  [
    'LRPA',
    'dielectric',
    'bool',
    'Chooses whether local-field effects use only the Hartree part or include exchange-correlation.',
    'The wrong setting changes the dielectric values you report; the default includes exchange-correlation.',
    ['LEPSILON'],
    'LRPA',
  ],
  [
    'LCALCEPS',
    'dielectric',
    'bool',
    'Calculates the dielectric tensor and Born charges with a small applied electric field.',
    'Needed instead of LEPSILON for hybrid and meta-GGA functionals.',
    ['LEPSILON', 'IBRION'],
    'LCALCEPS',
  ],
  [
    'LDAU',
    'dftu',
    'bool',
    'Switches on the Hubbard U correction for localized d or f electrons.',
    'Without it, semilocal functionals tend to over-spread d and f electrons and can make insulators look like metals.',
    ['LDAUTYPE', 'LDAUL', 'LDAUU', 'LDAUJ'],
    'LDAU/LDAUTYPE',
  ],
  [
    'LDAUTYPE',
    'dftu',
    'int',
    'Chooses the flavour of +U. 2 is the Dudarev form where only U minus J matters.',
    'A different type changes what U and J mean, so values from papers may not transfer.',
    ['LDAU', 'LDAUU', 'LDAUJ'],
    'LDAU/LDAUTYPE',
  ],
  [
    'LDAUL',
    'dftu',
    'int-array',
    'For each species, which orbital gets U: 2 for d, 3 for f, -1 for none.',
    'One entry per species in POSCAR order is required; a missing entry silently shifts values to the wrong element.',
    ['LDAU', 'LDAUU', 'LDAUJ'],
    'LDAUL/LDAUU/LDAUJ',
  ],
  [
    'LDAUU',
    'dftu',
    'real-array',
    'For each species, the U value in eV.',
    'One entry per species in POSCAR order is required. Energies with different U are not comparable.',
    ['LDAU', 'LDAUL', 'LDAUJ'],
    'LDAUL/LDAUU/LDAUJ',
  ],
  [
    'LDAUJ',
    'dftu',
    'real-array',
    'For each species, the J value in eV.',
    'One entry per species in POSCAR order is required.',
    ['LDAU', 'LDAUL', 'LDAUU'],
    'LDAUL/LDAUU/LDAUJ',
  ],
  [
    'LDAUPRINT',
    'dftu',
    'int',
    'Prints the occupation matrices of the +U orbitals to OUTCAR so you can check them.',
    'Without it you cannot easily check that the d occupations make chemical sense.',
    ['LDAU'],
    null,
  ],
  [
    'METAGGA',
    'metagga',
    'string',
    'Chooses a meta-GGA functional such as R2SCAN, SCAN or MBJ.',
    'Needs LASPH and compatible POTCARs; remove any GGA tag.',
    ['LASPH', 'LMIXTAU', 'ALGO'],
    'METAGGA',
  ],
  [
    'LMIXTAU',
    'metagga',
    'bool',
    'Also mixes the kinetic-energy density, which steadies meta-GGA runs.',
    'Missing it can make meta-GGA SCF loops unstable.',
    ['METAGGA'],
    'LMIXTAU',
  ],
  [
    'LHFCALC',
    'hybrid',
    'bool',
    'Switches on exact exchange, which makes the functional a hybrid.',
    'Hybrid runs are far more expensive and ICHARG = 11 does not work with them.',
    ['HFSCREEN', 'AEXX', 'PRECFOCK'],
    'LHFCALC',
  ],
  [
    'HFSCREEN',
    'hybrid',
    'real',
    'The screening length of the exchange. 0.2 with AEXX 0.25 is HSE06; 0 is PBE0.',
    'The wrong value runs a different functional than the one you report.',
    ['AEXX', 'LHFCALC'],
    'HFSCREEN/AEXX',
  ],
  [
    'AEXX',
    'hybrid',
    'real',
    'The fraction of exact exchange mixed in. 0.25 is standard.',
    'If you tune it to match a known gap, you must report the value.',
    ['HFSCREEN', 'LHFCALC'],
    'HFSCREEN/AEXX',
  ],
  [
    'PRECFOCK',
    'hybrid',
    'string',
    'Sets how fine the grid for the exchange part is. Fast saves time.',
    'Cheaper settings can shift the gap; check the change is below about 0.05 eV.',
    ['NKRED', 'LHFCALC'],
    'PRECFOCK/NKRED',
  ],
  [
    'NKRED',
    'hybrid',
    'int',
    'Reduces the k-mesh used for the exchange part, cutting cost.',
    'Works for even meshes only, and can shift the gap; check it changes by less than about 0.05 eV.',
    ['PRECFOCK', 'LHFCALC'],
    'PRECFOCK/NKRED',
  ],
  [
    'IVDW',
    'vdw',
    'int',
    'Adds a correction for weak van der Waals forces. 11 is D3 and 12 is D3 with Becke-Johnson damping.',
    'Without it layered and molecular crystals and adsorption systems are described poorly.',
    ['LUSE_VDW'],
    'IVDW',
  ],
  [
    'LSORBIT',
    'soc',
    'bool',
    'Switches on spin-orbit coupling, which matters for heavy elements.',
    'Needs the non-collinear VASP build and three MAGMOM values per atom.',
    ['SAXIS', 'MAGMOM'],
    'LSORBIT/SAXIS',
  ],
  [
    'SAXIS',
    'soc',
    'real-array',
    'The direction chosen as the spin axis, for example 0 0 1.',
    'Needs LSORBIT; a wrong axis changes magnetic-anisotropy results.',
    ['LSORBIT'],
    'LSORBIT/SAXIS',
  ],
  [
    'ISYM',
    'symmetry',
    'int',
    'Controls whether VASP uses crystal symmetry to save work. 0 switches it off.',
    'Leaving it on can fight a hand-built antiferromagnetic MAGMOM pattern; changing it is only for fixing symmetry errors.',
    ['SYMPREC', 'MAGMOM'],
    'ISYM/SYMPREC',
  ],
  [
    'SYMPREC',
    'symmetry',
    'real',
    'How precisely atoms must sit on symmetry positions for VASP to see the symmetry.',
    'Too tight misses symmetry and too loose invents it; change only to fix symmetry errors.',
    ['ISYM'],
    'ISYM/SYMPREC',
  ],
  [
    'KSPACING',
    'kpoints',
    'real',
    'Builds the k-mesh from a spacing, without a KPOINTS file. Smaller spacing means more k-points.',
    'Too large gives an under-sampled zone. Compare it with a VASPKIT resolution: spacing is about 2 pi times the resolution.',
    ['ISMEAR', 'EDIFF'],
    'KSPACING',
  ],
  [
    'LDIPOL',
    'slab',
    'bool',
    'Adds a dipole correction for slabs that are not the same on both sides.',
    'Without it an asymmetric slab sees a false field across the vacuum.',
    ['IDIPOL', 'LVHAR'],
    'LDIPOL/IDIPOL',
  ],
  [
    'IDIPOL',
    'slab',
    'int',
    'The direction of the dipole correction; 3 means along z.',
    'The wrong direction applies the correction across the wrong axis.',
    ['LDIPOL', 'LVHAR'],
    'LDIPOL/IDIPOL',
  ],
  [
    'SYSTEM',
    'output',
    'string',
    'A free-text name for the calculation, written into the output.',
    'It has no effect on the physics.',
    [],
    null,
  ],
  [
    'TIME',
    'electronic',
    'real',
    'A step size used by the damped electronic algorithm.',
    'The handbooks only show 0.4 with ALGO = Damped for HSE06; other uses are not described there.',
    ['ALGO', 'LHFCALC'],
    null,
  ],
  [
    'LUSE_VDW',
    'vdw',
    'bool',
    'Turns on the rVV10 dispersion add-on used with SCAN-type functionals.',
    'Needs BPARAM set to match the functional.',
    ['BPARAM', 'METAGGA'],
    null,
  ],
  [
    'BPARAM',
    'vdw',
    'real',
    'A parameter of the rVV10 dispersion add-on: 15.7 for SCAN, 11.95 for r2SCAN.',
    'A value for the wrong functional gives wrong dispersion energy.',
    ['LUSE_VDW'],
    null,
  ],
  [
    'CMBJ',
    'metagga',
    'real',
    'Fixes the c parameter of the mBJ functional. Normally left unset.',
    'By default c is computed self-consistently; a fixed value changes the gap.',
    ['METAGGA'],
    null,
  ],
];

const dictByKey = new Map(wf.dictionary.map((d) => [d.tags.join('/'), d]));
const fieldBy = (n) => field.TAGS.find((t) => t.name.split(' / ').includes(n));
const nameSet = new Set(T.map((t) => t[0]));

// Preset usage -> tasks
const usage = new Map();
for (const p of presets)
  for (const vr of p.variants)
    for (const e of vr.entries) {
      if (!usage.has(e.name)) usage.set(e.name, new Set());
      usage.get(e.name).add(p.id);
    }
for (const [n] of usage) if (!nameSet.has(n)) throw new Error(`preset uses tag ${n} that has no tag entry`);

const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)) + ' ...');
const UNSTATED = (n) => `Not stated in the handbooks. See the VASP wiki page for ${n}.`;
const VERSION_NOTE = 'Minimum VASP version is not stated in the handbooks and has not been checked.';

const tags = T.map(([name, group, type, beginner, breaks, related, key]) => {
  for (const r of related) if (!nameSet.has(r)) throw new Error(`${name}: related tag ${r} missing`);
  const row = key ? dictByKey.get(key) : null;
  if (key && !row) throw new Error(`${name}: dictionary row ${key} not found`);
  const f = fieldBy(name);
  const fromHandbook = [
    ...(f ? ['field'] : []),
    ...(row || usage.has(name) || ['LUSE_VDW', 'BPARAM', 'CMBJ'].includes(name) ? ['workflow'] : []),
  ];
  let def = UNSTATED(name);
  if (f) {
    def = f.def;
    if (f.name.includes('/')) {
      // "ISMEAR = 1, SIGMA = 0.2" style: keep the whole text, it names both
      def = f.def;
    }
  }
  const extra = {
    NELMDL: '-5',
    AMIX: '0.4',
    BMIX: '1.0',
    AMIX_MAG: '1.6',
    BMIX_MAG: '1.0',
    CSHIFT: '0.1',
    LMAXMIX: '2',
    LRPA: '.FALSE.',
  };
  if (name in extra && !f) def = `${extra[name]} (as stated in the Workflow Handbook dictionary)`;
  if (name === 'NEDOS') def = '301';
  const typical = row ? row.typical : f ? f.common : '';
  const interm = row ? row.controls : f ? strip(f.summary) : '';
  const pro = f ? clip(f.facts.map(strip).join(' '), 600) : row ? row.why : undefined;
  const corrections =
    f && f.fixed && !(f.name.includes('/') && name !== f.name.split(' / ')[0])
      ? f.fixed.map((c) => ({ was: strip(c.was), now: strip(c.now) }))
      : [];
  return {
    name,
    group,
    type,
    default: def,
    typical: typical || 'Not stated in the handbooks.',
    vaspVersion: '6.x',
    summary: { beginner, intermediate: interm || beginner, ...(pro ? { pro } : {}) },
    why: row
      ? row.why
      : 'The handbooks show this tag only inside the example INCAR files; they do not give a separate reason.',
    breaks,
    tasks: [...(usage.get(name) ?? [])].sort(),
    related,
    handbook: null,
    sources: [
      ...new Set([
        ...H.filter((s) => (s === 'S-041' ? fromHandbook.includes('field') : true)),
        ...(name === 'KSPACING' ? ['S-020'] : []),
      ]),
    ],
    fromHandbook,
    ...(corrections.length ? { corrections } : {}),
    notes: VERSION_NOTE,
  };
});

writeFileSync(
  resolve(root, 'src', 'data', 'vasp-tags.json'),
  JSON.stringify(
    { _meta: { sources: H, generator: 'scripts/build/build-vasp-data.mjs', version: 1 }, tags },
    null,
    1,
  ) + '\n',
);
writeFileSync(
  resolve(root, 'src', 'data', 'incar-presets.json'),
  JSON.stringify(
    { _meta: { sources: H, generator: 'scripts/build/build-vasp-data.mjs', version: 1 }, presets },
    null,
    1,
  ) + '\n',
);
console.log(`build-vasp-data: ${tags.length} tags, ${presets.length} presets`);
