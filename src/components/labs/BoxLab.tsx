import { useEffect, useId, useRef, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { boxBeatPeriodFs, boxDensity, boxEnergyEV, boxInteriorNodes, boxPsi } from '../../lib/physics/box';
import { prefersReducedMotion } from '../../lib/three/capabilities';

const W = 480;
const H = 400;
const PAD = { l: 62, r: 16 };
const PANELS = { a: { t: 20, b: 170 }, b: { t: 225, b: 350 } };
const CYCLE_SECONDS = 5; // on-screen time for one beat when playing

const fmt = (v: number) =>
  v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toPrecision(3);

/** Lab "particle-in-a-box": exact closed-form results for one electron in a 1D box. Computed live, not a simulation. */
export default function BoxLab() {
  const [L, setL] = useState(5);
  const [n, setN] = useState(1);
  const [mix, setMix] = useState(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  const uid = useId();
  const m = n + 1;
  const w = mix / 100;

  const raf = useRef(0);
  useEffect(() => {
    if (!playing || reduced || w === 0) return;
    let last = 0;
    const tick = (t: number) => {
      if (last) setPhase((p) => (p + (t - last) / 1000 / CYCLE_SECONDS) % 1);
      last = t;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, reduced, w]);

  const E = boxEnergyEV(n, L);
  const gap = boxEnergyEV(m, L) - E;
  const T = boxBeatPeriodFs(L, n, m);
  const slowdown = CYCLE_SECONDS / (T * 1e-15);

  const px = (x: number) => PAD.l + (x / L) * (W - PAD.l - PAD.r);
  const amp = Math.sqrt(2 / L);
  const aMax = amp * 1.15;
  const aY = (v: number) => {
    const { t, b } = PANELS.a;
    return (t + b) / 2 - (v / aMax) * ((b - t) / 2);
  };
  const dMax = ((w > 0 ? 4 : 2) / L) * 1.05;
  const dY = (v: number) => {
    const { t, b } = PANELS.b;
    return b - (v / dMax) * (b - t);
  };
  const xs = Array.from({ length: 241 }, (_, i) => (L * i) / 240);
  const line = (f: (x: number) => number, y: (v: number) => number) =>
    `M${xs.map((x) => `${px(x).toFixed(1)},${y(f(x)).toFixed(1)}`).join('L')}`;
  const dens = (x: number) => boxDensity(L, n, m, w, phase, x);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * L);

  return (
    <LabShell
      title="One electron in a box"
      goal="Change the size of the box and the state, and see how the energy and the wave pattern respond."
      badge="computed"
      headingLevel={3}
      controls={
        <>
          <Slider label="Box length L" min={0.5} max={10} step={0.1} value={L} onChange={setL} unit="Å" />
          <Slider label="State n" min={1} max={6} step={1} value={n} onChange={setN} />
          <Slider
            label={`Mix in state ${m}`}
            min={0}
            max={100}
            step={5}
            value={mix}
            onChange={(v) => {
              setMix(v);
              if (v === 0) setPlaying(false);
            }}
            unit="%"
          />
          <Slider
            label="Time within one beat"
            min={0}
            max={1}
            step={0.01}
            value={phase}
            onChange={(v) => {
              setPlaying(false);
              setPhase(v);
            }}
            unit="of a beat"
          />
          {!reduced && (
            <Toggle
              label="Play the beat"
              checked={playing && w > 0}
              onChange={(v) => setPlaying(v && w > 0)}
            />
          )}
        </>
      }
      readouts={[
        { label: `Energy E${n}`, value: fmt(E), unit: 'eV' },
        { label: 'Interior nodes', value: boxInteriorNodes(n) },
        { label: `Gap E${m} minus E${n}`, value: fmt(gap), unit: 'eV' },
        {
          label: 'Beat period',
          value: w > 0 ? fmt(T) : 'needs a mix above 0',
          unit: w > 0 ? 'fs' : undefined,
        },
        ...(playing && w > 0 ? [{ label: 'Playback slowed down by', value: slowdown.toExponential(1) }] : []),
      ]}
      onReset={() => {
        setL(5);
        setN(1);
        setMix(0);
        setPhase(0);
        setPlaying(false);
      }}
      notice="Make the box smaller and the energy rises quickly (it goes as 1 over L squared). Raise n and the energy rises as n squared while one more node fits inside. With a mix, the probability sloshes back and forth once per beat, and a bigger energy gap means a shorter beat. This is a model of one electron in a one-dimensional box, not a real material."
      description={`Two stacked charts. The upper chart shows the wavefunction of state n = ${n} across a box ${fmt(L)} ångström long: a standing wave with ${boxInteriorNodes(n)} interior node${boxInteriorNodes(n) === 1 ? '' : 's'}${w > 0 ? `, with the wavefunction of state ${m} dashed` : ''}. The lower chart shows the probability density of finding the electron at each position${w > 0 ? `, for a ${mix} percent mix of state ${m}, at ${fmt(phase)} of one beat` : ''}. The energy of state ${n} is ${fmt(E)} electron volts${w > 0 ? ` and the beat period is ${fmt(T)} femtoseconds` : ''}.`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t`}
        style={{ width: '100%', height: 'auto', maxWidth: '40rem' }}
      >
        <title id={`${uid}-t`}>
          {`Wavefunction and probability density of an electron in a box of length ${fmt(L)} Angstrom, state ${n}`}
        </title>
        {/* upper panel: wavefunctions */}
        <rect
          x={PAD.l}
          y={PANELS.a.t}
          width={W - PAD.l - PAD.r}
          height={PANELS.a.b - PANELS.a.t}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={aY(0)}
          y2={aY(0)}
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
        />
        {[amp, -amp].map((v) => (
          <g key={v}>
            <line x1={PAD.l - 4} x2={PAD.l} y1={aY(v)} y2={aY(v)} stroke="var(--text-muted)" />
            <text x={PAD.l - 7} y={aY(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {v > 0 ? '+' : '-'}
              {fmt(amp)}
            </text>
          </g>
        ))}
        <text x={PAD.l - 7} y={aY(0) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
          0
        </text>
        {w > 0 && (
          <path
            d={line((x) => boxPsi(m, L, x), aY)}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
        )}
        <path d={line((x) => boxPsi(n, L, x), aY)} fill="none" stroke="var(--accent)" strokeWidth="2.8" />
        <text
          transform={`translate(13 ${(PANELS.a.t + PANELS.a.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          ψ (Å^-1/2)
        </text>
        {/* lower panel: density */}
        <rect
          x={PAD.l}
          y={PANELS.b.t}
          width={W - PAD.l - PAD.r}
          height={PANELS.b.b - PANELS.b.t}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        {[0, dMax / 1.05 / 2, dMax / 1.05].map((v) => (
          <g key={v}>
            <line x1={PAD.l - 4} x2={PAD.l} y1={dY(v)} y2={dY(v)} stroke="var(--text-muted)" />
            <text x={PAD.l - 7} y={dY(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {v === 0 ? '0' : fmt(v)}
            </text>
          </g>
        ))}
        <path
          d={`${line(dens, dY)}L${px(L).toFixed(1)},${dY(0)}L${px(0).toFixed(1)},${dY(0)}Z`}
          fill="var(--accent)"
          fillOpacity="0.25"
          stroke="var(--accent)"
          strokeWidth="2.4"
        />
        <text
          transform={`translate(13 ${(PANELS.b.t + PANELS.b.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          |Ψ|² (1/Å)
        </text>
        {xTicks.map((x) => (
          <g key={x}>
            <line x1={px(x)} x2={px(x)} y1={PANELS.b.b} y2={PANELS.b.b + 4} stroke="var(--text-muted)" />
            <text x={px(x)} y={PANELS.b.b + 17} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {fmt(x)}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 22} textAnchor="middle" fontSize="12" fill="var(--text)">
          Position x in the box (Å)
        </text>
        <text
          x={(PAD.l + W - PAD.r) / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-muted)"
        >
          Toy model, computed live from the exact formulas
        </text>
      </svg>
    </LabShell>
  );
}
