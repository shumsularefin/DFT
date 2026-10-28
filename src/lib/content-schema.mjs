// Single source of truth for handbook front matter. Used by src/content.config.ts (build) and
// scripts/lint-content.mjs (lint), so the two can never disagree. docs/CONTENT_GUIDE.md section 3.
import { z } from 'astro/zod';

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case');
const date = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-28'),
);

export const SOURCE_ID = /^S-\d{3}$/;
export const STATUSES = ['draft', 'review', 'verified'];

export const handbookSchema = z.object({
  id: kebab,
  title: z.string().min(3),
  module: z.number().int().min(1).max(11),
  order: z.number().int().min(0),
  summary: z.string().min(10),
  concepts: z.array(kebab).default([]),
  requires: z.array(kebab).default([]),
  vaspTags: z.array(z.string()).default([]),
  sources: z.array(z.string().regex(SOURCE_ID, 'must look like S-012')).default([]),
  status: z.enum(STATUSES),
  updated: date,
  /** Set only when the stage's work order says the topic has no lab. */
  noLab: z.boolean().default(false),
});

export const LEVELS = ['beginner', 'intermediate', 'pro'];

export const glossarySchema = z.array(
  z.object({
    id: kebab,
    label: z.string().min(1),
    short: z.string().min(10),
    level: z.enum(LEVELS),
    sources: z.array(z.string().regex(SOURCE_ID)).default([]),
  }),
);

/** The nine anatomy sections in their required order: [component, section id, heading]. */
export const SECTIONS = [
  ['Why', 'why', 'Why this matters'],
  ['Intuition', 'intuition', 'Intuition'],
  ['Lab', 'lab', 'Lab'],
  ['TheMath', 'math', 'The math'],
  ['InVasp', 'in-vasp', 'In VASP'],
  ['WhatChanges', 'what-changes', 'What changes if I change it'],
  ['Mistakes', 'mistakes', 'Common mistakes'],
  ['Check', 'check', 'Check your understanding'],
  ['GoDeeper', 'go-deeper', 'Go deeper'],
];
