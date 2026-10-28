import { describe, expect, it } from 'vitest';
import { citeOrder, moduleLabel, presentSections, splitId } from './topic';

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
