import './builder.css';
// Crystal mode of the Material Builder: DFT Studio (VESTA-style viewer and editor) in a frame (D-100).
// The frame keeps Studio's own styles away from the site's; hand-offs pass through sessionStorage, which
// the frame shares with this page, so a structure sent to /builder/ opens in Studio.
export default function StudioFrame() {
  return (
    <div className="mb-studio">
      <p className="mb-studio-note">
        Crystal mode runs DFT Studio: a VESTA-style 3D viewer and editor with supercells, slabs, adsorbates,
        heterostructures, defects, symmetry, magnetic moments, the structure checks B001 to B012 (Checks tab)
        and the VASP workflow. <a href="/dft-studio/">Open it full screen</a>.
      </p>
      <iframe
        className="mb-studio-frame"
        src="/dft-studio/?embed=1"
        title="DFT Studio crystal builder and 3D viewer"
        loading="eager"
      />
    </div>
  );
}
