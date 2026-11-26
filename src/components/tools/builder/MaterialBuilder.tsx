import { lazy, Suspense, useState, type KeyboardEvent } from 'react';
import StudioFrame from './StudioFrame';

// Molecule mode (and any RDKit integration) loads lazily only when selected, never in crystal mode.
const MoleculeBuilder = lazy(() => import('./MoleculeBuilder'));

export default function MaterialBuilder() {
  const [mode, setMode] = useState<'crystal' | 'molecule'>('crystal');

  // Tabs pattern: the arrow keys, Home and End move between the two modes and focus the new tab.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, 'crystal' | 'molecule'> = {
      ArrowLeft: mode === 'crystal' ? 'molecule' : 'crystal',
      ArrowRight: mode === 'crystal' ? 'molecule' : 'crystal',
      Home: 'crystal',
      End: 'molecule',
    };
    const to = next[e.key];
    if (!to) return;
    e.preventDefault();
    setMode(to);
    document.getElementById(`mb-tab-${to}`)?.focus();
  };

  return (
    <div>
      <div className="mb-toolbar" role="tablist" aria-label="Material Builder mode" onKeyDown={onTabKey}>
        <button
          type="button"
          role="tab"
          id="mb-tab-crystal"
          aria-controls="mb-panel"
          tabIndex={mode === 'crystal' ? 0 : -1}
          aria-selected={mode === 'crystal'}
          className="mb-btn"
          onClick={() => setMode('crystal')}
        >
          Crystal mode (DFT Studio)
        </button>
        <button
          type="button"
          role="tab"
          id="mb-tab-molecule"
          aria-controls="mb-panel"
          tabIndex={mode === 'molecule' ? 0 : -1}
          aria-selected={mode === 'molecule'}
          className="mb-btn"
          onClick={() => setMode('molecule')}
        >
          Molecule mode (2D/3D)
        </button>
      </div>

      <div id="mb-panel" role="tabpanel" aria-labelledby={`mb-tab-${mode}`}>
        {mode === 'crystal' ? (
          <StudioFrame />
        ) : (
          <Suspense fallback={<p>Loading molecule editor...</p>}>
            <MoleculeBuilder />
          </Suspense>
        )}
      </div>
    </div>
  );
}
