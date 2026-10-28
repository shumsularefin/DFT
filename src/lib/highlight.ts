// Tiny build-time tokenizer for the code blocks in the handbook. Presentation only: it never alters text,
// so joining the token texts of a line always gives the original line back.
export type TokenType = 'comment' | 'tag' | 'punct' | 'number' | 'keyword' | 'string' | 'plain';
export interface Token {
  type: TokenType;
  text: string;
}
export type Lang = 'incar' | 'kpoints' | 'poscar' | 'shell' | 'text';

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/;
const KEYWORDS = new Set([
  'direct',
  'cartesian',
  'selective',
  'dynamics',
  'gamma',
  'monkhorst-pack',
  'monkhorst',
  'auto',
  'automatic',
  'line-mode',
  'reciprocal',
  'fully',
  't',
  'f',
  'true',
  'false',
]);

function words(s: string): Token[] {
  return s
    .split(/(\s+)/)
    .filter((p) => p !== '')
    .map((p): Token => {
      if (/^\s+$/.test(p)) return { type: 'plain', text: p };
      if (NUMBER.test(p)) return { type: 'number', text: p };
      if (KEYWORDS.has(p.toLowerCase().replace(/[.]/g, ''))) return { type: 'keyword', text: p };
      return { type: 'plain', text: p };
    });
}

function incarLine(line: string): Token[] {
  const cut = line.search(/[#!]/);
  const body = cut < 0 ? line : line.slice(0, cut);
  const comment = cut < 0 ? '' : line.slice(cut);
  const out: Token[] = [];
  const eq = body.indexOf('=');
  if (eq >= 0) {
    const lead = body.match(/^\s*/)?.[0] ?? '';
    const tag = body.slice(lead.length, eq).trimEnd();
    out.push({ type: 'plain', text: lead });
    out.push({ type: 'tag', text: tag });
    const gap = body.slice(lead.length + tag.length, eq);
    if (gap) out.push({ type: 'plain', text: gap });
    out.push({ type: 'punct', text: '=' });
    out.push(...words(body.slice(eq + 1)));
  } else if (body) {
    out.push(...words(body));
  }
  if (comment) out.push({ type: 'comment', text: comment });
  return out;
}

function shellLine(line: string): Token[] {
  const cut = line.search(/(^|\s)#/);
  if (cut < 0) return line ? [{ type: 'plain', text: line }] : [];
  const at = line[cut] === '#' ? cut : cut + 1;
  const out: Token[] = [];
  if (at > 0) out.push({ type: 'plain', text: line.slice(0, at) });
  out.push({ type: 'comment', text: line.slice(at) });
  return out;
}

export function highlight(lang: Lang, code: string): Token[][] {
  const lines = code.replace(/\n$/, '').split('\n');
  return lines.map((line, i) => {
    if (line === '') return [];
    switch (lang) {
      case 'incar':
        return incarLine(line);
      case 'kpoints':
      case 'poscar':
        // line 1 is a free-text title in both formats
        return i === 0 ? [{ type: 'comment', text: line }] : words(line);
      case 'shell':
        return shellLine(line);
      default:
        return [{ type: 'plain', text: line }];
    }
  });
}
