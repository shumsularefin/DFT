// A small synchronous symmetry provider for cubic cells (M16.13). The 3D stages build slabs on every slider change on
// the main thread, where the moyo WebAssembly module (S-032) is not loaded. For a cell with a cubic lattice (a times the
// identity) every point operation of the lattice is one of the 48 signed permutation matrices, so the space-group
// operations are found exhaustively: for each of them, every translation that maps the first atom onto an atom of the
// same species is tried, and kept when it maps the whole crystal onto itself. The result is wrapped as a `MoyoApi`
// so `buildSlab` and `slabPlan` (S-064) run unchanged; only the operations and orbits are filled in, which is all the
// slab builder reads. Tests check the operation count and the slabs against moyo itself.
// @source S-036 S-105 S-032
import { atomicNumber } from './elements';
import type { MoyoApi, MoyoDatasetLike } from './symmetry';

type M3 = number[][];

/** The 48 signed permutation matrices (the point group m-3m of the cube). */
export function cubicRotations(): M3[] {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const out: M3[] = [];
  for (const p of perms)
    for (let s = 0; s < 8; s++) {
      const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      const m: M3 = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (let i = 0; i < 3; i++) m[i]![p[i]!] = sg[i]!;
      out.push(m);
    }
  return out;
}

const wrap = (x: number): number => {
  const r = x - Math.floor(x);
  return r > 1 - 1e-7 ? 0 : r;
};
const close = (a: readonly number[], b: readonly number[], tol: number): boolean =>
  a.every((x, k) => {
    const d = Math.abs(x - b[k]!) % 1;
    return d < tol || 1 - d < tol;
  });

/** Space-group operations (rotation R on fractional columns, translation t) of a cell whose lattice is cubic. */
export function cubicOperations(
  frac: readonly (readonly number[])[],
  numbers: readonly number[],
  tol = 1e-4,
): { rotation: M3; translation: number[] }[] {
  const ops: { rotation: M3; translation: number[] }[] = [];
  const apply = (R: M3, x: readonly number[]): number[] =>
    [0, 1, 2].map((i) => R[i]![0]! * x[0]! + R[i]![1]! * x[1]! + R[i]![2]! * x[2]!);
  for (const R of cubicRotations()) {
    const r0 = apply(R, frac[0]!);
    const seen: number[][] = [];
    for (let j = 0; j < frac.length; j++) {
      if (numbers[j] !== numbers[0]) continue;
      const t = [0, 1, 2].map((k) => wrap(frac[j]![k]! - r0[k]!));
      if (seen.some((u) => close(u, t, tol))) continue;
      seen.push(t);
      const ok = frac.every((x, i) => {
        const y = apply(R, x).map((v, k) => v + t[k]!);
        return frac.some((z, m) => numbers[m] === numbers[i] && close(y, z, tol));
      });
      if (ok) ops.push({ rotation: R, translation: t });
    }
  }
  return ops;
}

/** Is the lattice a times the identity (rows), within tol angstrom? */
export function isCubicLattice(basis: readonly number[], tol = 1e-6): boolean {
  const a = basis[0]!;
  return basis.every((x, i) => Math.abs(x - (i % 4 === 0 ? a : 0)) < tol) && a > 0;
}

/** A `MoyoApi` for cubic cells only (throws otherwise), filling operations and orbits. */
export const cubicMoyo: MoyoApi = {
  analyze_cell(cellJson: string, symprec: number): MoyoDatasetLike {
    const cell = JSON.parse(cellJson) as {
      lattice: { basis: number[] };
      positions: number[][];
      numbers: number[];
    };
    if (!isCubicLattice(cell.lattice.basis))
      throw new RangeError('cubicMoyo handles cubic cells (a times the identity) only.');
    const ops = cubicOperations(cell.positions, cell.numbers, Math.max(symprec, 1e-6));
    const colMajor = (R: M3): number[] => [0, 1, 2].flatMap((j) => [R[0]![j]!, R[1]![j]!, R[2]![j]!]);
    const orbits = cell.positions.map((x, i) => {
      for (let m = 0; m <= i; m++) {
        if (cell.numbers[m] !== cell.numbers[i]) continue;
        const hit = ops.some((o) => {
          const y = [0, 1, 2].map(
            (k) =>
              o.rotation[k]![0]! * x[0]! +
              o.rotation[k]![1]! * x[1]! +
              o.rotation[k]![2]! * x[2]! +
              o.translation[k]!,
          );
          return close(y, cell.positions[m]!, 1e-4);
        });
        if (hit) return m;
      }
      return i;
    });
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return {
      number: 0,
      hall_number: 0,
      hm_symbol: '',
      operations: ops.map((o) => ({ rotation: colMajor(o.rotation), translation: o.translation })),
      orbits,
      wyckoffs: cell.positions.map(() => ''),
      site_symmetry_symbols: cell.positions.map(() => ''),
      std_cell: cell,
      std_linear: identity,
      std_origin_shift: [0, 0, 0],
      pearson_symbol: '',
      prim_std_cell: cell,
      prim_std_linear: identity,
      prim_std_origin_shift: [0, 0, 0],
      mapping_std_prim: cell.positions.map((_, i) => i),
    };
  },
};

/** Atomic numbers of element symbols (for calling `cubicOperations` on a Structure). */
export const numbersOf = (species: readonly string[]): number[] => species.map((s) => atomicNumber(s) ?? 0);
