import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import { HBAR2_OVER_2M_EV_A2 as C } from '../../lib/physics/constants';
import { makeGrid, solveLowest } from '../../lib/physics/solver1d';
import { densityFromStates, integrateDensity, potentialFromDensity } from '../../lib/physics/density1d';
import {
  CONTROL_X,
  PRESETS,
  presetHeights,
  shapeFromHeights,
  type PresetId,
} from '../../lib/physics/densityshape';

const W = 480;
const PAD = { l: 52, r: 14 };
const XMIN = -6;
const XMAX = 6;
const GRID = 1200;
const PA = { t: 30, b: 160 };
const PV = { t: 200, b: 310 };
const PD = { t: 350, b: 480 };
const H = 530;

const px = (x: number) => PAD.l + ((x - XMIN) / (XMAX - XMIN)) * (W - PAD.l - PAD.r);
const lineD = (xs: ArrayLike<number>, ys: ArrayLike<number>) => {
  let s = '';
  for (let i = 0; i < xs.length; i += 4) s += `${i ? 'L' : 'M'}${px(xs[i]!).toFixed(1)},${ys[i]!.toFixed(1)}`;
  return s;
};

type Well = 'harmonic' | 'box';
const grid = makeGrid(XMIN, XMAX, GRID);

/** Lab "density-as-a-map": one electron, density -> potential -> density; then N non-interacting electrons. */
export default function DensityMap() {
  const uid = useId();
  const [preset, setPreset] = useState<PresetId | 'custom'>('gaussian');
  const [heights, setHeights] = useState<number[]>(() => presetHeights('gaussian'));
  const [well, setWell] = useState<Well>('harmonic');
  const [N, setN] = useState(4);
  const [k, setK] = useState(10);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);

  const one = useMemo(() => {
    const f = shapeFromHeights(heights);
    const raw = Float64Array.from(grid.x, f);
    const area = integrateDensity(raw, grid.h);
    const target = raw.map((v) => v / area);
    const V = potentialFromDensity(C, grid.h, target, 0);
    const sol = solveLowest(C, grid.h, V, 1);
    const back = densityFromStates(sol.states, [1]);
    let peak = 0;
    let mis = 0;
    for (let i = 0; i < GRID; i++) {
      peak = Math.max(peak, target[i]!);
      mis = Math.max(mis, Math.abs(back[i]! - target[i]!));
    }
    // show V only where the electron is likely to be (density above 0.1 % of its peak)
    const shown: number[] = [];
    for (let i = 0; i < GRID; i++) if (target[i]! > 1e-3 * peak) shown.push(i);
    let vmin = Infinity;
    let vmax = -Infinity;
    for (const i of shown) {
      vmin = Math.min(vmin, V[i]!);
      vmax = Math.max(vmax, V[i]!);
    }
    return { raw, area, target, V, back, peak, mis: mis / peak, shown, vmin, vmax, E0: sol.energies[0]! };
  }, [heights]);

  const many = useMemo(() => {
    const V = Float64Array.from(grid.x, (x) => (well === 'harmonic' ? 0.5 * k * x * x : 0));
    const orbs = Math.ceil(N / 2);
    const sol = solveLowest(C, grid.h, V, orbs);
    const occ = Array.from({ length: orbs }, (_, i) => (i < Math.floor(N / 2) ? 2 : N % 2));
    const dens = densityFromStates(sol.states, occ);
    let peak = 0;
    for (const v of dens) peak = Math.max(peak, v);
    const parts = sol.states.map((s, i) => Float64Array.from(s, (v) => occ[i]! * v * v));
    return { V, sol, occ, dens, peak, parts, total: integrateDensity(dens, grid.h), orbs };
  }, [well, N, k]);

  const setHeight = (j: number, v: number) => {
    setPreset('custom');
    setHeights((hs) => hs.map((h, i) => (i === j ? Math.min(1, Math.max(0.01, v)) : h)));
  };
  const onKey = (j: number) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    const cur = heights[j]!;
    const map: Record<string, number> = {
      ArrowUp: cur + step,
      ArrowRight: cur + step,
      PageUp: cur + 0.2,
      ArrowDown: cur - step,
      ArrowLeft: cur - step,
      PageDown: cur - 0.2,
      Home: 0.01,
      End: 1,
    };
    if (e.key in map) {
      e.preventDefault();
      setHeight(j, Math.round(map[e.key]! * 100) / 100);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current === null || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const yPx = ((e.clientY - r.top) / r.height) * H;
    setHeight(drag.current, (PA.b - yPx) / (PA.b - PA.t) / 0.95);
  };

  // Rounding noise differs between the build machine and the browser, so never print it digit by digit.
  const misText = one.mis < 1e-6 ? 'below 1e-6' : one.mis.toExponential(1);
  const yA = (v: number) => PA.b - v * 0.95 * (PA.b - PA.t);
  const scaleA = one.area; // plot target and recovered as the un-normalised shape
  const dispPeak = Math.max(...Float64Array.from(one.raw));
  const aY = (n: number) => yA((n * scaleA) / dispPeak);
  const yV = (v: number) => {
    const span = one.vmax - one.vmin || 1;
    return PV.b - ((v - one.vmin) / span) * (PV.b - PV.t - 10);
  };
  const shownX = one.shown.map((i) => grid.x[i]!);
  const shownVY = one.shown.map((i) => yV(one.V[i]!));
  const yD = (v: number) => PD.b - (v / (many.peak * 1.1)) * (PD.b - PD.t);
  const ticks = [-6, -3, 0, 3, 6];
  const allX = Array.from(grid.x);

  return (
    <LabShell
      title="Density as a map"
      goal="Shape a density, see the one potential that makes it, and check that solving for that potential gives the density back."
      badge="toy-model"
      headingLevel={3}
      controls={
        <>
          <div className="orbitals-select">
            <label htmlFor={`${uid}-preset`}>Starting density (part 1)</label>{' '}
            <select
              id={`${uid}-preset`}
              className="orbitals-select-input"
              value={preset}
              onChange={(e) => {
                const id = e.target.value as PresetId;
                setPreset(id);
                setHeights(presetHeights(id));
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {preset === 'custom' && <option value="custom">Your own shape</option>}
            </select>
          </div>
          <div className="orbitals-select">
            <label htmlFor={`${uid}-well`}>Well for part 2</label>{' '}
            <select
              id={`${uid}-well`}
              className="orbitals-select-input"
              value={well}
              onChange={(e) => setWell(e.target.value as Well)}
            >
              <option value="harmonic">Harmonic well</option>
              <option value="box">Box (12 Å wide)</option>
            </select>
          </div>
          <Slider label="Electrons N (part 2)" min={1} max={8} step={1} value={N} onChange={setN} />
          {well === 'harmonic' && (
            <Slider
              label="Well stiffness (part 2)"
              min={2}
              max={20}
              step={1}
              value={k}
              onChange={setK}
              unit="eV/Å²"
            />
          )}
        </>
      }
      readouts={[
        {
          label: 'Part 1: largest mismatch after solving',
          value: misText,
          unit: 'of the peak',
        },
        {
          label: 'Part 1: potential range where the electron is',
          value: (one.vmax - one.vmin).toFixed(1),
          unit: 'eV',
        },
        { label: 'Part 2: electrons counted from the density', value: many.total.toFixed(6) },
        {
          label: 'Part 2: highest filled energy',
          value: many.sol.energies[many.orbs - 1]!.toFixed(3),
          unit: 'eV',
        },
      ]}
      onReset={() => {
        setPreset('gaussian');
        setHeights(presetHeights('gaussian'));
        setWell('harmonic');
        setN(4);
        setK(10);
      }}
      notice="This is a one-dimensional toy with one electron in part 1, and electrons that do not repel each other in part 2. Part 1 shows that for one electron a density points to one potential, up to adding a constant. It does not show how to do this for real materials, where electrons interact. Drag the dots, or focus one and use the arrow keys."
      description={`Part 1: a one-electron density you can reshape with seven handles. The lab computes the potential that has exactly that density as its lowest state, solves the Schrödinger equation for that potential, and overlays the result. The largest difference is ${misText} of the peak, so the curves coincide. The potential spans ${(one.vmax - one.vmin).toFixed(1)} electron volts where the electron is likely to be. Part 2: ${N} non-interacting electrons in a ${well === 'harmonic' ? 'harmonic' : 'box'} well fill ${many.orbs} orbital${many.orbs === 1 ? '' : 's'}, two electrons each, and their densities add to a total that integrates to ${many.total.toFixed(3)} electrons.`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Density and potential charts"
        style={{ width: '100%', height: 'auto', maxWidth: '40rem', touchAction: 'none' }}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <text x={PAD.l} y={14} fontSize="12" fill="var(--text)">
          1. Target density (solid) and density recovered from the potential (dashed)
        </text>
        <rect
          x={PAD.l}
          y={PA.t}
          width={W - PAD.l - PAD.r}
          height={PA.b - PA.t}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <path
          d={lineD(allX, Array.from(one.target, aY))}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        <path
          d={lineD(allX, Array.from(one.back, aY))}
          fill="none"
          stroke="var(--text)"
          strokeWidth="1.6"
          strokeDasharray="5 4"
        />
        {CONTROL_X.map((x, j) => (
          <circle
            key={j}
            cx={px(x)}
            cy={yA(heights[j]!)}
            r="8"
            tabIndex={0}
            role="slider"
            aria-label={`Density height at x = ${x.toFixed(1)} Å`}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Math.round(heights[j]! * 100) / 100}
            fill="var(--bg)"
            stroke="var(--accent)"
            strokeWidth="3"
            style={{ cursor: 'ns-resize' }}
            onKeyDown={onKey(j)}
            onPointerDown={(e) => {
              drag.current = j;
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
          />
        ))}
        <text x={PAD.l} y={PV.t - 8} fontSize="12" fill="var(--text)">
          2. The potential that has this density (where the electron is likely to be)
        </text>
        <rect
          x={PAD.l}
          y={PV.t}
          width={W - PAD.l - PAD.r}
          height={PV.b - PV.t}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <path d={lineD(shownX, shownVY)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
        <text
          x={PAD.l + 4}
          y={PV.t + 14}
          fontSize="11"
          fill="var(--text-muted)"
        >{`${one.vmax.toFixed(1)} eV above the lowest point, drawn relative`}</text>
        <text
          x={PAD.l}
          y={PD.t - 8}
          fontSize="12"
          fill="var(--text)"
        >{`3. ${N} non-interacting electrons: total density (thick) and each filled orbital`}</text>
        <rect
          x={PAD.l}
          y={PD.t}
          width={W - PAD.l - PAD.r}
          height={PD.b - PD.t}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        {many.parts.map((p, i) => (
          <path
            key={i}
            d={lineD(allX, Array.from(p, yD))}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.2"
          />
        ))}
        <path d={lineD(allX, Array.from(many.dens, yD))} fill="none" stroke="var(--accent)" strokeWidth="3" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={px(t)} x2={px(t)} y1={PD.b} y2={PD.b + 4} stroke="var(--text-muted)" />
            <text x={px(t)} y={PD.b + 17} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {t}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--text)">
          Position x (Å)
        </text>
      </svg>
    </LabShell>
  );
}
