// Build time: the figure for each question (null for a listed exemption). Used by pages and the figures endpoint.
import type { Question } from '../learning/questions';
import { resolveVisual, type Figure } from './resolve';

export function figuresFor(questions: Question[]): Record<string, Figure | null> {
  const out: Record<string, Figure | null> = {};
  for (const q of questions) out[q.id] = resolveVisual(q.visual, q.id);
  return out;
}
