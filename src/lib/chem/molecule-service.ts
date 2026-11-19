// Request handling for the RDKit worker (M10.3), kept apart from the worker so it can be tested in Node with the same
// RDKit build. The worker only adds loading the wasm and message passing.
// @source S-035
import { geometry3d, type Geom3dResult } from './geom3d';
import {
  checkGraph,
  depictSvg,
  expandHydrogens,
  layout2d,
  parseMolecule,
  type MolGraph,
  type RdkitApi,
} from './molgraph';
import type { Issue } from './validity';

/** `check`: read SMILES or a MOL block (or check a graph), lay it out in 2D and draw it. `geometry`: also build rough 3D coordinates. */
export interface RdkitRequest {
  id: number;
  op: 'check' | 'geometry';
  input: string | MolGraph;
  seed?: number;
}
export interface MoleculeReport {
  ok: boolean;
  issues: Issue[];
  /** Laid-out graph (hydrogens as counts), when RDKit accepted it. */
  graph?: MolGraph;
  smiles?: string;
  molblock?: string;
  svg?: string;
  layout?: 'CoordGen' | 'RDKit default';
  geometry?: Geom3dResult;
}
export type RdkitResponse =
  { id: number; ok: true; result: MoleculeReport } | { id: number; ok: false; error: string };

export function handleMolecule(rd: RdkitApi, req: RdkitRequest): MoleculeReport {
  const out = typeof req.input === 'string' ? parseMolecule(rd, req.input) : checkGraph(rd, req.input);
  if (!out.ok) return { ok: false, issues: out.issues, ...(out.graph ? { graph: out.graph } : {}) };
  const { graph, method } = layout2d(rd, out.graph);
  const report: MoleculeReport = {
    ok: true,
    issues: [],
    graph,
    smiles: out.smiles,
    molblock: out.molblock,
    svg: depictSvg(rd, graph, 320, 220),
    layout: method,
  };
  if (req.op === 'geometry') {
    // The 2D layout of the hydrogen-expanded graph is the start, so the hydrogens begin in sensible places.
    const start = layout2d(rd, expandHydrogens(graph)).graph;
    report.geometry = geometry3d(start, req.seed === undefined ? {} : { seed: req.seed });
  }
  return report;
}
