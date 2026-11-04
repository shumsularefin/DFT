// Niggli reduction of a lattice, following the steps of spglib's niggli.c (Grosse-Kunstleve, Sauter and Adams, Acta
// Cryst. A60, 1 (2004)). Ported from spglib 2.8.0 (BSD-3-Clause, Copyright (C) 2023 Atsushi Togo); see THIRD_PARTY_NOTICES.md.
// SeeK-path needs spglib's exact tie-breaking for triclinic cells, which is why this follows the C code step by step.
// @source S-055 (spglib niggli.c, Grosse-Kunstleve et al. 2004), S-006 (HPKOT uses the Niggli-reduced reciprocal cell for aP)
import { mul, transpose } from './linalg';
import type { Mat3 } from './types';

type M = [number[], number[], number[]];
const IDENT = (): M => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

interface State {
  A: number;
  B: number;
  C: number;
  xi: number;
  eta: number;
  zeta: number;
  l: number;
  m: number;
  n: number;
  eps: number;
  /** Lattice vectors are the COLUMNS, as in spglib's C code. */
  lat: Mat3;
  t: M;
}

const sign3 = (x: number, eps: number): number => (x < -eps ? -1 : x > eps ? 1 : 0);

function setParameters(p: State): void {
  const L = p.lat;
  const G = mul(transpose(L), L);
  p.A = G[0][0];
  p.B = G[1][1];
  p.C = G[2][2];
  p.xi = G[1][2] * 2;
  p.eta = G[0][2] * 2;
  p.zeta = G[0][1] * 2;
  p.l = sign3(p.xi, p.eps);
  p.m = sign3(p.eta, p.eps);
  p.n = sign3(p.zeta, p.eps);
}

const set = (p: State, rows: number[][]): void => {
  p.t = rows.map((r) => r.slice()) as M;
};

function step1(p: State): boolean {
  if (p.A > p.B + p.eps || (!(Math.abs(p.A - p.B) > p.eps) && Math.abs(p.xi) > Math.abs(p.eta) + p.eps)) {
    set(p, [
      [0, -1, 0],
      [-1, 0, 0],
      [0, 0, -1],
    ]);
    return true;
  }
  return false;
}
function step2(p: State): boolean {
  if (p.B > p.C + p.eps || (!(Math.abs(p.B - p.C) > p.eps) && Math.abs(p.eta) > Math.abs(p.zeta) + p.eps)) {
    set(p, [
      [-1, 0, 0],
      [0, 0, -1],
      [0, -1, 0],
    ]);
    return true;
  }
  return false;
}
function step3(p: State): boolean {
  if (p.l * p.m * p.n === 1) {
    const i = p.l === -1 ? -1 : 1;
    const j = p.m === -1 ? -1 : 1;
    const k = p.n === -1 ? -1 : 1;
    set(p, [
      [i, 0, 0],
      [0, j, 0],
      [0, 0, k],
    ]);
    return true;
  }
  return false;
}
function step4(p: State): boolean {
  if (p.l === -1 && p.m === -1 && p.n === -1) return false;
  const prod = p.l * p.m * p.n;
  if (prod === 0 || prod === -1) {
    let i = 1;
    let j = 1;
    let k = 1;
    let r = -1;
    if (p.l === 1) i = -1;
    if (p.l === 0) r = 0;
    if (p.m === 1) j = -1;
    if (p.m === 0) r = 1;
    if (p.n === 1) k = -1;
    if (p.n === 0) r = 2;
    if (i * j * k === -1) {
      if (r === 0) i = -1;
      if (r === 1) j = -1;
      if (r === 2) k = -1;
    }
    set(p, [
      [i, 0, 0],
      [0, j, 0],
      [0, 0, k],
    ]);
    return true;
  }
  return false;
}
function step5(p: State): boolean {
  const e = p.eps;
  if (
    Math.abs(p.xi) > p.B + e ||
    (!(Math.abs(p.B - p.xi) > e) && 2 * p.eta < p.zeta - e) ||
    (!(Math.abs(p.B + p.xi) > e) && p.zeta < -e)
  ) {
    const t = IDENT();
    if (p.xi > 0) t[1]![2] = -1;
    if (p.xi < 0) t[1]![2] = 1;
    set(p, t);
    return true;
  }
  return false;
}
function step6(p: State): boolean {
  const e = p.eps;
  if (
    Math.abs(p.eta) > p.A + e ||
    (!(Math.abs(p.A - p.eta) > e) && 2 * p.xi < p.zeta - e) ||
    (!(Math.abs(p.A + p.eta) > e) && p.zeta < -e)
  ) {
    const t = IDENT();
    if (p.eta > 0) t[0]![2] = -1;
    if (p.eta < 0) t[0]![2] = 1;
    set(p, t);
    return true;
  }
  return false;
}
function step7(p: State): boolean {
  const e = p.eps;
  if (
    Math.abs(p.zeta) > p.A + e ||
    (!(Math.abs(p.A - p.zeta) > e) && 2 * p.xi < p.eta - e) ||
    (!(Math.abs(p.A + p.zeta) > e) && p.eta < -e)
  ) {
    const t = IDENT();
    if (p.zeta > 0) t[0]![1] = -1;
    if (p.zeta < 0) t[0]![1] = 1;
    set(p, t);
    return true;
  }
  return false;
}
function step8(p: State): boolean {
  const e = p.eps;
  const s = p.xi + p.eta + p.zeta + p.A + p.B;
  if (s < -e || (!(Math.abs(s) > e) && 2 * (p.A + p.eta) + p.zeta > e)) {
    set(p, [
      [1, 0, 1],
      [0, 1, 1],
      [0, 0, 1],
    ]);
    return true;
  }
  return false;
}

const STEPS = [step1, step2, step3, step4, step5, step6, step7, step8];
/** After these steps (0-based) spglib restarts from step 1. */
const RESTART = new Set([1, 4, 5, 6, 7]);

/**
 * Niggli-reduced lattice. `rows` are the lattice vectors as rows (like spglib.niggli_reduce in Python, which transposes
 * for the C code); the result is again rows. Throws RangeError if the iteration does not settle within maxAttempts.
 */
export function niggliReduce(rows: Mat3, eps = 1e-5, maxAttempts = 1000): Mat3 {
  const p: State = {
    A: 0,
    B: 0,
    C: 0,
    xi: 0,
    eta: 0,
    zeta: 0,
    l: 0,
    m: 0,
    n: 0,
    eps,
    lat: transpose(rows),
    t: IDENT(),
  };
  setParameters(p);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let j = 0;
    for (; j < 8; j++) {
      if (STEPS[j]!(p)) {
        p.lat = mul(p.lat, p.t as unknown as Mat3);
        setParameters(p);
        if (RESTART.has(j)) break;
      }
    }
    if (j === 8) return transpose(p.lat);
  }
  throw new RangeError('Niggli reduction did not settle; the cell may be degenerate.');
}
