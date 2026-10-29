import { describe, expect, it } from 'vitest';
import { citeOrder, moduleLabel, levelNotes, neighbors, presentSections, splitId } from './topic';

describe('topic helpers', () => {
  it('splits an entry id into module and topic', () => {
    expect(splitId('00-start/how-to-use-this-site')).toEqual({
      module: '00-start',
      topic: 'how-to-use-this-site',
    });
  });

  it('numbers citations by first use and ignores repeats', () => {
    const body = 'a <Cite id="S-031" /> b <Cite id="S-047"/> c <Cite id="S-031" />';
    expect(citeOrder(body)).toEqual(['S-031', 'S-047']);
  });

  it('lists the present sections in anatomy order', () => {
    const body = '<Why>\nx\n</Why>\n<Intuition>\ny</Intuition>\n<Lab id="a" />\n<GoDeeper>z</GoDeeper>';
    expect(presentSections(body).map((s) => s.id)).toEqual(['why', 'intuition', 'lab', 'go-deeper']);
  });

  it('labels a module folder', () => {
    expect(moduleLabel('02-quantum-basics')).toBe('Quantum basics');
  });
});

describe('neighbors', () => {
  const list = [
    { id: 'a/1', title: 'One' },
    { id: 'a/2', title: 'Two' },
    { id: 'b/1', title: 'Three' },
  ];
  it('returns both sides in the middle, one side at the ends, none for a lone or unknown id', () => {
    expect(neighbors(list, 'a/2')).toEqual({ prev: list[0], next: list[2] });
    expect(neighbors(list, 'a/1')).toEqual({ prev: null, next: list[1] });
    expect(neighbors(list, 'b/1')).toEqual({ prev: list[1], next: null });
    expect(neighbors([list[0]!], 'a/1')).toEqual({ prev: null, next: null });
    expect(neighbors(list, 'zzz')).toEqual({ prev: null, next: null });
  });
});

describe('levelNotes', () => {
  it('names the levels that add content', () => {
    expect(levelNotes('<Level min="intermediate">x</Level>')).toBe('Has Intermediate notes');
    expect(levelNotes('<Level min="intermediate">a</Level>\n<Level min="pro">b</Level>')).toBe(
      'Has Intermediate and Pro notes',
    );
    expect(levelNotes('<Level max="beginner">x</Level>')).toBe('');
    expect(levelNotes('plain')).toBe('');
  });
});
