// Web Worker: computes the toy-model convergence curve off the main thread.
import { convergenceCurve, type CurvePoint, type Potential1D } from './kp1d';

export interface CurveRequest {
  id: number;
  a: number;
  potential: Potential1D;
  k: number;
  cutoffs: number[];
  nOcc: number;
}
export interface CurveResponse {
  id: number;
  points: CurvePoint[];
}

self.onmessage = (e: MessageEvent<CurveRequest>) => {
  const { id, a, potential, k, cutoffs, nOcc } = e.data;
  const msg: CurveResponse = { id, points: convergenceCurve({ a, potential, k }, cutoffs, nOcc) };
  (self as unknown as Worker).postMessage(msg);
};
