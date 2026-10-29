import type { APIRoute } from 'astro';
import { INDEXING_ENABLED } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const body = INDEXING_ENABLED
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site).href}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
