// The work the parse worker does, as plain functions so the same code runs in a worker, on the main thread (fallback)
// and in tests. Large files report progress as a fraction from 0 to 1.
import { parseChgcar, type ChgcarResult } from './chgcar';
import { parseDoscar, type DoscarResult } from './doscar';
import { parseEigenval, type EigenvalResult } from './eigenval';
import { parseXdatcar, type XdatcarResult } from './xdatcar';
import { outcarSteps, type RelaxStep } from './relaxSteps';
import { marchingCubes, type Lattice, type Mesh } from '../physics/marchingCubes';

export type ParseRequest =
  | { kind: 'chgcar'; text: string }
  | { kind: 'doscar'; text: string }
  | { kind: 'eigenval'; text: string }
  | { kind: 'xdatcar'; text: string }
  | { kind: 'outcar-steps'; text: string }
  | {
      kind: 'mesh';
      values: Float64Array;
      dims: [number, number, number];
      iso: number;
      lattice: Lattice;
      periodic: boolean;
    };

export interface ParseResultMap {
  chgcar: ChgcarResult;
  doscar: DoscarResult;
  eigenval: EigenvalResult;
  xdatcar: XdatcarResult;
  'outcar-steps': RelaxStep[];
  mesh: Mesh;
}

export function runJob<K extends ParseRequest['kind']>(
  req: Extract<ParseRequest, { kind: K }>,
  onProgress?: (fraction: number) => void,
): ParseResultMap[K];
export function runJob(
  req: ParseRequest,
  onProgress?: (fraction: number) => void,
): ParseResultMap[ParseRequest['kind']] {
  switch (req.kind) {
    case 'chgcar':
      return parseChgcar(req.text, onProgress);
    case 'doscar':
      return parseDoscar(req.text);
    case 'eigenval':
      return parseEigenval(req.text);
    case 'xdatcar':
      return parseXdatcar(req.text);
    case 'outcar-steps':
      return outcarSteps(req.text);
    case 'mesh':
      return marchingCubes({
        values: req.values,
        dims: req.dims,
        iso: req.iso,
        lattice: req.lattice,
        periodic: req.periodic,
        ...(onProgress ? { onProgress } : {}),
      });
  }
}
