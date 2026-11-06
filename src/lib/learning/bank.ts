// The whole question bank and concept graph, loaded once at build time or on first use.
import conceptsJson from '../../data/concepts.json';
import { buildGraph, type Concept } from './graph';
import { parseQuestions, type Question } from './questions';

const files = import.meta.glob<{ default: unknown }>('../../data/questions/module-*.json', { eager: true });

export const questions: Question[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([file, mod]) => parseQuestions(mod.default, file));

export const questionById = new Map(questions.map((q) => [q.id, q]));

export const graph = buildGraph(conceptsJson as Concept[]);
