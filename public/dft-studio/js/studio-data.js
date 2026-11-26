/* DFT Studio: shared reference data for the workflow steps.
 * INCAR presets, tag help, POTCAR suffix guide and recommended variants come from VASPKIT Studio (lab edition).
 * Exposes window.StudioData.
 */
window.StudioData = (() => {
  'use strict';

  // Default initial moments (muB), Hubbard U (eV, Dudarev) and orbital l for common correlated species.
  const MAGNETIC_DEFAULTS = {
    Ti: { magmom: 1.0, orbital: 2, u: 0.0, shell: '3d' },
    V:  { magmom: 3.0, orbital: 2, u: 3.25, shell: '3d' },
    Cr: { magmom: 5.0, orbital: 2, u: 3.7, shell: '3d' },
    Mn: { magmom: 5.0, orbital: 2, u: 3.9, shell: '3d' },
    Fe: { magmom: 5.0, orbital: 2, u: 5.3, shell: '3d' },
    Co: { magmom: 3.0, orbital: 2, u: 3.32, shell: '3d' },
    Ni: { magmom: 2.0, orbital: 2, u: 6.2, shell: '3d' },
    Cu: { magmom: 1.0, orbital: 2, u: 4.0, shell: '3d' },
    Mo: { magmom: 2.0, orbital: 2, u: 4.38, shell: '4d' },
    W:  { magmom: 2.0, orbital: 2, u: 6.2, shell: '5d' },
    Ce: { magmom: 1.0, orbital: 3, u: 4.5, shell: '4f' },
    Eu: { magmom: 7.0, orbital: 3, u: 6.0, shell: '4f' },
    Gd: { magmom: 7.0, orbital: 3, u: 6.7, shell: '4f' },
    U:  { magmom: 2.0, orbital: 3, u: 4.0, shell: '5f' },
  };

  const D_BLOCK = new Set(['Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg']);
  const F_BLOCK = new Set(['La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Ac','Th','Pa','U','Np','Pu','Am']);

  const INCAR_TAGS_HELP = {
    SYSTEM: 'Free-text job title written to OUTCAR.',
    ISTART: '0: start from scratch; 1: read WAVECAR if present.',
    ICHARG: '2: atomic charge superposition; 1: read CHGCAR; 11: non-SCF from a fixed CHGCAR (bands, DOS).',
    ENCUT: 'Plane-wave kinetic energy cutoff (eV). Recommended: 1.3 x max(ENMAX) of your POTCARs. Converge it for stresses and cell relaxations.',
    PREC: 'FFT grid precision. Use Accurate for forces, phonons and cell relaxations.',
    EDIFF: 'Electronic SCF convergence criterion (eV). 1E-6 for relaxations, 1E-7 to 1E-8 for phonons and convergence tests.',
    EDIFFG: 'Ionic convergence criterion. Negative = maximum force in eV/A (for example -0.01).',
    NELM: 'Maximum number of electronic SCF steps.',
    IBRION: '-1: no ionic update; 0: molecular dynamics; 2: conjugate-gradient relaxation; 5/6: finite differences; 7/8: DFPT.',
    ISIF: '2: relax ions only; 3: relax ions, cell shape and volume. Never use 3 on a slab with vacuum.',
    NSW: 'Maximum ionic steps (0 for a static SCF, 100 to 300 for relaxations).',
    POTIM: 'Ionic step width (relaxation) or time step in fs (MD).',
    ISMEAR: '0: Gaussian (safe default, SIGMA = 0.05); -5: tetrahedron with Bloechl corrections (DOS and total energies of insulators); 1/2: Methfessel-Paxton for metals.',
    SIGMA: 'Smearing width (eV). 0.03 to 0.05 for semiconductors, 0.1 to 0.2 for metals with ISMEAR = 1.',
    ALGO: 'Electronic minimization algorithm. Normal is safest; All or Damped for hybrid functionals.',
    LREAL: '.FALSE. (reciprocal space) is exact and preferred below about 30 atoms; Auto is faster for large supercells.',
    LASPH: 'Non-spherical contributions inside PAW spheres. Use .TRUE. for d and f elements, DFT+U and meta-GGA.',
    ISPIN: '1: non-spin-polarized; 2: collinear spin-polarized.',
    MAGMOM: 'Initial magnetic moment per atom in POSCAR order (for example 2*5.0 2*-5.0 6*0.0). Three numbers per atom for non-collinear runs.',
    LSORBIT: 'Spin-orbit coupling (requires vasp_ncl).',
    LNONCOLLINEAR: 'Non-collinear magnetism (requires vasp_ncl).',
    SAXIS: 'Spin quantization axis for SOC (for example 0 0 1).',
    LMAXMIX: 'Maximum l of the PAW one-centre densities passed to the mixer: 4 for d elements, 6 for f elements. Required for ICHARG = 11 runs on d/f systems.',
    LDAU: 'Enable the DFT+U Hubbard correction for correlated d/f orbitals.',
    LDAUTYPE: '2: Dudarev simplified rotationally invariant DFT+U (only U - J matters).',
    LDAUL: 'Orbital l per species: -1 none, 2 d, 3 f.',
    LDAUU: 'Hubbard U (eV) per species in POSCAR order.',
    LDAUJ: 'Exchange J (eV) per species in POSCAR order.',
    LDAUPRINT: '1: write occupancy matrices to OUTCAR.',
    IVDW: '11: DFT-D3 zero damping; 12: DFT-D3 Becke-Johnson damping; 20: Tkatchenko-Scheffler.',
    LORBIT: '11: write lm-decomposed PROCAR and DOSCAR for PDOS and fat bands.',
    NEDOS: 'Number of grid points in DOSCAR (2001 is a good default).',
    LWAVE: 'Write WAVECAR.',
    LCHARG: 'Write CHGCAR (needed for later ICHARG = 11 band or DOS runs).',
    LAECHG: 'Write AECCAR0/AECCAR2 for Bader charge analysis.',
    LOPTICS: 'Frequency-dependent dielectric tensor for optical spectra.',
    LDIPOL: 'Dipole correction for slabs (use with IDIPOL).',
    IDIPOL: 'Direction of the dipole correction: 3 = along c (slab normal).',
    VOSKOWN: '1: Vosko-Wilk-Nusair interpolation, often used for magnetic systems.',
    LHFCALC: 'Hybrid functional (Hartree-Fock exchange).',
    HFSCREEN: 'Screening parameter: 0.2 gives HSE06.',
    AEXX: 'Fraction of exact exchange (0.25 for HSE06 / PBE0).',
    ADDGRID: 'Additional support grid for augmentation charges; reduces noise in forces.',
    KPAR: 'Number of k-point groups that run in parallel. MPI ranks must be divisible by KPAR x NCORE.',
    NCORE: 'Cores that work on one orbital.',
    ISYM: '0 switches symmetry off (common for non-collinear and some MD runs).',
  };

  const INCAR_PRESETS = {
    ST: { name: 'Static SCF', tags: { ISTART: 0, ICHARG: 2, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-7', NELM: 100, ISMEAR: 0, SIGMA: 0.05, LORBIT: 11, LREAL: '.FALSE.', LASPH: '.TRUE.', LWAVE: '.FALSE.', LCHARG: '.TRUE.' } },
    SR: { name: 'Relax ions (ISIF = 2)', tags: { ISTART: 0, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', EDIFFG: -0.01, IBRION: 2, ISIF: 2, NSW: 150, POTIM: 0.5, ISMEAR: 0, SIGMA: 0.05, LREAL: 'Auto', LASPH: '.TRUE.', LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    LR: { name: 'Relax ions + cell (ISIF = 3)', tags: { ISTART: 0, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', EDIFFG: -0.01, IBRION: 2, ISIF: 3, NSW: 200, POTIM: 0.5, ISMEAR: 0, SIGMA: 0.05, LREAL: '.FALSE.', LASPH: '.TRUE.', LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    DS: { name: 'DOS (non-SCF, tetrahedron)', tags: { ISTART: 1, ICHARG: 11, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', ISMEAR: -5, LORBIT: 11, NEDOS: 2001, LREAL: '.FALSE.', LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    BS: { name: 'Band structure (non-SCF)', tags: { ISTART: 1, ICHARG: 11, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', ISMEAR: 0, SIGMA: 0.05, LORBIT: 11, LREAL: '.FALSE.', LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    MG: { name: 'Collinear magnetic (ISPIN = 2)', tags: { ISTART: 0, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', ISPIN: 2, LASPH: '.TRUE.', VOSKOWN: 1, ISMEAR: 0, SIGMA: 0.05, LORBIT: 11, LREAL: '.FALSE.' } },
    SO: { name: 'Spin-orbit coupling (SOC)', tags: { ISTART: 1, ICHARG: 11, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-7', LSORBIT: '.TRUE.', LNONCOLLINEAR: '.TRUE.', SAXIS: '0 0 1', LASPH: '.TRUE.', LORBIT: 11, ISMEAR: 0, SIGMA: 0.05 } },
    PU: { name: 'DFT+U (Dudarev)', tags: { ISTART: 0, PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-6', ISPIN: 2, LASPH: '.TRUE.', ISMEAR: 0, SIGMA: 0.05, LORBIT: 11 } },
    H6: { name: 'HSE06 hybrid functional', tags: { ISTART: 0, LHFCALC: '.TRUE.', AEXX: 0.25, HFSCREEN: 0.2, ALGO: 'All', TIME: 0.4, PRECFOCK: 'Normal', ENCUT: 520, EDIFF: '1E-6', ISMEAR: 0, SIGMA: 0.05, LASPH: '.TRUE.', LORBIT: 11 } },
    OP: { name: 'Optical properties (LOPTICS)', tags: { ISTART: 1, ALGO: 'Exact', LOPTICS: '.TRUE.', CSHIFT: 0.1, NEDOS: 2001, ENCUT: 520, EDIFF: '1E-8', ISMEAR: 0, SIGMA: 0.01, LPEAD: '.TRUE.' } },
    FD: { name: 'Phonon forces (finite differences)', tags: { PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-8', IBRION: -1, ALGO: 'Normal', LREAL: '.FALSE.', ADDGRID: '.TRUE.', ISMEAR: 0, SIGMA: 0.01, LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    DT: { name: 'DFPT force constants (IBRION = 8)', tags: { PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-8', IBRION: 8, LREAL: '.FALSE.', ADDGRID: '.TRUE.', ISMEAR: 0, SIGMA: 0.05, LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    MD: { name: 'AIMD (NVT Nose-Hoover)', tags: { IBRION: 0, NSW: 2000, POTIM: 1.0, SMASS: 0, TEBEG: 300, TEEND: 300, PREC: 'Normal', ENCUT: 450, EDIFF: '1E-5', ISMEAR: 0, SIGMA: 0.05, LREAL: 'Auto', ISYM: 0, LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
    BD: { name: 'Bader charge analysis', tags: { PREC: 'Accurate', ENCUT: 520, EDIFF: '1E-7', LAECHG: '.TRUE.', LCHARG: '.TRUE.', LWAVE: '.FALSE.', ISMEAR: 0, SIGMA: 0.05, LREAL: '.FALSE.' } },
    NE: { name: 'CI-NEB transition state', tags: { IMAGES: 5, SPRING: -5, LCLIMB: '.TRUE.', IBRION: 3, POTIM: 0.0, IOPT: 1, NSW: 300, EDIFF: '1E-5', EDIFFG: -0.03, ISMEAR: 0, SIGMA: 0.05, LREAL: 'Auto', LWAVE: '.FALSE.', LCHARG: '.FALSE.' } },
  };

  const SUFFIX_GUIDE = {
    standard: { label: 'Standard valence', meaning: 'Outermost valence electrons only; inner shells frozen in the core.', when: 'Default for most elements.' },
    _sv: { label: 'Semi-core s and p', meaning: 'Includes the outer s and p semi-core shells as valence.', when: 'Early transition metals, alkali and alkaline-earth metals, high pressure.' },
    _pv: { label: 'Semi-core p', meaning: 'Includes the semi-core p shell as valence.', when: '3d transition metals in oxides, magnetic systems, phonons.' },
    _d: { label: 'Semi-core d', meaning: 'Includes shallow semi-core d states as valence.', when: 'III-V and II-VI semiconductors and heavy post-transition metals.' },
    _h: { label: 'Hard', meaning: 'Smaller PAW radius to avoid sphere overlap at short bonds.', when: 'Short bonds (C_h, N_h, O_h) or high pressure. Needs a high ENCUT.' },
    _s: { label: 'Soft', meaning: 'Larger PAW radius, lower ENCUT.', when: 'Large supercells (MOFs) or fast screening.' },
    _GW: { label: 'GW / excited state', meaning: 'Extra high-energy scattering projectors.', when: 'GW, BSE, RPA and optical dielectric spectra.' },
    _3: { label: 'Lanthanide 4f in core (+3)', meaning: 'Freezes the 4f electrons in the core (+3 state).', when: 'When 4f-in-valence fails to converge and 4f magnetism is not needed.' },
  };

  const RECOMMENDED_PREFS = {
    H: ['H', 'H_h'], Li: ['Li_sv', 'Li'], Be: ['Be_sv', 'Be'], B: ['B'], C: ['C'], N: ['N'], O: ['O'], F: ['F'],
    Na: ['Na_pv', 'Na_sv', 'Na'], Mg: ['Mg_pv', 'Mg'], Al: ['Al'], Si: ['Si'], P: ['P'], S: ['S'], Cl: ['Cl'],
    K: ['K_sv', 'K_pv'], Ca: ['Ca_sv'], Sc: ['Sc_sv'], Ti: ['Ti_sv', 'Ti_pv'], V: ['V_sv', 'V_pv'],
    Cr: ['Cr_pv', 'Cr_sv'], Mn: ['Mn_pv', 'Mn_sv'], Fe: ['Fe_pv', 'Fe_sv', 'Fe'], Co: ['Co', 'Co_pv'],
    Ni: ['Ni_pv', 'Ni'], Cu: ['Cu_pv', 'Cu'], Zn: ['Zn'], Ga: ['Ga_d', 'Ga'], Ge: ['Ge_d', 'Ge'],
    As: ['As'], Se: ['Se'], Br: ['Br'], Sr: ['Sr_sv'], Y: ['Y_sv'], Zr: ['Zr_sv'], Nb: ['Nb_sv', 'Nb_pv'],
    Mo: ['Mo_pv', 'Mo_sv'], Ru: ['Ru_pv'], Rh: ['Rh_pv'], Pd: ['Pd'], Ag: ['Ag'], Cd: ['Cd'],
    In: ['In_d'], Sn: ['Sn_d'], Sb: ['Sb'], Te: ['Te'], I: ['I'], Cs: ['Cs_sv'], Ba: ['Ba_sv'], La: ['La'],
    Ce: ['Ce'], Hf: ['Hf_pv'], Ta: ['Ta_pv'], W: ['W_sv', 'W_pv'], Pt: ['Pt'], Au: ['Au'], Pb: ['Pb_d'], Bi: ['Bi_d'],
  };

  // Standard folder names of the official VASP PP library, used by make_potcar.sh.
  const PP_LIB_DIRS = {
    PAW_PBE_64: 'potpaw_PBE.64', PAW_LDA_64: 'potpaw_LDA.64', PAW_PBE: 'potpaw_PBE', PAW_LDA: 'potpaw_LDA',
    PAW_PW91: 'potpaw_GGA', USPP_LDA: 'pot', USPP_PW91: 'pot_GGA',
  };

  // Every VASPKIT menu group mapped to the step (and tab) where it lives in DFT Studio.
  // Each target: { stage, tab? } where tab is a VESTA right tab or an analysis tab.
  const CATALOG = [
    { cat: '01 Input files', items: [
      ['101', 'Customize INCAR (magnetic, DFT+U, SOC, HSE06)', { stage: 'incar' }],
      ['102', 'KPOINTS mesh for SCF', { stage: 'kpoints' }],
      ['103/104', 'POTCAR: default or user-selected variants', { stage: 'potcar' }],
      ['105/106', 'POSCAR from CIF / XYZ / paste', { stage: 'structure', tab: 'atoms' }],
      ['108/109', 'Job bundle and ENCUT sweep', { stage: 'bundle' }],
    ]},
    { cat: '02 Mechanics and EOS', items: [
      ['200-203', 'Elastic constants and moduli (Voigt-Reuss-Hill)', { stage: 'analyze', tab: 'elastic' }],
      ['205', 'Equation of state (Birch-Murnaghan)', { stage: 'analyze', tab: 'eos' }],
    ]},
    { cat: '03 K-path', items: [
      ['301-303', 'Band k-path for 1D / 2D / 3D structures', { stage: 'kpoints', kmode: 'line' }],
      ['-', 'k-point convergence test (L series + script)', { stage: 'kconv' }],
    ]},
    { cat: '04-08 Structure, symmetry and models', items: [
      ['400/401', 'Supercell and transformation matrix', { stage: 'structure', tab: 'supercell' }],
      ['402', 'Selective dynamics / fix layers', { stage: 'structure', tab: 'supercell' }],
      ['501-509', 'Catalysis: slabs, adsorbates, ZPE and Gibbs', { stage: 'structure', tab: 'catalyst' }],
      ['601-609', 'Symmetry, space group, Wyckoff, primitive cell', { stage: 'structure', tab: 'symmetry' }],
      ['800-827', 'Slabs, vacuum, heterostructures, defects', { stage: 'structure', tab: 'catalyst' }],
      ['-', 'Magnetic orderings (FM, AFM-A/C/G/II, 120 deg)', { stage: 'structure', tab: 'magnetic' }],
      ['-', 'Atoms, substitution, vacancies, interstitials', { stage: 'structure', tab: 'atoms' }],
      ['-', 'Sample crystal library (350 structures)', { stage: 'structure', library: true }],
    ]},
    { cat: '11-28 Electronic structure', items: [
      ['111-126', 'Total DOS (DOSCAR)', { stage: 'analyze', tab: 'elec' }],
      ['211-216', 'Band structure and gap (EIGENVAL)', { stage: 'analyze', tab: 'elec' }],
      ['-', 'SCF / ionic convergence (OSZICAR, OUTCAR)', { stage: 'analyze', tab: 'elec' }],
    ]},
    { cat: '31-68 Charge, potential, magnetism', items: [
      ['310-329', 'Charge, spin density and Bader (INCAR preset)', { stage: 'incar' }],
      ['420-443', 'Planar-averaged potential / work function (LOCPOT)', { stage: 'analyze', tab: 'elec' }],
      ['621-682', 'Magnetic anisotropy, SOC (INCAR preset)', { stage: 'incar' }],
    ]},
    { cat: '71-95 Optics, MD, phonons', items: [
      ['710-719', 'Optical spectra (INCAR preset)', { stage: 'incar' }],
      ['721-737', 'AIMD MSD and diffusion (XDATCAR)', { stage: 'analyze', tab: 'md' }],
      ['952-955', 'Phonopy dispersion and thermal properties', { stage: 'analyze', tab: 'phonon' }],
      ['501/509', 'Thermochemistry: ZPE, Gibbs correction, half-life', { stage: 'analyze', tab: 'eos' }],
    ]},
  ];

  return { MAGNETIC_DEFAULTS, D_BLOCK, F_BLOCK, INCAR_TAGS_HELP, INCAR_PRESETS, SUFFIX_GUIDE, RECOMMENDED_PREFS, PP_LIB_DIRS, CATALOG };
})();
