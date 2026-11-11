/**
 * Periodic-table layout and navigation (pure logic for the PeriodicTable component).
 * Names come from src/data/elements.json (S-034). Positions and categories follow from the table layout only:
 * 7 main rows by 18 groups, with the lanthanides (La to Lu) and actinides (Ac to Lr) in two extra rows below.
 */
import names from '../../data/elements.json';
import { SYMBOLS } from '../crystal/elements';

export interface Cell {
  z: number;
  symbol: string;
  name: string;
  /** 1 to 7 main rows, 8 lanthanides, 9 actinides */
  row: number;
  /** 1 to 18 */
  col: number;
  category: Category;
}

export type Category =
  | 'hydrogen'
  | 'alkali metal'
  | 'alkaline earth metal'
  | 'transition metal'
  | 'lanthanide'
  | 'actinide'
  | 'other p-block element'
  | 'halogen'
  | 'noble gas';

export const CATEGORIES: readonly Category[] = [
  'hydrogen',
  'alkali metal',
  'alkaline earth metal',
  'transition metal',
  'lanthanide',
  'actinide',
  'other p-block element',
  'halogen',
  'noble gas',
];

const NAMES = names.names as Record<string, string>;

function position(z: number): { row: number; col: number } {
  if (z === 1) return { row: 1, col: 1 };
  if (z === 2) return { row: 1, col: 18 };
  if (z <= 4) return { row: 2, col: z - 2 };
  if (z <= 10) return { row: 2, col: z + 8 };
  if (z <= 12) return { row: 3, col: z - 10 };
  if (z <= 18) return { row: 3, col: z };
  if (z <= 36) return { row: 4, col: z - 18 };
  if (z <= 54) return { row: 5, col: z - 36 };
  if (z <= 56) return { row: 6, col: z - 54 };
  if (z <= 71) return { row: 8, col: z - 54 };
  if (z <= 86) return { row: 6, col: z - 68 };
  if (z <= 88) return { row: 7, col: z - 86 };
  return { row: 9, col: z - 86 };
}

function categoryOf(z: number, row: number, col: number): Category {
  if (z === 1) return 'hydrogen';
  if (row === 8) return 'lanthanide';
  if (row === 9) return 'actinide';
  if (col === 1) return 'alkali metal';
  if (col === 2) return 'alkaline earth metal';
  if (col <= 12) return 'transition metal';
  if (col === 17) return 'halogen';
  if (col === 18) return 'noble gas';
  return 'other p-block element';
}

export const CELLS: readonly Cell[] = SYMBOLS.map((symbol, i) => {
  const z = i + 1;
  const { row, col } = position(z);
  return { z, symbol, name: NAMES[symbol] ?? symbol, row, col, category: categoryOf(z, row, col) };
});

const BY_SYMBOL = new Map(CELLS.map((c) => [c.symbol, c]));
export const cellOf = (symbol: string): Cell | undefined => BY_SYMBOL.get(symbol);

/** Accessible name read by screen readers, for example "Copper, Cu, atomic number 29". */
export const cellLabel = (c: Cell): string => `${c.name}, ${c.symbol}, atomic number ${c.z}`;

export type Dir = 'left' | 'right' | 'up' | 'down';

/** The cell reached by one arrow-key press from `symbol`, or the same cell at an edge. Moves by position. */
export function neighbour(symbol: string, dir: Dir, pool: readonly Cell[] = CELLS): string {
  const from = BY_SYMBOL.get(symbol);
  if (!from) return symbol;
  if (dir === 'left' || dir === 'right') {
    const step = dir === 'right' ? 1 : -1;
    const next = pool
      .filter((c) => c.row === from.row && (c.col - from.col) * step > 0)
      .sort((a, b) => (a.col - b.col) * step)[0];
    return next ? next.symbol : symbol;
  }
  const step = dir === 'down' ? 1 : -1;
  const rows = [...new Set(pool.map((c) => c.row))]
    .filter((r) => (r - from.row) * step > 0)
    .sort((a, b) => (a - b) * step);
  const row = rows[0];
  if (row === undefined) return symbol;
  const best = pool
    .filter((c) => c.row === row)
    .sort((a, b) => Math.abs(a.col - from.col) - Math.abs(b.col - from.col) || a.col - b.col)[0];
  return best ? best.symbol : symbol;
}

/** Elements whose symbol or name starts with the query, or whose atomic number equals it. Case-insensitive. */
export function matchElements(query: string, pool: readonly Cell[] = CELLS): Cell[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...pool];
  return pool.filter(
    (c) => c.symbol.toLowerCase().startsWith(q) || c.name.toLowerCase().startsWith(q) || String(c.z) === q,
  );
}
