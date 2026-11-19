// Every question's picture, made at build time (M12.3). The practice page fetches this once, after it opens, so the
// page itself stays small. The handbook Check passes its own few figures inline and never needs this file.
import { questionBank } from '../../lib/learning/loadBank';
import { figuresFor } from '../../lib/visual/figures';

export function GET() {
  const body = JSON.stringify(figuresFor(questionBank()));
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}
