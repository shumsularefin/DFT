/** Build-time loader for the question bank and concept graph (used by .astro pages only). */
import conceptsRaw from '../../data/concepts.json';
import m1 from '../../data/questions/module-01.json';
import m2 from '../../data/questions/module-02.json';
import m3 from '../../data/questions/module-03.json';
import m4 from '../../data/questions/module-04.json';
import m5 from '../../data/questions/module-05.json';
import m6 from '../../data/questions/module-06.json';
import m7 from '../../data/questions/module-07.json';
import m8 from '../../data/questions/module-08.json';
import { loadConcepts } from './graph';
import { loadQuestionBank } from './questions';

export const questionBank = () => loadQuestionBank({ m1, m2, m3, m4, m5, m6, m7, m8 });
export const conceptGraph = () => loadConcepts(conceptsRaw);

/** Concept id to the first topic that teaches it, from the handbook collection's front matter. */
export function topicsByConcept(
  entries: { id: string; data: { title: string; module: number; order: number; concepts: string[] } }[],
): Record<string, { href: string; title: string; topicId: string; module: number }> {
  const out: Record<string, { href: string; title: string; topicId: string; module: number }> = {};
  const sorted = [...entries].sort(
    (a, b) => a.data.module - b.data.module || a.data.order - b.data.order || a.id.localeCompare(b.id),
  );
  for (const e of sorted) {
    for (const c of e.data.concepts) {
      out[c] ??= { href: `/handbook/${e.id}/`, title: e.data.title, topicId: e.id, module: e.data.module };
    }
  }
  return out;
}
