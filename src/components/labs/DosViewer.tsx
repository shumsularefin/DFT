import { useMemo, useState } from 'react';
import LabShell from './LabShell';
import DropFile, { ParseStatus } from './DropFile';
import { readFileText, useParser } from './useParser';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { readStructure } from '../../lib/crystal/io';
import type { DoscarResult } from '../../lib/vasp/doscar';
import {
  ORBITAL_GROUPS,
  gaussianSmooth,
  projectedSum,
  valueAt,
  type Curve,
  type OrbitalGroup,
} from '../../lib/vasp/dosTools';
import { fmt, niceTicks } from '../../lib/vasp/ticks';
import './AnalysisViewers.css';

const COLORS = ['#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#999999'];
const TOTAL = '#0072B2';
const MAX_ATOM_CHIPS = 12;

interface Group {
  key: string;
  label: string;
  ions: number[];
}

/** Lab "dos-viewer": total and projected DOS from a DOSCAR on an E - E_F axis, spin down mirrored. */
export default function DosViewer({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const parser = useParser();
  const [dos, setDos] = useState<DoscarResult | null>(null);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<string[] | null>(null);
  const [pName, setPName] = useState('');
  const [msg, setMsg] = useState('');
  const [showTotal, setShowTotal] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [orbs, setOrbs] = useState<OrbitalGroup[]>(['s', 'p', 'd']);
  const [lo, setLo] = useState(-8);
  const [hi, setHi] = useState(6);
  const [smooth, setSmooth] = useState(false);
  const [sigma, setSigma] = useState(0.1);

  const onDos = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    const res = await parser.run({ kind: 'doscar', text: r.text });
    if (res) {
      setDos(res);
      setName(f.name);
      setPicked([]);
      const span = res.emin - res.efermi;
      setLo(Math.max(Math.round(span), -10));
      setHi(Math.min(Math.round(res.emax - res.efermi), 8));
    }
  };
  const onStruct = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    try {
      setSpecies([...readStructure(f.name, r.text).structure.species]);
      setPName(f.name);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read this structure.');
    }
  };

  const groups = useMemo<Group[]>(() => {
    if (!dos || dos.ions.length === 0) return [];
    if (species && species.length === dos.nions) {
      const m = new Map<string, number[]>();
      species.forEach((s, i) => m.set(s, [...(m.get(s) ?? []), i]));
      return [...m].map(([s, ions]) => ({ key: s, label: `${s} (${ions.length})`, ions }));
    }
    if (dos.nions <= MAX_ATOM_CHIPS)
      return dos.ions.map((_, i) => ({ key: `a${i}`, label: `Atom ${i + 1}`, ions: [i] }));
    return [{ key: 'all', label: `All ${dos.nions} atoms`, ions: dos.ions.map((_, i) => i) }];
  }, [dos, species]);

  const lines = useMemo(() => {
    if (!dos) return [];
    const sm = (c: Curve): Curve => ({
      up: smooth ? gaussianSmooth(dos.energies, c.up, sigma) : c.up,
      ...(c.down ? { down: smooth ? gaussianSmooth(dos.energies, c.down, sigma) : c.down } : {}),
    });
    const out: { key: string; label: string; color: string; curve: Curve }[] = [];
    if (showTotal)
      out.push({
        key: 'total',
        label: 'Total',
        color: TOTAL,
        curve: sm({ up: dos.totalUp, ...(dos.totalDown ? { down: dos.totalDown } : {}) }),
      });
    groups
      .filter((g) => picked.includes(g.key))
      .forEach((g, i) =>
        out.push({
          key: g.key,
          label: `${g.label} ${orbs.join('+') || 'none'}`,
          color: COLORS[i % COLORS.length]!,
          curve: sm(projectedSum(dos, g.ions, orbs)),
        }),
      );
    return out;
  }, [dos, groups, picked, orbs, showTotal, smooth, sigma]);

  const W = 520;
  const H = 300;
  const x0 = 56;
  const x1 = W - 14;
  const lo2 = Math.min(lo, hi - 1);
  const view = useMemo(() => {
    if (!dos) return null;
    let ymax = 0;
    let ymin = 0;
    for (const l of lines) {
      for (let k = 0; k < dos.energies.length; k++) {
        const e = dos.energies[k]! - dos.efermi;
        if (e < lo2 || e > hi) continue;
        ymax = Math.max(ymax, l.curve.up[k]!);
        if (l.curve.down) ymin = Math.min(ymin, -l.curve.down[k]!);
      }
    }
    if (ymax === 0 && ymin === 0) ymax = 1;
    return { ymax: ymax * 1.05, ymin: ymin * 1.05 };
  }, [dos, lines, lo2, hi]);

  const spinTwo = dos?.ispin === 2;
  const sx = (e: number) => x0 + ((e - lo2) / (hi - lo2)) * (x1 - x0);
  const sy = (v: number) => 14 + ((view!.ymax - v) / (view!.ymax - view!.ymin || 1)) * (H - 50);
  const path = (c: Float64Array, sign: 1 | -1) => {
    const pts: string[] = [];
    for (let k = 0; k < dos!.energies.length; k++) {
      const e = dos!.energies[k]! - dos!.efermi;
      if (e < lo2 || e > hi) continue;
      pts.push(`${sx(e).toFixed(1)},${sy(sign * c[k]!).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  const atF = dos
    ? valueAt(dos.energies, dos.totalUp, dos.efermi) !== null
      ? (valueAt(dos.energies, dos.totalUp, dos.efermi) ?? 0) +
        (dos.totalDown ? (valueAt(dos.energies, dos.totalDown, dos.efermi) ?? 0) : 0)
      : null
    : null;
  const nIntegrated = dos
    ? (valueAt(dos.energies, dos.intUp, dos.efermi) ?? NaN) +
      (dos.intDown ? (valueAt(dos.energies, dos.intDown, dos.efermi) ?? NaN) : 0)
    : NaN;

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <LabShell
      title="DOS viewer"
      goal="Open a DOSCAR and read the total and projected density of states, with the Fermi level at zero."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <DropFile what="DOSCAR" onFile={onDos} disabled={parser.busy} loaded={name} />
          <DropFile
            what="POSCAR or CONTCAR"
            optional
            onFile={onStruct}
            disabled={parser.busy}
            loaded={pName}
          />
          <p className="av-note">
            DOSCAR does not store element names. With a POSCAR or CONTCAR of the same run the atoms are
            grouped by element.
          </p>
          <ParseStatus busy={parser.busy} progress={parser.progress} error={parser.error || msg} />
          {dos && (
            <>
              <Toggle label="Total DOS" checked={showTotal} onChange={setShowTotal} />
              {dos.lorbit && groups.length > 0 && (
                <>
                  <fieldset className="av-chips">
                    <legend>Projected onto</legend>
                    {groups.map((g) => (
                      <label key={g.key} className="av-chip">
                        <input
                          type="checkbox"
                          checked={picked.includes(g.key)}
                          onChange={() => setPicked((p) => toggle(p, g.key))}
                        />
                        {g.label}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="av-chips">
                    <legend>Orbitals</legend>
                    {ORBITAL_GROUPS.map((o) => (
                      <label key={o} className="av-chip">
                        <input
                          type="checkbox"
                          checked={orbs.includes(o)}
                          onChange={() => setOrbs((p) => toggle(p, o))}
                        />
                        {o}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {!dos.lorbit && (
                <p className="av-note">
                  This DOSCAR has no projected DOS. Set LORBIT = 11 in the INCAR to write one.
                </p>
              )}
              <Slider label="Lowest energy shown" min={-30} max={-1} value={lo} unit="eV" onChange={setLo} />
              <Slider label="Highest energy shown" min={1} max={30} value={hi} unit="eV" onChange={setHi} />
              <Toggle label="Gaussian smoothing (off by default)" checked={smooth} onChange={setSmooth} />
              {smooth && (
                <Slider
                  label="Smoothing width"
                  min={0.02}
                  max={0.5}
                  step={0.01}
                  value={sigma}
                  unit="eV"
                  onChange={setSigma}
                />
              )}
            </>
          )}
        </>
      }
      readouts={
        dos
          ? [
              { label: 'Fermi level in the file', value: fmt(dos.efermi, 5), unit: 'eV' },
              { label: 'Spin channels', value: dos.ispin },
              { label: 'Energy points', value: dos.nedos },
              { label: 'Total DOS at E_F', value: atF === null ? 'n/a' : fmt(atF), unit: 'states/eV' },
              { label: 'Integrated DOS at E_F', value: fmt(nIntegrated, 5), unit: 'electrons' },
            ]
          : []
      }
      onReset={() => {
        setDos(null);
        setName('');
        setSpecies(null);
        setPName('');
        setPicked([]);
        setSmooth(false);
        setShowTotal(true);
        setOrbs(['s', 'p', 'd']);
        setMsg('');
        parser.setError('');
      }}
      notice="Look at the value of the total DOS exactly at zero. A clear gap that contains zero means an insulator or semiconductor at this level of theory, and a non-zero value means a metal. The projections tell you which atom and orbital the states just below and above zero belong to. Smoothing only changes how the curve looks, so read gaps from the unsmoothed curve."
      description={
        dos
          ? `Density of states from ${name}, ${dos.ispin === 2 ? 'spin up above and spin down mirrored below the axis' : 'one spin channel'}, energy from ${lo2} to ${hi} eV relative to the Fermi level. Lines shown: ${lines.map((l) => l.label).join(', ') || 'none'}.${smooth ? ` Gaussian smoothing of ${sigma} eV is on.` : ''}`
          : 'No DOSCAR loaded yet.'
      }
    >
      {!dos && (
        <p className="av-empty">
          Open a DOSCAR to start. This viewer ships with no example: every curve here comes from a file you
          open.
        </p>
      )}
      {dos && view && (
        <figure className="lp-fig">
          <figcaption>
            Density of states (states/eV){smooth ? `, Gaussian smoothing ${sigma} eV` : ''}
          </figcaption>
          <svg
            className="av-plot"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Density of states against energy"
          >
            {niceTicks(lo2, hi, 6).map((t) => (
              <g key={t}>
                <line className="av-grid" x1={sx(t)} x2={sx(t)} y1={14} y2={H - 36} />
                <text x={sx(t)} y={H - 20} textAnchor="middle">
                  {t}
                </text>
              </g>
            ))}
            {niceTicks(view.ymin, view.ymax, 4).map((t) => (
              <g key={t}>
                <line className="av-grid" x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} />
                <text x={x0 - 4} y={sy(t) + 4} textAnchor="end">
                  {fmt(t, 3)}
                </text>
              </g>
            ))}
            <line className="av-axis" x1={x0} x2={x1} y1={sy(0)} y2={sy(0)} />
            <line
              x1={sx(0)}
              x2={sx(0)}
              y1={14}
              y2={H - 36}
              stroke="var(--text)"
              strokeDasharray="6 4"
              strokeWidth="1.5"
            />
            <text x={(x0 + x1) / 2} y={H - 4} textAnchor="middle">
              E - E_F (eV)
            </text>
            {lines.map((l) => (
              <g key={l.key}>
                <polyline fill="none" stroke={l.color} strokeWidth="2" points={path(l.curve.up, 1)} />
                {spinTwo && l.curve.down && (
                  <polyline
                    fill="none"
                    stroke={l.color}
                    strokeWidth="2"
                    strokeDasharray="1 0"
                    points={path(l.curve.down, -1)}
                  />
                )}
              </g>
            ))}
          </svg>
          <p className="lp-legend">
            {lines.map((l) => (
              <span key={l.key} style={{ marginRight: '1rem' }}>
                <span className="av-key" style={{ background: l.color }} aria-hidden="true" />
                {l.label}
              </span>
            ))}
            {spinTwo && (
              <span>Spin up above the axis, spin down mirrored below it. The dashed line is E_F.</span>
            )}
          </p>
        </figure>
      )}
      {dos?.warnings.map((w) => (
        <p key={w} className="av-note">
          {w}
        </p>
      ))}
    </LabShell>
  );
}
