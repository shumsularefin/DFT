import { useId, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import {
  bytesForDoubles,
  bytesToTerabytes,
  formatBig,
  log10Big,
  slaterDeterminants,
} from '../../lib/physics/combinatorics';

const W = 480;
const H = 300;
const PAD = { l: 64, r: 16, t: 14, b: 44 };
const N_MAX = 60;
const Y_MAX = 120; // decades shown

const px = (n: number) => PAD.l + ((n - 1) / (N_MAX - 1)) * (W - PAD.l - PAD.r);
const py = (y: number) => H - PAD.b - (Math.min(Math.max(y, 0), Y_MAX) / Y_MAX) * (H - PAD.t - PAD.b);

function curve(p: number): string {
  const pts: string[] = [];
  for (let n = 1; n <= N_MAX; n++)
    pts.push(`${px(n).toFixed(1)},${py(log10Big(slaterDeterminants(n, n * p))).toFixed(1)}`);
  return `M${pts.join('L')}`;
}

/** Lab "exponential-wall": exact counting of Slater determinants. Computed, not modelled. */
export default function ExponentialWall() {
  const [N, setN] = useState(10);
  const [p, setP] = useState(4);
  const uid = useId();
  const M = N * p;
  const dets = slaterDeterminants(N, M);
  const bytes = bytesForDoubles(dets);
  const tb = bytesToTerabytes(bytes);
  const lg = log10Big(dets);
  const bytesLog = log10Big(bytes);
  const tbText =
    tb < 1e-3
      ? 'under a thousandth of a terabyte'
      : tb < 1e6
        ? `${tb.toPrecision(3)} terabytes`
        : `10^${(bytesLog - 12).toFixed(1)} terabytes`;
  const yTicks = [0, 30, 60, 90, 120];
  const xTicks = [1, 10, 20, 30, 40, 50, 60];

  return (
    <LabShell
      title="The exponential wall"
      goal="Add electrons and orbitals, and watch the number of numbers that describe the electrons explode."
      badge="computed"
      headingLevel={3}
      controls={
        <>
          <Slider label="Electrons N" min={1} max={60} step={1} value={N} onChange={setN} />
          <Slider label="Spin orbitals per electron" min={2} max={10} step={1} value={p} onChange={setP} />
        </>
      }
      readouts={[
        { label: 'Spin orbitals M', value: M },
        { label: 'Slater determinants C(M, N)', value: formatBig(dets) },
        { label: 'Memory at 8 bytes each', value: formatBig(bytes), unit: 'bytes' },
        { label: 'In terabytes (10^12 bytes)', value: tbText },
      ]}
      onReset={() => {
        setN(10);
        setP(4);
      }}
      notice="This is exact counting, not a simulation. It counts every way to put N electrons into M spin orbitals, which is the size of the full wavefunction in the most straightforward exact method. Methods that are cheaper exist and make approximations. The point is the shape: adding electrons multiplies the number, so the curve climbs like a wall."
      description={`A chart of the number of Slater determinants against the number of electrons, on a logarithmic vertical axis, for ${p} spin orbitals per electron. For ${N} electrons and ${M} spin orbitals there are ${formatBig(dets)} determinants, which needs ${formatBig(bytes)} bytes (${tbText}) at 8 bytes each. The curve rises steeply and never levels off.`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t`}
        style={{ width: '100%', height: 'auto', maxWidth: '40rem' }}
      >
        <title
          id={`${uid}-t`}
        >{`Number of determinants against electrons, ${p} spin orbitals per electron`}</title>
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="var(--border)" />
            <text
              x={PAD.l - 6}
              y={py(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
            >{`10^${t}`}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t}
            x={px(t)}
            y={H - PAD.b + 16}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {t}
          </text>
        ))}
        <path d={curve(p)} fill="none" stroke="var(--accent)" strokeWidth="2.8" />
        <line
          x1={px(N)}
          x2={px(N)}
          y1={PAD.t}
          y2={H - PAD.b}
          stroke="var(--text-muted)"
          strokeDasharray="4 3"
        />
        <circle cx={px(N)} cy={py(lg)} r="5.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--text)">
          Number of electrons N
        </text>
        <text
          transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          Determinants (log scale)
        </text>
      </svg>
    </LabShell>
  );
}
