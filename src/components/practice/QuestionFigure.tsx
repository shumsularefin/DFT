// The picture above a question stem (M12.3). The flat SVG is made at build time, so it shows with no WebGL and no
// extra download. A scene can also be turned and opened in 3D: that part loads only when asked for.
import { lazy, Suspense, useState } from 'react';
import type { Figure } from '../../lib/visual/resolve';
import Badge from '../ui/Badge';

const Scene = lazy(() => import('../scene/Scene'));

// markup produced by plots.ts or svg.ts from numbers and escaped labels
const Flat = ({ svg }: { svg: string }) => (
  <div className="qc-figure-flat" dangerouslySetInnerHTML={{ __html: svg }} />
);

export default function QuestionFigure({ figure }: { figure: Figure }) {
  const [turn, setTurn] = useState(false);
  return (
    <figure className="qc-figure" data-testid="qc-figure" data-kind={figure.kind}>
      <div className="qc-figure-head">
        <Badge variant={figure.badge} />
      </div>
      {turn && figure.spec ? (
        <Suspense fallback={<Flat svg={figure.svg} />}>
          <Scene spec={figure.spec} />
        </Suspense>
      ) : (
        <Flat svg={figure.svg} />
      )}
      {figure.kind === 'scene' && figure.spec && !turn && (
        <button type="button" className="btn" onClick={() => setTurn(true)}>
          View in 3D
        </button>
      )}
      <figcaption>{figure.caption}</figcaption>
      <details className="scene-alt">
        <summary>Text description</summary>
        <p>{figure.alt}</p>
      </details>
    </figure>
  );
}
