// Web Worker: draws orbital point clouds off the main thread so sliders stay responsive.
import { sampleOrbital } from './hydrogen';

export interface SampleRequest {
  id: number;
  n: number;
  l: number;
  m: number;
  count: number;
  seed: number;
}
export interface SampleResponse {
  id: number;
  positions: Float32Array;
  signs: Int8Array;
  extent: number;
}

self.onmessage = (e: MessageEvent<SampleRequest>) => {
  const { id, n, l, m, count, seed } = e.data;
  const cloud = sampleOrbital(n, l, m, count, seed);
  const msg: SampleResponse = { id, ...cloud };
  (self as unknown as Worker).postMessage(msg, [cloud.positions.buffer, cloud.signs.buffer]);
};
