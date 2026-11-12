import { describe, it, expect } from 'vitest';
import { CELLS, cellOf, cellLabel, neighbour, matchElements } from './periodic';

const at = (s: string) => {
  const c = cellOf(s)!;
  return [c.row, c.col];
};

describe('layout', () => {
  it('has 103 cells with unique positions', () => {
    expect(CELLS).toHaveLength(103);
    expect(new Set(CELLS.map((c) => `${c.row},${c.col}`)).size).toBe(103);
  });
  it('known positions', () => {
    expect(at('H')).toEqual([1, 1]);
    expect(at('He')).toEqual([1, 18]);
    expect(at('Li')).toEqual([2, 1]);
    expect(at('B')).toEqual([2, 13]);
    expect(at('Ne')).toEqual([2, 18]);
    expect(at('Al')).toEqual([3, 13]);
    expect(at('K')).toEqual([4, 1]);
    expect(at('Cu')).toEqual([4, 11]);
    expect(at('Kr')).toEqual([4, 18]);
    expect(at('Y')).toEqual([5, 3]);
    expect(at('Ba')).toEqual([6, 2]);
    expect(at('Hf')).toEqual([6, 4]);
    expect(at('Rn')).toEqual([6, 18]);
    expect(at('La')).toEqual([8, 3]);
    expect(at('Lu')).toEqual([8, 17]);
    expect(at('Ra')).toEqual([7, 2]);
    expect(at('Ac')).toEqual([9, 3]);
    expect(at('Lr')).toEqual([9, 17]);
  });
  it('categories follow the layout', () => {
    expect(cellOf('Na')!.category).toBe('alkali metal');
    expect(cellOf('Sr')!.category).toBe('alkaline earth metal');
    expect(cellOf('Ti')!.category).toBe('transition metal');
    expect(cellOf('Nd')!.category).toBe('lanthanide');
    expect(cellOf('Cl')!.category).toBe('halogen');
    expect(cellOf('Ar')!.category).toBe('noble gas');
    expect(cellOf('Pb')!.category).toBe('other p-block element');
  });
  it('labels for screen readers', () => {
    expect(cellLabel(cellOf('Cu')!)).toBe('Copper, Cu, atomic number 29');
  });
});

describe('arrow navigation', () => {
  it('moves by position and stops at edges', () => {
    expect(neighbour('Ti', 'right')).toBe('V');
    expect(neighbour('Ti', 'left')).toBe('Sc');
    expect(neighbour('H', 'left')).toBe('H');
    expect(neighbour('H', 'right')).toBe('He');
    expect(neighbour('Ti', 'down')).toBe('Zr');
    expect(neighbour('Zr', 'up')).toBe('Ti');
    expect(neighbour('H', 'up')).toBe('H');
    expect(neighbour('Li', 'up')).toBe('H');
  });
  it('walks from the main table into the f rows', () => {
    expect(cellOf(neighbour('Ra', 'down'))!.row).toBe(8);
    expect(neighbour('Lu', 'down')).toBe('Lr');
  });
});

describe('search', () => {
  it('matches symbol, name and atomic number', () => {
    expect(matchElements('cu').map((c) => c.symbol)).toContain('Cu');
    expect(matchElements('copper').map((c) => c.symbol)).toEqual(['Cu']);
    expect(matchElements('29').map((c) => c.symbol)).toEqual(['Cu']);
    expect(matchElements('')).toHaveLength(103);
    expect(matchElements('zzz')).toHaveLength(0);
  });
});
