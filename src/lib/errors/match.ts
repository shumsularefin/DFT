/**
 * Error finder matching (M7.4). Runs locally; nothing is sent anywhere.
 * Two stages: (1) exact, a printed message found in the pasted text, ranked by how long the matched
 * string is; (2) fuzzy keyword match for symptoms typed in words, used only when stage 1 finds nothing.
 * @source S-041 S-042 (entries come from the author's handbooks, see src/data/errors.json)
 */
export interface ErrorFix {
  text: string;
  /** INCAR change that goes with this fix, if the handbook gives one. */
  incar?: Record<string, string>;
}
export interface ErrorEntry {
  id: string;
  title: string;
  category: string;
  messages: string[];
  keywords: string[];
  symptoms: string[];
  plain: string;
  causes: string[];
  fixes: ErrorFix[];
  related: string[];
  sources: string[];
}
export interface ErrorMatch {
  entry: ErrorEntry;
  kind: 'exact' | 'fuzzy';
  score: number;
  /** The message strings found (exact) or the query words that matched (fuzzy). */
  matched: string[];
}

/** Lower case, letters and digits only, single spaces. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOP = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'be',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'but',
  'it',
  'my',
  'i',
  'me',
  'do',
  'does',
  'did',
  'not',
  'no',
  'with',
  'when',
  'why',
  'how',
  'what',
  'this',
  'that',
  'so',
  'run',
  'vasp',
  'error',
  'get',
  'got',
  'after',
  'at',
  'as',
  'by',
  'from',
  'have',
  'has',
  'again',
  'keeps',
]);

const stem = (w: string): string => {
  if (w.length > 4 && /(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
const words = (s: string): string[] =>
  norm(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++diff > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

const tokenMatches = (q: string, d: string): boolean =>
  q === d || (q.length >= 5 && d.length >= 5 && within1(q, d));

/** All entries whose printed messages occur in `text`, then, if none do, entries ranked by keyword overlap. */
export function findErrors(text: string, entries: ErrorEntry[], limit = 8): ErrorMatch[] {
  const hay = ` ${norm(text)} `;
  if (hay.trim() === '') return [];

  const exact: ErrorMatch[] = [];
  for (const entry of entries) {
    const hits = entry.messages.filter((m) => {
      const n = norm(m);
      return n !== '' && hay.includes(` ${n} `);
    });
    if (hits.length) {
      const best = Math.max(...hits.map((m) => norm(m).length));
      exact.push({ entry, kind: 'exact', score: 1000 + best, matched: hits });
    }
  }
  if (exact.length) return exact.sort((a, b) => b.score - a.score).slice(0, limit);

  const q = [...new Set(words(text))];
  if (q.length === 0) return [];
  const docs = entries.map((e) => ({
    e,
    toks: new Set([e.title, ...e.keywords, ...e.symptoms, ...e.messages].flatMap(words)),
    phrases: [...e.keywords, ...e.messages].map(norm).filter((p) => p.includes(' ') || p.length > 4),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.toks) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + entries.length / (df.get(t) ?? 1));

  const out: ErrorMatch[] = [];
  docs.forEach(({ e, toks, phrases }, order) => {
    let score = 0;
    const matched: string[] = [];
    for (const t of q) {
      const hit = toks.has(t) ? t : [...toks].find((d) => tokenMatches(t, d));
      if (hit) {
        score += idf(hit);
        matched.push(t);
      }
    }
    for (const p of phrases) if (p.includes(' ') && hay.includes(` ${p} `)) score += 3;
    // Need a real signal: one rare word, or several common ones.
    if (score >= 1.5 && matched.length > 0)
      out.push({ entry: e, kind: 'fuzzy', score: score - order / 1000, matched });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Entries grouped by category, in the order the categories are declared. */
export function byCategory(
  entries: ErrorEntry[],
  categories: Record<string, string>,
): { id: string; label: string; entries: ErrorEntry[] }[] {
  return Object.entries(categories)
    .map(([id, label]) => ({ id, label, entries: entries.filter((e) => e.category === id) }))
    .filter((c) => c.entries.length > 0);
}
