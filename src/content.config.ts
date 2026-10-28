import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { handbookSchema } from './lib/content-schema.mjs';

const handbook = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/handbook' }),
  schema: handbookSchema,
});

export const collections = { handbook };
