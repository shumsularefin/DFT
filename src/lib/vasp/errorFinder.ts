// Error finder (M7.4): match a pasted VASP log excerpt or a typed symptom to entries of src/data/errors.json.
// Pure and local: nothing is sent anywhere. Matching has three tiers, strongest first:
//   exact    a message string of the entry appears in the text (case and spacing ignored); "re:" prefix = regex
//   token    a distinctive upper-case routine name from the entry's messages (ZBRENT, BRMIX ...) appears
//   fuzzy    words of one line overlap the entry's keywords and symptoms (idf weighted, one typo tolerated)
// @source S-041 S-042 (the entries come from the Field and Workflow handbooks)
import { LEVELS, type Level } from '../levels';

export interface ErrorFix {
  text: string;
  /** INCAR change that goes with the fix, if any. Values are strings exactly as written in the INCAR. */
  incar?: Record<string, string>;
}

export interface ErrorEntry {
  id: string;
  title: string;
  category: string;
  /** Exact strings as printed by VASP (or "re:" regexes). May be empty for symptom-only entries. */
  messages: string[];
  keywords: string[];
  symptoms: string[];
  plain: string;
  causes: string[];
  fixes: ErrorFix[];
  related: string[];
  /** Handbook entry ids: "field:t-xxx" or "workflow:row-NN" (1-based row of the error index). */
  sources: string[];
}

export type MatchKind = 'exact' | 'token' | 'fuzzy';

export interface ErrorMatch {
  entry: ErrorEntry;
  score: number;
  kind: MatchKind;
  /** The line of the input that matched best, for display. */
  line: string;
}

export const SCORE_EXACT = 100;
export const SCORE_TOKEN = 60;
export const SCORE_FUZZY_MAX = 40;
/** A line must cover at least this share of its idf weight to count as a fuzzy match. */
const FUZZY_MIN_COVERAGE = 0.5;

const STOP = new Set(
  'a an and are as at be but by do does for from has have how i in into is it its my no not of on or so that the then this to was we what when why with without'.split(
    ' ',
  ),
);

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s: string) =>
  squash(s)
    .split(/[^a-z0-9_*=-]+/)
    .map((w) => w.replace(/^[-=*]+|[-=*]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));

/** Edit distance at most 1 (insert, delete, substitute, or one swap of neighbours). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

function messageRegex(m: string): RegExp | null {
  if (!m.startsWith('re:')) return null;
  try {
    return new RegExp(m.slice(3), 'i');
  } catch {
    return null;
  }
}

const NOT_ROUTINES = new Set(['ERROR', 'WARNING']);

/** Routine names inside a message, for example ZBRENT, BRMIX, SGRCON: an upper-case word (4+ characters) that is followed by a colon, follows "routine" or "subroutine", or is the whole message part. */
function routineTokens(entry: ErrorEntry): string[] {
  const out = new Set<string>();
  for (const m of entry.messages) {
    if (m.startsWith('re:')) continue;
    for (const part of m.split(' / ')) {
      for (const hit of part.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b(\s*:)?/g)) {
        const t = hit[1]!;
        const before = part.slice(0, hit.index).trimEnd().toLowerCase();
        const ok = hit[2] || /(^|\s)(sub)?routine$/.test(before) || part.trim() === t;
        if (ok && !NOT_ROUTINES.has(t)) out.add(t.toLowerCase());
      }
    }
  }
  return [...out];
}

export interface Finder {
  find(input: string): ErrorMatch[];
}

/** Build a matcher for a list of entries. Index work (idf, distinctive tokens) is done once. */
export function createFinder(entries: ErrorEntry[]): Finder {
  // distinctive routine tokens: those that occur in the messages of exactly one entry
  const tokenOwners = new Map<string, Set<string>>();
  for (const e of entries)
    for (const t of routineTokens(e)) tokenOwners.set(t, (tokenOwners.get(t) ?? new Set()).add(e.id));
  const distinct = new Map<string, string[]>();
  for (const e of entries)
    distinct.set(
      e.id,
      routineTokens(e).filter((t) => tokenOwners.get(t)!.size === 1),
    );

  // bag of words per entry, and document frequency for idf weights
  const bags = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  for (const e of entries) {
    const bag = new Set([
      ...e.keywords.flatMap(words),
      ...e.symptoms.flatMap(words),
      ...words(e.title),
      ...e.messages.filter((m) => !m.startsWith('re:')).flatMap(words),
    ]);
    bags.set(e.id, bag);
    for (const w of bag) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const idf = (w: string) => Math.log(1 + entries.length / (df.get(w) ?? 1));

  const hasWord = (bag: Set<string>, w: string) => {
    if (bag.has(w)) return true;
    if (w.length < 6) return false;
    for (const b of bag) if (b.length >= 6 && withinOneEdit(w, b)) return true;
    return false;
  };

  return {
    find(input: string): ErrorMatch[] {
      const text = input.replace(/\r\n?/g, '\n');
      if (!text.trim()) return [];
      const flat = squash(text);
      const lines = text.split('\n').filter((l) => l.trim());
      const lineOf = (needle: RegExp | string) =>
        lines.find((l) => (typeof needle === 'string' ? squash(l).includes(needle) : needle.test(l))) ??
        lines[0] ??
        '';
      const results: ErrorMatch[] = [];

      for (const e of entries) {
        let best: ErrorMatch | null = null;
        const offer = (kind: MatchKind, score: number, line: string) => {
          if (!best || score > best.score) best = { entry: e, score, kind, line };
        };

        for (const m of e.messages) {
          const re = messageRegex(m);
          if (re) {
            if (re.test(text)) offer('exact', SCORE_EXACT, lineOf(re));
          } else {
            const n = squash(m);
            if (n && flat.includes(n)) offer('exact', SCORE_EXACT, lineOf(n));
          }
        }
        for (const t of distinct.get(e.id) ?? [])
          if (new RegExp(`(^|[^a-z0-9_])${t}([^a-z0-9_]|$)`).test(flat))
            offer('token', SCORE_TOKEN, lineOf(t));

        if (!best) {
          const bag = bags.get(e.id)!;
          // a short typed symptom is judged as a whole; a pasted log is judged line by line
          const units = lines.length > 1 ? lines : [text];
          for (const u of units) {
            const ws = [...new Set(words(u))];
            if (!ws.length) continue;
            const total = ws.reduce((s, w) => s + idf(w), 0);
            const hit = ws.filter((w) => hasWord(bag, w));
            const got = hit.reduce((s, w) => s + idf(w), 0);
            const enough =
              hit.length >= 2 || (hit.length === 1 && hit[0]!.length >= 4 && (df.get(hit[0]!) ?? 0) === 1);
            if (enough && total > 0 && got / total >= FUZZY_MIN_COVERAGE)
              offer('fuzzy', SCORE_FUZZY_MAX * (got / total), u.trim());
          }
        }
        if (best) results.push(best);
      }
      return results.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
    },
  };
}

/** What a reader at `level` sees (levels are cumulative, D-011): Beginner gets the plain sentence, the first cause and the first two fixes. */
export function entryAtLevel(entry: ErrorEntry, level: Level) {
  const rank = LEVELS.indexOf(level);
  return {
    plain: entry.plain,
    causes: rank === 0 ? entry.causes.slice(0, 1) : entry.causes,
    fixes: rank === 0 ? entry.fixes.slice(0, 2) : entry.fixes,
    hiddenCauses: rank === 0 ? Math.max(entry.causes.length - 1, 0) : 0,
    hiddenFixes: rank === 0 ? Math.max(entry.fixes.length - 2, 0) : 0,
    showSources: rank >= 2,
    showMessages: rank >= 1,
  };
}

/** "INCAR change" lines for a fix, in the order given: `ALGO = All`. */
export const incarLines = (fix: ErrorFix): string[] =>
  Object.entries(fix.incar ?? {}).map(([k, v]) => `${k} = ${v}`);

export const CATEGORY_LABELS: Record<string, string> = {
  start: 'Starting a run',
  restart: 'Restarts and old files',
  symmetry: 'Symmetry and k-points',
  electronic: 'Electronic convergence',
  relaxation: 'Ionic relaxation',
  magnetism: 'Magnetism',
  analysis: 'Post-processing',
  performance: 'Performance',
  properties: 'Phonons and elastic constants',
};
