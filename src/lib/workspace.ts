// The site's tools, grouped by the stage of a calculation they serve. The tools index renders this list and
// the home page counts it, so both always agree with the routes that exist.

export interface WorkspaceTool {
  /** Stable fragment id on /tools/. */
  id: string;
  title: string;
  href: string;
  text: string;
}

export interface WorkspaceStage {
  id: string;
  title: string;
  text: string;
  tools: WorkspaceTool[];
}

/** True once the dedicated molecule page exists; until then Molecule mode lives inside /builder/. */
export const HAS_MOLECULE_PAGE =
  Object.keys(import.meta.glob('../pages/builder/molecule/index.astro')).length > 0;

export const STAGES: WorkspaceStage[] = [
  {
    id: 'stage-structure',
    title: 'Structure',
    text: 'Find or build the structure you want to calculate.',
    tools: [
      {
        id: 'builder',
        title: 'Material Builder',
        href: '/builder/',
        text: 'View and edit a crystal in 3D, then run the VASP workflow: POTCAR, INCAR, KPOINTS, k-point convergence, run bundle and analysis.',
      },
      {
        id: 'molecule',
        title: 'Molecule builder',
        href: HAS_MOLECULE_PAGE ? '/builder/molecule/' : '/builder/',
        text: 'Draw a molecule, clean it up in 3D and export XYZ, MOL or a POSCAR in a box.',
      },
      {
        id: 'studio',
        title: 'Materials Screening',
        href: '/studio/',
        text: 'Explore a table of candidate materials and turn a shortlist into a first project.',
      },
    ],
  },
  {
    id: 'stage-inputs',
    title: 'Inputs',
    text: 'Write the input files and the settings the structure needs.',
    tools: [
      {
        id: 'input-builder',
        title: 'Input builder',
        href: '/tools/input-builder/',
        text: 'Prepare POSCAR, KPOINTS and INCAR files with plain-language explanations and warnings for risky combinations.',
      },
      {
        id: 'kpath',
        title: 'Brillouin zone and k-path viewer',
        href: '/tools/kpath/',
        text: 'See the Brillouin zone of your structure in 3D and export a k-path for a band-structure run.',
      },
      {
        id: 'magnetic',
        title: 'Magnetic configuration tool',
        href: '/tools/magnetic/',
        text: 'Build ferromagnetic and antiferromagnetic orderings for your cell and download POSCAR, MAGMOM and INCAR files.',
      },
    ],
  },
  {
    id: 'stage-convergence',
    title: 'Convergence',
    text: 'Check that the numbers stop changing before you trust them.',
    tools: [
      {
        id: 'convergence',
        title: 'Convergence plotter',
        href: '/tools/convergence/',
        text: 'Paste results from a series of runs and see whether the energy has settled.',
      },
      {
        id: 'eos',
        title: 'Equation of state fit',
        href: '/tools/eos/',
        text: 'Fit energy-volume points to Birch-Murnaghan or Murnaghan and read V0, the bulk modulus and the lattice constant.',
      },
    ],
  },
  {
    id: 'stage-run',
    title: 'Run and review',
    text: 'Plan the runs, then check what came back.',
    tools: [
      {
        id: 'planner',
        title: 'Research planner',
        href: '/tools/planner/',
        text: 'Pick a calculation goal to generate a sourced, step-by-step VASP workflow, starter INCARs, methods checklist, and zip.',
      },
      {
        id: 'errors',
        title: 'Error finder',
        href: '/errors/',
        text: 'Paste a VASP error message or describe a symptom and see likely causes and fixes, in order.',
      },
      {
        id: 'review',
        title: 'Calculation review',
        href: '/tools/review/',
        text: 'Drop VASP inputs and outputs (or a zip) for sourced pre-flight and post-flight checks.',
      },
    ],
  },
  {
    id: 'stage-properties',
    title: 'Properties',
    text: 'Turn finished runs into the quantities you report.',
    tools: [
      {
        id: 'tolerance',
        title: 'Tolerance-factor explorer',
        href: '/tools/tolerance-factor/',
        text: 'Check whether a chosen set of ions is likely to form a perovskite, with the radii and the formula shown.',
      },
      {
        id: 'work-function',
        title: 'Work function and charge difference',
        href: '/tools/work-function/',
        text: 'Planar and macroscopic averages of LOCPOT, work function Phi = V_vac - E_F, and CHGCAR differences.',
      },
    ],
  },
];

/** Distinct tool destinations listed on /tools/ (the molecule card shares /builder/ until its page exists). */
export const TOOL_COUNT = new Set(STAGES.flatMap((s) => s.tools.map((t) => t.href))).size;
