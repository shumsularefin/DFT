import { useEffect, useState } from 'react';
import './builder.css';
import '../../ui/button.css';
// Crystal mode of the Material Builder: DFT Studio (VESTA-style viewer and editor) in a frame (D-103).
// The frame keeps Studio's own styles away from the site's; hand-offs pass through sessionStorage, which
// the frame shares with this page, so a structure sent to /builder/ opens in Studio.
// 3D loads lazily (CLAUDE.md): the frame starts on request, or at once when a structure was handed over.
const HANDOFF_KEY = 'dft:handoff';

function pendingHandoff(): boolean {
  try {
    return sessionStorage.getItem(HANDOFF_KEY) !== null;
  } catch {
    return false;
  }
}

export default function StudioFrame() {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (pendingHandoff()) setStarted(true);
  }, []);
  return (
    <div className="mb-studio">
      <p className="mb-studio-note">
        Crystal mode runs DFT Studio: a VESTA-style 3D viewer and editor with supercells, slabs, adsorbates,
        heterostructures, defects, symmetry, magnetic moments, the structure checks B001 to B012 (Checks tab)
        and the VASP workflow. <a href="/dft-studio/">Open it full screen</a>.
      </p>
      {started ? (
        <iframe
          className="mb-studio-frame"
          src="/dft-studio/?embed=1"
          title="DFT Studio crystal builder and 3D viewer"
        />
      ) : (
        <div className="mb-studio-frame mb-studio-poster" aria-labelledby="mb-studio-poster-title">
          <h2 id="mb-studio-poster-title" className="mb-studio-poster-title">
            DFT Studio, the 3D crystal editor
          </h2>
          <p className="mb-studio-poster-text">
            Build a crystal from a template or your own POSCAR or CIF, look at it in 3D, make supercells,
            slabs and defects, check it against B001 to B012, then export it or send it on to the VASP tools.
            Everything runs in this browser tab.
          </p>
          <button type="button" className="btn btn-primary mb-studio-start" onClick={() => setStarted(true)}>
            Start the 3D crystal editor
          </button>
          <p className="mb-studio-poster-note">Loads about 200 KB of JavaScript and needs WebGL.</p>
        </div>
      )}
    </div>
  );
}
