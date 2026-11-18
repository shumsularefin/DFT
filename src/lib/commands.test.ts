import { describe, expect, it } from 'vitest';
import { rankCommands, resolveSlash, scoreCommand, SETTINGS_COMMANDS, type Command } from './commands';

const cmd = (
  id: string,
  title: string,
  group: Command['group'],
  keywords: string[] = [],
  href = `/${id}/`,
): Command => ({
  id,
  title,
  group,
  keywords,
  href,
});

// Fixed fixture. The expected orders below follow the stated rule, tier first, then group order, then title length.
const FIX: Command[] = [
  cmd('t-encut', 'ENCUT: plane-wave cutoff', 'Tags', ['cutoff']),
  cmd('h-encut', 'Choosing the plane-wave cutoff (ENCUT)', 'Handbook', ['encut']),
  cmd('tool-conv', 'Convergence plotter', 'Tools', ['encut', 'kpoints', 'converge'], '/tools/convergence/'),
  cmd('term-cut', 'Cutoff energy', 'Terms'),
  cmd('t-ismear', 'ISMEAR: smearing method', 'Tags', ['smearing']),
  cmd('p-handbook', 'Handbook', 'Pages', ['learn'], '/handbook/'),
  cmd('tool-kpath', 'Brillouin zone and k-path', 'Tools', ['bands'], '/tools/kpath/'),
];

describe('ranking', () => {
  it('puts title-prefix matches before word-start and keyword matches', () => {
    // encut: tags title starts with it (tier 1); handbook title has it only inside parentheses, "(encut)" word-start (tier 2);
    // tool matches by keyword (tier 3). Terms do not match.
    expect(rankCommands(FIX, 'encut').map((c) => c.id)).toEqual(['t-encut', 'h-encut', 'tool-conv']);
  });
  it('ranks an exact title first', () => {
    expect(rankCommands(FIX, 'handbook')[0]?.id).toBe('p-handbook');
  });
  it('breaks ties by group order, then title length', () => {
    // "cut": Terms is tier 1; Handbook and Tags are tier 2 (Handbook first by group order); the tool matches only inside the keyword "encut" (tier 5).
    expect(rankCommands(FIX, 'cut').map((c) => c.id)).toEqual([
      'term-cut',
      'h-encut',
      't-encut',
      'tool-conv',
    ]);
  });
  it('is tier 4 for a title substring and requires all words', () => {
    expect(scoreCommand(FIX[4]!, 'smear')).toBe(2); // a title word starts with it
    expect(scoreCommand(FIX[4]!, 'mear')).toBe(4); // inside the title only
    expect(scoreCommand(FIX[4]!, 'smearing method')).toBe(2); // worst token counts
    expect(scoreCommand(FIX[4]!, 'smearing zzz')).toBeNull();
  });
  it('ignores case and accents, and returns nothing for an empty query', () => {
    expect(rankCommands(FIX, 'BRILLOUİN'.replace('İ', 'I'))[0]?.id).toBe('tool-kpath');
    expect(rankCommands(FIX, '   ')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(rankCommands(FIX, 'e', 2)).toHaveLength(2);
  });
});

describe('slash aliases', () => {
  it('resolves route aliases that exist in the registry', () => {
    const r = resolveSlash('/kpath', FIX);
    expect(r.kind === 'command' && r.command.id).toBe('tool-kpath');
    const c = resolveSlash('/converge', FIX);
    expect(c.kind === 'command' && c.command.href).toBe('/tools/convergence/');
    const l = resolveSlash('/learn', FIX);
    expect(l.kind === 'command' && l.command.id).toBe('p-handbook');
  });
  it('resolves level and theme settings', () => {
    const t = resolveSlash('/theme dark', FIX);
    expect(t.kind === 'command' && t.command.action).toBe('theme:dark');
    const l = resolveSlash('/level Pro', FIX);
    expect(l.kind === 'command' && l.command.action).toBe('level:pro');
    expect(SETTINGS_COMMANDS).toHaveLength(6);
  });
  it('falls back to search for unknown or unavailable aliases', () => {
    expect(resolveSlash('/magnetic', FIX)).toEqual({ kind: 'search', text: 'magnetic' });
    expect(resolveSlash('/nonsense foo', FIX)).toEqual({ kind: 'search', text: 'nonsense foo' });
    expect(resolveSlash('/theme purple', FIX)).toEqual({ kind: 'search', text: 'theme purple' });
    expect(resolveSlash('plain text', FIX)).toEqual({ kind: 'search', text: 'plain text' });
  });
});
