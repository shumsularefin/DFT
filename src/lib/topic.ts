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
