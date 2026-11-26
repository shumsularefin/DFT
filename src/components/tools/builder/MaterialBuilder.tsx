import { lazy, Suspense, useState } from 'react';
import StudioFrame from './StudioFrame';

// Molecule mode (and any RDKit integration) loads lazily only when selected, never in crystal mode.
const MoleculeBuilder = lazy(() => import('./MoleculeBuilder'));

export default function MaterialBuilder() {
  const [mode, setMode] = useState<'crystal' | 'molecule'>('crystal');

  return (
    <div>
      <div className="mb-toolbar" role="tablist" aria-label="Material Builder mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'crystal'}
          className="mb-btn"
          onClick={() => setMode('crystal')}
        >
          Crystal mode (DFT Studio)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'molecule'}
          className="mb-btn"
          onClick={() => setMode('molecule')}
        >
          Molecule mode (2D/3D)
        </button>
      </div>

      {mode === 'crystal' ? (
        <StudioFrame />
      ) : (
        <Suspense fallback={<p>Loading molecule editor...</p>}>
          <MoleculeBuilder />
        </Suspense>
      )}
    </div>
  );
}
