import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { handbookSchema, workflowSchema } from './lib/content-schema.mjs';

const handbook = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/handbook' }),
  schema: handbookSchema,
});

const workflow = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/workflow' }),
  schema: workflowSchema,
});

export const collections = { handbook, workflow };
