// Editable starter crystal templates for Material Builder crystal mode (M10.4).
// @source S-034, S-042
import type { Structure } from '../../../lib/crystal/types';

export interface CrystalTemplate {
  readonly id: string;
  readonly label: string;
  readonly structure: Structure;
}

export const CRYSTAL_TEMPLATES: readonly CrystalTemplate[] = [
  {
    id: 'rocksalt',
    label: 'Rock salt (NaCl)',
    structure: {
      comment: 'Rock salt NaCl conventional',
      lattice: [
        [5.64, 0, 0],
        [0, 5.64, 0],
        [0, 0, 5.64],
      ],
      species: ['Na', 'Na', 'Na', 'Na', 'Cl', 'Cl', 'Cl', 'Cl'],
      frac: [
        [0, 0, 0],
        [0, 0.5, 0.5],
        [0.5, 0, 0.5],
        [0.5, 0.5, 0],
        [0.5, 0.5, 0.5],
        [0.5, 0, 0],
        [0, 0.5, 0],
        [0, 0, 0.5],
      ],
    },
  },
  {
    id: 'perovskite',
    label: 'Cubic perovskite (SrTiO3)',
    structure: {
      comment: 'Cubic perovskite SrTiO3',
      lattice: [
        [3.905, 0, 0],
        [0, 3.905, 0],
        [0, 0, 3.905],
      ],
      species: ['Sr', 'Ti', 'O', 'O', 'O'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, 0],
        [0.5, 0, 0.5],
        [0, 0.5, 0.5],
      ],
    },
  },
  {
    id: 'fcc',
    label: 'fcc (Cu)',
    structure: {
      comment: 'fcc Cu conventional',
      lattice: [
        [3.61, 0, 0],
        [0, 3.61, 0],
        [0, 0, 3.61],
      ],
      species: ['Cu', 'Cu', 'Cu', 'Cu'],
      frac: [
        [0, 0, 0],
        [0, 0.5, 0.5],
        [0.5, 0, 0.5],
        [0.5, 0.5, 0],
      ],
    },
  },
  {
    id: 'bcc',
    label: 'bcc (Fe)',
    structure: {
      comment: 'bcc Fe conventional',
      lattice: [
        [2.87, 0, 0],
        [0, 2.87, 0],
        [0, 0, 2.87],
      ],
      species: ['Fe', 'Fe'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
      ],
    },
  },
  {
    id: 'hcp',
    label: 'hcp (Mg)',
    structure: {
      comment: 'hcp Mg',
      lattice: [
        [3.21, 0, 0],
        [-1.605, 2.7799, 0],
        [0, 0, 5.21],
      ],
      species: ['Mg', 'Mg'],
      frac: [
        [1 / 3, 2 / 3, 0.25],
        [2 / 3, 1 / 3, 0.75],
      ],
    },
  },
  {
    id: 'rutile',
    label: 'Rutile (TiO2)',
    structure: {
      comment: 'Rutile TiO2',
      lattice: [
        [4.594, 0, 0],
        [0, 4.594, 0],
        [0, 0, 2.959],
      ],
      species: ['Ti', 'Ti', 'O', 'O', 'O', 'O'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
        [0.305, 0.305, 0],
        [0.695, 0.695, 0],
        [0.805, 0.195, 0.5],
        [0.195, 0.805, 0.5],
      ],
    },
  },
];
