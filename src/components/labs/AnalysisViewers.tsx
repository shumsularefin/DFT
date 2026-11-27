import { useState, type ChangeEvent } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import Slider from '../ui/Slider';
import { parseXdatcar, type XdatcarResult } from '../../lib/vasp/xdatcar';
import { parseOszicar, type OszicarResult } from '../../lib/vasp/oszicar';
import { writePoscar } from '../../lib/crystal/poscar';
import { parseDoscar, smoothDos, type DoscarResult } from '../../lib/vasp/doscar';
import { computeBandGap, parseEigenval, type EigenvalResult } from '../../lib/vasp/eigenval';
import { gridIndex, parseChgcar, type ChgcarResult } from '../../lib/vasp/chgcar';
import { extractIsosurface } from '../../lib/physics/marchingCubes';
import '../ui/button.css';

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RelaxationViewer() {
  const [xdat, setXdat] = useState<XdatcarResult | null>(null);
  const [osz, setOsz] = useState<OszicarResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      const text = await f.text();
      try {
        if (/XDATCAR/i.test(f.name) || /Direct\s+configuration=/i.test(text)) {
          const parsed = parseXdatcar(text);
          setXdat(parsed);
          setFrame(Math.max(0, parsed.frames.length - 1));
        } else if (/OSZICAR/i.test(f.name) || /\d+\s+F\s*=/m.test(text)) {
          setOsz(parseOszicar(text));
        }
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : String(ex));
      }
    }
  }

  const cur = xdat?.frames[frame];
  const steps = osz?.ionic.map((s) => s.step) ?? [];
  const energies = osz?.ionic.map((s) => s.e0) ?? [];

  return (
    <LabShell
      title="Relaxation trajectory viewer"
      goal="Drop your own XDATCAR and optional OSZICAR to inspect ionic steps, energy progression, and export the final structure as CONTCAR."
      badge="computed"
      onReset={() => {
        setXdat(null);
        setOsz(null);
        setFrame(0);
        setErr(null);
      }}
      controls={
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Drop or choose XDATCAR / OSZICAR (parsed locally):{' '}
            <input type="file" multiple onChange={onFile} />
          </label>
          {xdat && xdat.frames.length > 1 && (
            <Slider
              label="Trajectory frame"
              min={0}
              max={xdat.frames.length - 1}
              step={1}
              value={frame}
              onChange={setFrame}
            />
          )}
          {cur && (
            <button
              type="button"
              className="btn"
              onClick={() => downloadText(writePoscar(cur.structure).text, 'CONTCAR')}
            >
              Download selected frame as CONTCAR
            </button>
          )}
        </>
      }
      readouts={[
        { label: 'Frames', value: xdat ? String(xdat.frames.length) : 'none' },
        { label: 'Atoms', value: xdat ? String(xdat.species.length) : 'none' },
        {
          label: 'Final E0',
          value: osz && osz.ionic.length ? osz.ionic.at(-1)!.e0.toFixed(5) : 'none',
          unit: 'eV',
        },
      ]}
      notice="Drop your own VASP XDATCAR and OSZICAR files. No synthetic result data is displayed."
      description={
        xdat
          ? `Loaded ${xdat.frames.length} trajectory frames for ${xdat.species.length} atoms.`
          : 'No file loaded yet. Choose an XDATCAR or OSZICAR file from your computer.'
      }
    >
      {err && <p role="alert">{err}</p>}
      {energies.length >= 2 && (
        <MiniPlot
          title="Ionic step E0 progression"
          xLabel="Ionic step"
          yLabel="E0 (eV)"
          xMin={steps[0]!}
          xMax={steps.at(-1)!}
          yMin={Math.min(...energies)}
          yMax={Math.max(...energies) + 1e-6}
          curves={[{ xs: steps, ys: energies, label: 'E0', color: '#0072B2' }]}
        />
      )}
      {!xdat && !osz && <p>Drop your own XDATCAR or OSZICAR file above to inspect a relaxation.</p>}
    </LabShell>
  );
}

export function DosViewer() {
  const [dos, setDos] = useState<DoscarResult | null>(null);
  const [sigma, setSigma] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setDos(parseDoscar(await f.text()));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const shiftedE = dos ? dos.energies.map((e) => e - dos.efermi) : [];
  const up = dos ? smoothDos(shiftedE, dos.totalUp, sigma) : [];
  const down = dos?.totalDown ? smoothDos(shiftedE, dos.totalDown, sigma).map((v) => -v) : null;

  return (
    <LabShell
      title="DOSCAR viewer"
      goal="Drop your own VASP DOSCAR to plot total DOS on E - E_F with mirrored spin channels and optional Gaussian smoothing."
      badge="computed"
      onReset={() => {
        setDos(null);
        setSigma(0);
        setErr(null);
      }}
      controls={
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Choose DOSCAR (parsed locally): <input type="file" onChange={onFile} />
          </label>
          <Slider
            label="Gaussian smoothing sigma (0 = off)"
            min={0}
            max={0.3}
            step={0.02}
            value={sigma}
            unit="eV"
            onChange={setSigma}
          />
        </>
      }
      readouts={[
        { label: 'E_F', value: dos ? dos.efermi.toFixed(3) : 'none', unit: 'eV' },
        { label: 'ISPIN', value: dos ? String(dos.ispin) : 'none' },
        { label: 'Smoothing', value: sigma > 0 ? `${sigma.toFixed(2)} eV (on)` : 'off' },
      ]}
      notice="Smoothing is off by default. Drop your own DOSCAR; no synthetic results are preloaded."
      description={
        dos
          ? `DOSCAR loaded: ${dos.nedos} energy points, E_F = ${dos.efermi.toFixed(3)} eV, ISPIN = ${dos.ispin}.`
          : 'No DOSCAR loaded yet.'
      }
    >
      {err && <p role="alert">{err}</p>}
      {dos && shiftedE.length >= 2 ? (
        <MiniPlot
          title={sigma > 0 ? `Total DOS (smoothed, sigma = ${sigma.toFixed(2)} eV)` : 'Total DOS (raw)'}
          xLabel="E - E_F (eV)"
          yLabel="DOS (states/eV)"
          xMin={shiftedE[0]!}
          xMax={shiftedE.at(-1)!}
          yMin={down ? Math.min(-0.1, ...down) : 0}
          yMax={Math.max(0.1, ...up)}
          hlines={[0]}
          marks={[{ x: 0, label: 'E_F' }]}
          curves={[
            { xs: shiftedE, ys: up, label: dos.ispin === 2 ? 'spin up' : 'total', color: '#0072B2' },
            ...(down ? [{ xs: shiftedE, ys: down, label: 'spin down', color: '#D55E00', dash: '6 3' }] : []),
          ]}
        />
      ) : (
        <p>Drop your own DOSCAR file above to plot the density of states.</p>
      )}
    </LabShell>
  );
}

export function BandViewer() {
  const [ev, setEv] = useState<EigenvalResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setEv(parseEigenval(await f.text()));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const gap = ev ? computeBandGap(ev) : null;
  const ks = ev ? ev.kpoints.map((_, i) => i) : [];

  return (
    <LabShell
      title="Band-structure viewer (EIGENVAL)"
      goal="Drop your own VASP EIGENVAL file to plot bands along the k-point path and compute the band gap and its direct or indirect character."
      badge="computed"
      onReset={() => {
        setEv(null);
        setErr(null);
      }}
      controls={
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Choose EIGENVAL (parsed locally): <input type="file" onChange={onFile} />
        </label>
      }
      readouts={[
        { label: 'k-points', value: ev ? String(ev.nkpt) : 'none' },
        { label: 'Bands', value: ev ? String(ev.nbands) : 'none' },
        {
          label: 'Gap',
          value: gap
            ? `${gap.gapEv.toFixed(3)} (${gap.kind}${gap.crossSpin ? ', VBM and CBM in different spin channels' : ''})`
            : 'none',
          unit: 'eV',
        },
      ]}
      notice="Drop your own EIGENVAL file. Band gap and direct/indirect character are computed directly from occupations >= 0.5."
      description={
        ev && gap
          ? `EIGENVAL loaded: ${ev.nkpt} k-points, ${ev.nbands} bands, ${gap.kind} gap ${gap.gapEv.toFixed(3)} eV.`
          : 'No EIGENVAL loaded yet.'
      }
    >
      {err && <p role="alert">{err}</p>}
      {ev && ks.length >= 2 ? (
        <MiniPlot
          title="Bands (spin channel 1)"
          xLabel="k-point index"
          yLabel="Energy (eV)"
          xMin={0}
          xMax={ks.length - 1}
          yMin={Math.min(...ev.eigenvalues[0]!.flat())}
          yMax={Math.max(...ev.eigenvalues[0]!.flat()) + 1e-6}
          curves={Array.from({ length: Math.min(ev.nbands, 12) }, (_, b) => ({
            xs: ks,
            ys: ev.eigenvalues[0]!.map((row) => row[b]!),
            label: `band ${b + 1}`,
            color: '#0072B2',
          }))}
        />
      ) : (
        <p>Drop your own EIGENVAL file above to inspect bands and gap.</p>
      )}
    </LabShell>
  );
}

export function DensityViewer() {
  const [chg, setChg] = useState<ChgcarResult | null>(null);
  const [channel, setChannel] = useState<'total' | 'spin'>('total');
  const [isoFrac, setIsoFrac] = useState(0.5);
  const [sliceZ, setSliceZ] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = parseChgcar(await f.text());
      setChg(parsed);
      setChannel('total');
      setSliceZ(Math.floor(parsed.grid[2] / 2));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const rawField = chg ? (channel === 'spin' && chg.diffRaw ? chg.diffRaw : chg.totalRaw) : null;
  const isoValue = chg ? isoFrac * chg.maxDensityPerA3 * chg.volumeA3 : 0;
  const tris =
    chg && rawField && chg.grid[0] * chg.grid[1] * chg.grid[2] <= 64 * 64 * 64
      ? extractIsosurface(rawField, chg.grid, isoValue, { invert: true }).triangleCount
      : null;

  return (
    <LabShell
      title="Charge-density viewer (CHGCAR)"
      goal="Drop your own CHGCAR or PARCHG file to inspect total electrons, spin magnetization, isosurface triangle count, and a 2D z-slice."
      badge="computed"
      onReset={() => {
        setChg(null);
        setErr(null);
      }}
      controls={
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Choose CHGCAR / PARCHG (parsed locally): <input type="file" onChange={onFile} />
          </label>
          {chg && (
            <>
              <Slider
                label="Isosurface fraction of max density"
                min={0.05}
                max={0.95}
                step={0.05}
                value={isoFrac}
                onChange={setIsoFrac}
              />
              <Slider
                label="Cross-section z-slice index"
                min={0}
                max={chg.grid[2] - 1}
                step={1}
                value={sliceZ}
                onChange={setSliceZ}
              />
              {chg.diffRaw && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setChannel((c) => (c === 'total' ? 'spin' : 'total'))}
                >
                  Showing: {channel === 'total' ? 'Total density' : 'Spin magnetization'} (switch)
                </button>
              )}
            </>
          )}
        </>
      }
      readouts={[
        { label: 'Grid', value: chg ? chg.grid.join(' x ') : 'none' },
        { label: 'Electrons', value: chg ? chg.electrons.toFixed(4) : 'none' },
        { label: 'Max density', value: chg ? chg.maxDensityPerA3.toFixed(4) : 'none', unit: 'e/A^3' },
        ...(tris !== null ? [{ label: 'Isosurface triangles', value: String(tris) }] : []),
      ]}
      notice="VASP stores rho(r) * V_cell in x-fastest order; dividing by V_cell gives e/A^3. Drop your own CHGCAR; no synthetic results are preloaded."
      description={
        chg
          ? `CHGCAR loaded: grid ${chg.grid.join('x')}, ${chg.electrons.toFixed(3)} electrons, max ${chg.maxDensityPerA3.toFixed(4)} e/A^3.`
          : 'No CHGCAR loaded yet.'
      }
    >
      {err && <p role="alert">{err}</p>}
      {chg && rawField ? (
        <svg
          viewBox={`0 0 ${chg.grid[0]} ${chg.grid[1]}`}
          width="240"
          height="240"
          role="img"
          aria-label={`2D cross-section of ${channel} density at iz = ${sliceZ}`}
        >
          {Array.from({ length: chg.grid[1] }, (_, iy) =>
            Array.from({ length: chg.grid[0] }, (_, ix) => {
              const v = rawField[gridIndex(chg.grid, ix, iy, sliceZ)]! / Math.max(1e-12, chg.volumeA3);
              const norm = Math.min(1, Math.max(0, Math.abs(v) / Math.max(1e-12, chg.maxDensityPerA3)));
              return (
                <rect
                  key={`${ix}-${iy}`}
                  x={ix}
                  y={iy}
                  width={1}
                  height={1}
                  fill={v >= 0 ? '#0072B2' : '#D55E00'}
                  opacity={0.1 + 0.9 * norm}
                />
              );
            }),
          )}
        </svg>
      ) : (
        <p>Drop your own CHGCAR or PARCHG file above to inspect charge or spin density.</p>
      )}
    </LabShell>
  );
}
