// Helpers for handbook routes. Pure functions so they can be tested in Node.
import { SECTIONS } from './content-schema.mjs';

/** `00-start/how-to-use-this-site` -> { module: '00-start', topic: 'how-to-use-this-site' } */
export function splitId(entryId: string): { module: string; topic: string } {
  const [module = '', ...rest] = entryId.split('/');
  return { module, topic: rest.join('/') };
}

/** Source ids in order of first `<Cite id="S-nnn" />` use. */
export function citeOrder(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(/<Cite\s+id=["'](S-\d{3})["']/g)) {
    if (!seen.includes(m[1]!)) seen.push(m[1]!);
  }
  return seen;
}

/** Anatomy sections present in the topic source, in the required order, for the "On this page" list. */
export function presentSections(body: string): { id: string; heading: string }[] {
  return SECTIONS.filter(([component]) => new RegExp(`^<${component}[\\s>/]`, 'm').test(body)).map(
    ([, id, heading]) => ({ id: id!, heading: heading! }),
  );
}

/** "00-start" -> "Start". Display name for a module folder. */
export function moduleLabel(slug: string): string {
  const name = slug.replace(/^\d+-/, '').replace(/-/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export interface OrderedTopic {
  id: string;
  title: string;
}

/** Previous and next topic in reading order; `null` at either end or for an unknown id. */
export function neighbors<T extends OrderedTopic>(
  ordered: readonly T[],
  id: string,
): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((t) => t.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}

/** Short note for search results about which extra levels a topic has, from its `<Level min=...>` blocks. */
export function levelNotes(body: string): string {
  const has = (l: string) => new RegExp(`<Level\\s[^>]*min=["']${l}["']`).test(body);
  const parts = [has('intermediate') && 'Intermediate', has('pro') && 'Pro'].filter(Boolean);
  return parts.length ? `Has ${parts.join(' and ')} notes` : '';
}

/** Lab ids that have a React island. Topics using one are built as "island" pages (size budget 200 KB). */
export const REGISTERED_LABS = ['cost-of-exactness'] as const;

/** Page class for a topic: "island" if its body embeds a registered lab, else "content". */
export function topicPageClass(body: string): 'content' | 'island' {
  const ids = [...body.matchAll(/<Lab\s[^>]*\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  return ids.some((i) => (REGISTERED_LABS as readonly string[]).includes(i!)) ? 'island' : 'content';
}
