// Build-time catalogue for the practice and progress pages: published concepts, their topic pages and
// the questions that can be asked about them.
import { getCollection } from 'astro:content';
import { graph, questions } from './bank';

export interface CatalogConcept {
  id: string;
  label: string;
  module: number;
  level: string;
  prerequisites: string[];
  href: string | null;
  topicTitle: string | null;
}

export async function catalog() {
  const topics = await getCollection('handbook');
  const topicFor = new Map<string, { href: string; title: string }>();
  for (const t of topics)
    for (const c of t.data.concepts)
      if (!topicFor.has(c)) topicFor.set(c, { href: `/handbook/${t.id}/`, title: t.data.title });
  const concepts: CatalogConcept[] = graph.order
    .map((id) => graph.byId.get(id)!)
    .filter((c) => c.status === 'published')
    .map((c) => ({
      id: c.id,
      label: c.label,
      module: c.module,
      level: c.level,
      prerequisites: c.prerequisites,
      href: topicFor.get(c.id)?.href ?? null,
      topicTitle: topicFor.get(c.id)?.title ?? null,
    }));
  const published = new Set(concepts.map((c) => c.id));
  const bank = questions.filter((q) => q.concepts.every((c) => published.has(c)));
  return { concepts, bank };
}
