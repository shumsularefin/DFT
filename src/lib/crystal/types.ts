// Core crystal types, exactly as in docs/ARCHITECTURE.md section 3. Extend, do not redefine.
// Lattices are 3x3 row-major: rows are lattice vectors in Angstrom (POSCAR convention).

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export interface Structure {
  readonly lattice: Mat3;
  /** One element symbol per site ('Ti'). */
  readonly species: readonly string[];
  /** Optional raw POSCAR label per site ('Ti_pv'). */
  readonly labels?: readonly string[];
  /** Fractional coordinates. */
  readonly frac: readonly Vec3[];
  readonly comment?: string;
  readonly selective?: readonly (readonly [boolean, boolean, boolean])[];
}
