/* DFT Studio: shared reference data for the workflow steps.
 * The POTCAR suffix guide and recommended variants come from VASPKIT Studio (lab edition). INCAR presets and tag help
 * left with the INCAR step: the Input Builder writes INCAR from the sourced presets (D-108).
 * Exposes window.StudioData.
 */
window.StudioData = (() => {
  'use strict';

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
  // Each target: { stage, tab? } where tab is a VESTA right tab or an analysis tab, or { send, task? } for a site tool.
  const CATALOG = [
    { cat: '01 Input files', items: [
      ['101', 'INCAR for any task: magnetic, DFT+U, SOC, HSE06 (Input Builder)', { stage: 'inputs' }],
      ['102', 'KPOINTS mesh for SCF (Input Builder)', { stage: 'inputs' }],
      ['103/104', 'POTCAR: default or user-selected variants', { stage: 'potcar' }],
      ['105/106', 'POSCAR from CIF / XYZ / paste', { stage: 'structure', tab: 'atoms' }],
      ['108/109', 'Job script, zip and ENCUT series (Input Builder)', { stage: 'inputs' }],
    ]},
    { cat: '02 Mechanics and EOS', items: [
      ['200-203', 'Elastic constants and moduli (Voigt-Reuss-Hill)', { stage: 'analyze', tab: 'elastic' }],
      ['205', 'Equation of state (Birch-Murnaghan)', { stage: 'analyze', tab: 'eos' }],
    ]},
    { cat: '03 K-path', items: [
      ['301-303', 'Band k-path for 1D / 2D / 3D structures (k-path tool)', { send: 'kpath' }],
      ['-', 'k-point convergence test (L series and driver script)', { stage: 'kconv' }],
    ]},
    { cat: '04-08 Structure, symmetry and models', items: [
      ['400/401', 'Supercell and transformation matrix', { stage: 'structure', tab: 'supercell' }],
      ['402', 'Selective dynamics / fix layers', { stage: 'structure', tab: 'supercell' }],
      ['501-509', 'Catalysis: slabs, adsorbates, ZPE and Gibbs', { stage: 'structure', tab: 'catalyst' }],
      ['601-609', 'Symmetry, space group, Wyckoff, primitive cell', { stage: 'structure', tab: 'symmetry' }],
      ['800-827', 'Slabs, vacuum, heterostructures, defects', { stage: 'structure', tab: 'catalyst' }],
      ['-', 'Magnetic orderings FM, AFM-A/C/G/II (Magnetic tool)', { send: 'magnetic' }],
      ['-', 'Per-atom moments, non-collinear 120 deg start', { stage: 'structure', tab: 'magnetic' }],
      ['-', 'Atoms, substitution, vacancies, interstitials', { stage: 'structure', tab: 'atoms' }],
      ['-', 'Sample crystal library (350 structures)', { stage: 'structure', library: true }],
    ]},
    { cat: '11-28 Electronic structure', items: [
      ['111-126', 'Total DOS (DOSCAR)', { stage: 'analyze', tab: 'elec' }],
      ['211-216', 'Band structure and gap (EIGENVAL)', { stage: 'analyze', tab: 'elec' }],
      ['-', 'SCF / ionic convergence (OSZICAR, OUTCAR)', { stage: 'analyze', tab: 'elec' }],
    ]},
    { cat: '31-68 Charge, potential, magnetism', items: [
      ['310-329', 'Charge, spin density and Bader (Input Builder task)', { send: 'input-builder', task: 'bader' }],
      ['420-443', 'Planar-averaged potential / work function (LOCPOT)', { stage: 'analyze', tab: 'elec' }],
      ['621-682', 'Magnetic anisotropy, SOC (Input Builder task)', { send: 'input-builder', task: 'soc' }],
    ]},
    { cat: '71-95 Optics, MD, phonons', items: [
      ['710-719', 'Optical spectra (Input Builder task)', { send: 'input-builder', task: 'optics' }],
      ['721-737', 'AIMD MSD and diffusion (XDATCAR)', { stage: 'analyze', tab: 'md' }],
      ['952-955', 'Phonopy dispersion and thermal properties', { stage: 'analyze', tab: 'phonon' }],
      ['501/509', 'Thermochemistry: ZPE, Gibbs correction, half-life', { stage: 'analyze', tab: 'eos' }],
    ]},
  ];

  return { SUFFIX_GUIDE, RECOMMENDED_PREFS, PP_LIB_DIRS, CATALOG };
})();
