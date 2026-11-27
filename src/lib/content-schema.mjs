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

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** Section ids a stage state can follow (the anatomy of SECTIONS below). */
export const STAGE_SECTIONS = [
  'why',
  'intuition',
  'lab',
  'math',
  'in-vasp',
  'what-changes',
  'mistakes',
  'check',
  'go-deeper',
];
export const STAGE_CAMERAS = ['iso', 'a', 'b', 'c', 'a*', 'b*', 'c*', 'top', 'front', 'side'];

/**
 * The live 3D stage beside a topic's text (M16 section 5). `scene` names a generator in src/lib/viewer3d/scenes; the badge,
 * sources and controls come from the generator itself, so a page cannot claim more than the scene computes. Each state is
 * a set of parameter values, visible layer groups and a camera, chosen by the section the reader is in.
 */
export const stageSchema = z.object({
  scene: z.string().regex(/^m\d\d[a-z]?-[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a scene id like m02-orbital'),
  states: z
    .array(
      z.object({
        id: kebab,
        section: z.enum(STAGE_SECTIONS).optional(),
        params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
        /** Visible layer groups; all groups when absent. */
        layers: z.array(kebab).optional(),
        camera: z
          .union([
            z.enum(STAGE_CAMERAS),
            z.object({ eye: vec3, up: vec3.optional(), zoom: z.number().positive().optional() }),
          ])
          .optional(),
        /** One or two sentences under the stage: what to look at in this state. */
        caption: z.string().min(10).max(320),
      }),
    )
    .min(1),
});

export const handbookSchema = z.object({
  id: kebab,
  title: z.string().min(3),
  module: z.number().int().min(1).max(12),
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
  /** The live 3D stage (M16). Optional until M16.15 makes check-3d-stages fail on a topic without one. */
  stage: stageSchema.optional(),
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

/** Workflow step pages (src/content/workflow/*.mdx, D-110). Ordered by group, then order. */
export const WORKFLOW_GROUP_NAMES = ['Geometry', 'Electronic', 'Lattice and response', 'Beyond PBE'];
const link = z.object({ href: z.string().regex(/^\/[a-z0-9/#?=&_-]*$/), label: z.string().min(2) });
export const workflowSchema = z.object({
  id: kebab,
  title: z.string().min(3),
  /** Short label in the step list, e.g. "Relaxation". */
  short: z.string().min(2),
  group: z.enum(WORKFLOW_GROUP_NAMES),
  order: z.number().int().min(0),
  summary: z.string().min(10),
  /** The author's protocol step this page follows (1 to 5), if any. */
  protocolStep: z.number().int().min(1).max(5).optional(),
  /** Folder in the suggested project layout. */
  folder: z.string().min(2),
  needs: z.array(z.string().min(2)).min(1),
  run: z.string().min(3),
  produces: z.array(z.string().min(2)).min(1),
  /** Handbook topics and reference pages that explain the theory. */
  learn: z.array(link).default([]),
  /** Site tools that make or read the files of this step. */
  tools: z.array(link).default([]),
  /** Pre-submit checklist rows (calculation names in src/lib/reference/tables.ts). */
  checklist: z.array(z.string()).default([]),
  sources: z.array(z.string().regex(SOURCE_ID, 'must look like S-012')).min(1),
  status: z.enum(STATUSES),
  updated: date,
});
