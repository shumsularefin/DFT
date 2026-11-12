import { useMemo, useState } from 'react';
import LabShell from './LabShell';
import DropFile, { ParseStatus } from './DropFile';
import { readFileText, useParser } from './useParser';
import Slider from '../ui/Slider';
import { readStructure } from '../../lib/crystal/io';
import type { Mat3 } from '../../lib/crystal/types';
import type { EigenvalResult } from '../../lib/vasp/eigenval';
import { bandGap } from '../../lib/vasp/bandGap';
import { bandAxis } from '../../lib/vasp/bandPath';
import { parseKpoints, type LineSegment } from '../../lib/vasp/kpoints';
import { fmt, niceTicks } from '../../lib/vasp/ticks';
import './AnalysisViewers.css';

type Line = { pointsPerSegment: number; segments: LineSegment[] };

/** Lab "band-viewer": EIGENVAL as bands along the path, with the band gap and whether it is direct or indirect. */
export default function BandViewer({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const parser = useParser();
  const [eig, setEig] = useState<EigenvalResult | null>(null);
  const [name, setName] = useState('');
  const [lattice, setLattice] = useState<Mat3 | null>(null);
  const [pName, setPName] = useState('');
  const [line, setLine] = useState<Line | null>(null);
  const [kName, setKName] = useState('');
  const [ef, setEf] = useState('');
  const [win, setWin] = useState(6);
  const [msg, setMsg] = useState('');

  const onEig = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    const res = await parser.run({ kind: 'eigenval', text: r.text });
    if (res) {
      setEig(res);
      setName(f.name);
    }
  };
  const onStruct = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    try {
      setLattice(readStructure(f.name, r.text).structure.lattice);
      setPName(f.name);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read this structure.');
    }
  };
  const onKpoints = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    try {
      const p = parseKpoints(r.text);
      if (p.kind !== 'line')
        return setMsg('This KPOINTS file is not in line mode, so it has no path labels.');
      setLine({ pointsPerSegment: p.pointsPerSegment, segments: p.segments });
      setKName(f.name);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read this KPOINTS file.');
    }
  };

  const gap = useMemo(() => (eig ? bandGap(eig.bands, eig.kpoints) : null), [eig]);
  const axis = useMemo(
    () =>
      eig ? bandAxis(eig.kpoints, { ...(lattice ? { lattice } : {}), ...(line ? { line } : {}) }) : null,
    [eig, lattice, line],
  );

  const efNum = ef.trim() === '' ? null : Number(ef);
  const efOk = efNum !== null && Number.isFinite(efNum);
  const zero = efOk ? efNum! : gap && !gap.metallic ? gap.vbm.e : 0;
  const zeroLabel = efOk
    ? 'the Fermi level you entered'
    : gap && !gap.metallic
      ? 'the valence band maximum'
      : 'absolute (no reference known)';

  const W = 520;
  const H = 320;
  const x0 = 52;
  const x1 = W - 12;
  const xmax = axis ? axis.x[axis.x.length - 1]! || 1 : 1;
  const sx = (v: number) => x0 + (v / xmax) * (x1 - x0);
  const lo = -win;
  const hi = win;
  const sy = (e: number) => 12 + ((hi - (e - zero)) / (hi - lo)) * (H - 48);
  const spinColor = ['#0072B2', '#D55E00'];

  const bandPaths = useMemo(() => {
    if (!eig || !axis) return [];
    const out: { key: string; spin: number; d: string }[] = [];
    eig.bands.forEach((spinBands, s) => {
      for (let b = 0; b < eig.nbands; b++) {
        let d = '';
        spinBands.forEach((kb, k) => {
          d += `${k === 0 ? 'M' : 'L'}${sx(axis.x[k]!).toFixed(1)},${sy(kb[b]!.e).toFixed(1)}`;
        });
        out.push({ key: `${s}-${b}`, spin: s, d });
      }
    });
    return out;
  }, [eig, axis, zero, win]);

  const kLabel = (k: number) => {
    const t = axis?.ticks.find((tk) => Math.abs(tk.x - axis.x[k]!) < 1e-9);
    return t?.label ? `${t.label} (k-point ${k + 1})` : `k-point ${k + 1}`;
  };

  return (
    <LabShell
      title="Band structure viewer"
      goal="Open an EIGENVAL, see the bands along the k-path, and read the band gap and whether it is direct or indirect."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <DropFile what="EIGENVAL (or EIGENVAL_OPT)" onFile={onEig} disabled={parser.busy} loaded={name} />
          <DropFile
            what="KPOINTS in line mode (or KPOINTS_OPT), for labels"
            optional
            onFile={onKpoints}
            disabled={parser.busy}
            loaded={kName}
          />
          <DropFile
            what="POSCAR or CONTCAR, for the distance scale"
            optional
            onFile={onStruct}
            disabled={parser.busy}
            loaded={pName}
          />
          <ParseStatus busy={parser.busy} progress={parser.progress} error={parser.error || msg} />
          {eig && (
            <>
              <label className="or-num">
                Fermi level in eV (optional; from OUTCAR or DOSCAR)
                <input type="number" step="0.01" value={ef} onChange={(e) => setEf(e.currentTarget.value)} />
              </label>
              <Slider
                label="Energy window, plus and minus"
                min={1}
                max={20}
                value={win}
                unit="eV"
                onChange={setWin}
              />
            </>
          )}
        </>
      }
      readouts={
        eig && gap
          ? [
              { label: 'k-points', value: eig.nkpt },
              { label: 'Bands', value: eig.nbands },
              { label: 'Spin channels', value: eig.ispin },
              { label: 'Zero of energy', value: zeroLabel },
              ...(gap.metallic
                ? [{ label: 'Character on this path', value: 'metallic (a band crosses the Fermi level)' }]
                : [
                    { label: 'Band gap on this path', value: fmt(gap.gap, 4), unit: 'eV' },
                    { label: 'Direct or indirect', value: gap.direct ? 'direct' : 'indirect' },
                    { label: 'VBM at', value: kLabel(gap.vbm.k) },
                    { label: 'CBM at', value: kLabel(gap.cbm.k) },
                    ...(gap.directGap !== null && !gap.direct
                      ? [
                          {
                            label: 'Smallest direct gap on this path',
                            value: fmt(gap.directGap, 4),
                            unit: 'eV',
                          },
                        ]
                      : []),
                  ]),
            ]
          : []
      }
      onReset={() => {
        setEig(null);
        setName('');
        setLattice(null);
        setPName('');
        setLine(null);
        setKName('');
        setEf('');
        setWin(6);
        setMsg('');
        parser.setError('');
      }}
      notice="The gap is read only from the k-points in this file, so a band edge that lies off the path is missed and the true gap can be smaller. With a semilocal functional the gap is usually too small compared with experiment, so treat it as a trend, not a prediction. Occupations decide which states count as occupied, so a metal is reported as metallic rather than given a gap."
      description={
        eig && gap
          ? `Bands from ${name}: ${eig.nbands} bands at ${eig.nkpt} k-points, energy zero at ${zeroLabel}. ${gap.metallic ? 'The system is metallic on this path.' : `Band gap ${fmt(gap.gap, 4)} eV, ${gap.direct ? 'direct' : 'indirect'}, valence band maximum at ${kLabel(gap.vbm.k)}, conduction band minimum at ${kLabel(gap.cbm.k)}.`}`
          : 'No EIGENVAL loaded yet.'
      }
    >
      {!eig && (
        <p className="av-empty">
          Open an EIGENVAL to start. This viewer ships with no example: every band here comes from a file you
          open.
        </p>
      )}
      {eig && axis && gap && (
        <figure className="lp-fig">
          <figcaption>
            Bands (eV, zero at {zeroLabel})
            {axis.toScale ? '' : '; the x axis is not to scale (add a POSCAR for distances)'}
          </figcaption>
          <svg
            className="av-plot"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Band energies along the k-path"
          >
            <clipPath id="bv-clip">
              <rect x={x0} y={12} width={x1 - x0} height={H - 48} />
            </clipPath>
            {niceTicks(lo, hi, 6).map((t) => (
              <g key={t}>
                <line className="av-grid" x1={x0} x2={x1} y1={sy(t + zero)} y2={sy(t + zero)} />
                <text x={x0 - 4} y={sy(t + zero) + 4} textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {axis.ticks.map((t, i) => (
              <g key={i}>
                <line className="av-grid" x1={sx(t.x)} x2={sx(t.x)} y1={12} y2={H - 36} />
                <text x={sx(t.x)} y={H - 20} textAnchor="middle">
                  {t.label}
                </text>
              </g>
            ))}
            <line
              x1={x0}
              x2={x1}
              y1={sy(zero)}
              y2={sy(zero)}
              stroke="var(--text)"
              strokeDasharray="6 4"
              strokeWidth="1.5"
            />
            <g clipPath="url(#bv-clip)">
              {bandPaths.map((p) => (
                <path
                  key={p.key}
                  d={p.d}
                  fill="none"
                  stroke={spinColor[p.spin]}
                  strokeWidth="1.5"
                  strokeDasharray={p.spin === 1 ? '5 3' : undefined}
                />
              ))}
              {!gap.metallic && (
                <>
                  <circle
                    cx={sx(axis.x[gap.vbm.k]!)}
                    cy={sy(gap.vbm.e)}
                    r="5"
                    fill="none"
                    stroke="var(--text)"
                    strokeWidth="2"
                  />
                  <rect
                    x={sx(axis.x[gap.cbm.k]!) - 5}
                    y={sy(gap.cbm.e) - 5}
                    width="10"
                    height="10"
                    fill="none"
                    stroke="var(--text)"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
            <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
              E (eV)
            </text>
          </svg>
          <p className="lp-legend">
            {!gap.metallic && 'Circle: valence band maximum. Square: conduction band minimum. '}
            {eig.ispin === 2 && 'Solid: spin up. Dashed: spin down. '}
            The dashed horizontal line is the energy zero.
          </p>
        </figure>
      )}
      {axis?.warnings.map((w) => (
        <p key={w} className="av-note">
          {w}
        </p>
      ))}
    </LabShell>
  );
}
