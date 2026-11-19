// Command palette logic: registry type, fuzzy ranking and slash aliases. Pure, no DOM (tested in Node).
// The ranking rule is a design choice of this site, not a published method, so it carries no source ID.
// Rule: lower tier wins. Tier 0 exact title, 1 title starts with the query, 2 a title word starts with it,
// 3 a keyword starts with it, 4 substring of the title, 5 substring of a keyword. Ties: group order,
// then shorter title, then registry order. Several words in the query must all match; the worst tier counts.

export const GROUPS = ['Pages', 'Tools', 'Handbook', 'Tags', 'Terms', 'Settings'] as const;
export type CommandGroup = (typeof GROUPS)[number];

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  keywords: string[];
  /** Navigation target. Exactly one of href or action is set. */
  href?: string;
  /** Setting change such as `theme:dark` or `level:pro`; applied by the palette, not by this module. */
  action?: string;
}

export const LEVEL_VALUES = ['beginner', 'intermediate', 'pro'] as const;
export const THEME_VALUES = ['light', 'dark', 'system'] as const;

/** Commands that change settings. They live in code, not in the built index. */
export const SETTINGS_COMMANDS: Command[] = [
  ...LEVEL_VALUES.map<Command>((l) => ({
    id: `level-${l}`,
    title: `Reading level: ${l}`,
    group: 'Settings',
    keywords: ['level', 'depth', l],
    action: `level:${l}`,
  })),
  ...THEME_VALUES.map<Command>((t) => ({
    id: `theme-${t}`,
    title: `Theme: ${t}`,
    group: 'Settings',
    keywords: ['theme', 'colour', 'color', 'appearance', t],
    action: `theme:${t}`,
  })),
];

/** Slash aliases that point at a route. A target that is not in the registry (a tool not built yet) falls back to search. */
export const SLASH_ROUTES: Record<string, string> = {
  learn: '/handbook/',
  build: '/tools/input-builder/',
  incar: '/tools/input-builder/',
  kpoints: '/tools/input-builder/',
  kpath: '/tools/kpath/',
  converge: '/tools/convergence/',
  magnetic: '/tools/magnetic/',
  practice: '/practice/',
  progress: '/progress/',
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const words = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function tokenTier(cmd: Command, token: string): number | null {
  const title = norm(cmd.title);
  if (title === token) return 0;
  if (title.startsWith(token)) return 1;
  if (words(cmd.title).some((w) => w.startsWith(token))) return 2;
  const kws = cmd.keywords.map(norm);
  if (kws.some((k) => k.startsWith(token) || words(k).some((w) => w.startsWith(token)))) return 3;
  if (title.includes(token)) return 4;
  if (kws.some((k) => k.includes(token))) return 5;
  return null;
}

/** Tier of a command for a query, or null when it does not match. */
export function scoreCommand(cmd: Command, query: string): number | null {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let worst = 0;
  for (const t of tokens) {
    const tier = tokenTier(cmd, t);
    if (tier === null) return null;
    worst = Math.max(worst, tier);
  }
  return worst;
}

export function rankCommands(commands: Command[], query: string, limit = 20): Command[] {
  const scored: { c: Command; tier: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const tier = scoreCommand(c, query);
    if (tier !== null) scored.push({ c, tier, i });
  });
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      GROUPS.indexOf(a.c.group) - GROUPS.indexOf(b.c.group) ||
      a.c.title.length - b.c.title.length ||
      a.i - b.i,
  );
  return scored.slice(0, limit).map((s) => s.c);
}

export type SlashResult = { kind: 'command'; command: Command } | { kind: 'search'; text: string };

/** Resolves `/learn`, `/level pro`, `/theme dark` and the other aliases. Anything else becomes plain search text. */
export function resolveSlash(input: string, commands: Command[]): SlashResult {
  const text = input.trim();
  if (!text.startsWith('/')) return { kind: 'search', text };
  const [rawName = '', ...rest] = text.slice(1).split(/\s+/);
  const name = rawName.toLowerCase();
  const arg = rest.join(' ').toLowerCase();
  const fallback: SlashResult = { kind: 'search', text: text.slice(1).trim() };
  if (name === 'level' || name === 'theme') {
    const found = SETTINGS_COMMANDS.find((c) => c.action === `${name}:${arg}`);
    return found ? { kind: 'command', command: found } : fallback;
  }
  const href = SLASH_ROUTES[name];
  if (!href) return fallback;
  const target = commands.find((c) => c.href === href);
  return target ? { kind: 'command', command: target } : fallback;
}
