import { useId, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import {
  METHODS,
  doublingFactor,
  log10RelativeCost,
  methodById,
  sizeFromSlider,
  type MethodId,
} from '../../lib/physics/scaling';

const W = 480;
const H = 300;
const PAD = { l: 64, r: 16, t: 14, b: 44 };
const X_MAX = 2; // log10 of the largest size multiple
const Y_MAX = 14; // decades of relative cost; curves above are clipped
const DASH: Record<MethodId, string> = {
  'force-field': '2 4',
  dft: '',
  hf: '10 4',
  mp2: '4 3',
  ccsd: '12 3 2 3',
  ccsdt: '6 2 1 2',
  fci: '1 3',
};
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) =>
  String(n)
    .split('')
    .map((c) => SUP[Number(c)])
    .join('');
const tick10 = (k: number) => (k === 0 ? '1' : `10${sup(k)}`);

const px = (x: number) => PAD.l + (x / X_MAX) * (W - PAD.l - PAD.r);
const py = (y: number) => H - PAD.b - (Math.min(y, Y_MAX) / Y_MAX) * (H - PAD.t - PAD.b);

function curvePath(id: MethodId): string {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80) * X_MAX;
    pts.push(`${px(x).toFixed(1)},${py(log10RelativeCost(id, sizeFromSlider(x))).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

const fmtSize = (s: number) => (s < 10 ? s.toFixed(1) : s.toFixed(0));

/** Lab "cost-of-exactness": how the cost of method families grows with system size. Relative cost only. */
export default function CostOfExactness() {
  const [logSize, setLogSize] = useState(1);
  const [method, setMethod] = useState<MethodId>('dft');
  const [showAll, setShowAll] = useState(true);
  const uid = useId();
  const size = sizeFromSlider(logSize);
  const m = methodById(method);
  const cost = log10RelativeCost(method, size);
  const factor = doublingFactor(method);
  const clipped = cost > Y_MAX;
  const xTicks = [0, 1, 2];
  const yTicks = Array.from({ length: Y_MAX / 2 + 1 }, (_, i) => i * 2);
  const visible = METHODS.filter((x) => showAll || x.id === method);

  const readCost =
    m.kind === 'formal'
      ? `about 10^${cost.toFixed(1)} times the cost at size 1`
      : 'no number: this curve shows a shape only';

  return (
    <LabShell
      title="Cost of exactness"
      goal="Move the size slider and compare how fast the cost of each family of methods climbs."
      badge="illustrative"
      headingLevel={3}
      controls={
        <>
          <Slider
            label="System size, as a power of 10 (1 means 10 times the smallest)"
            min={0}
            max={2}
            step={0.05}
            value={logSize}
            onChange={setLogSize}
            unit=""
          />
          <fieldset className="costlab-methods">
            <legend>Highlighted method</legend>
            {METHODS.map((x) => (
              <label key={x.id} className="costlab-method">
                <input
                  type="radio"
                  name={`${uid}-method`}
                  value={x.id}
                  checked={method === x.id}
                  onChange={() => setMethod(x.id)}
                />
                <svg width="34" height="10" aria-hidden="true">
                  <line
                    x1="1"
                    y1="5"
                    x2="33"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={DASH[x.id]}
                  />
                </svg>
                <span>
                  {x.label}
                  {x.kind === 'qualitative' ? ' (qualitative)' : ''}
                </span>
              </label>
            ))}
          </fieldset>
          <Toggle label="Show all methods" checked={showAll} onChange={setShowAll} />
        </>
      }
      readouts={[
        { label: 'Size', value: fmtSize(size), unit: 'times the smallest' },
        { label: 'Method', value: m.label },
        { label: 'Growth', value: m.growth },
        {
          label: 'If the size doubles, cost is multiplied by',
          value: factor === null ? 'no fixed factor (qualitative)' : `${factor}`,
        },
        { label: 'Relative cost at this size', value: readCost },
      ]}
      onReset={() => {
        setLogSize(1);
        setMethod('dft');
        setShowAll(true);
      }}
      notice="Every curve starts at 1 by construction, so this plot cannot tell you which method is cheaper at a small size. Look at how steeply each one climbs. A higher power climbs faster, and the exact solution climbs so fast that it leaves the chart. The vertical axis is relative cost, not seconds."
      description={`A log-log chart. The horizontal axis is system size from 1 to 100 times the smallest system. The vertical axis is relative cost from 1 to 10 to the 14th power, not a time. Straight lines rise more steeply for a higher power: DFT rises by a factor of ${doublingFactor('dft')} per doubling, Hartree-Fock by ${doublingFactor('hf')}, MP2 by ${doublingFactor('mp2')}, CCSD by ${doublingFactor('ccsd')} and CCSD(T) by ${doublingFactor('ccsdt')}. A classical force field rises about in step with the size and the exact solution rises faster than any power, leaving the chart. The force-field and exact curves are qualitative shapes. Currently the size is ${fmtSize(size)} times the smallest and the highlighted method is ${m.label}: ${readCost}.`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t`}
        className="costlab-svg"
        style={{ width: '100%', height: 'auto', maxWidth: '40rem' }}
      >
        <title id={`${uid}-t`}>
          Log-log chart of relative cost against system size for six method families and the exact solution
        </title>
        <clipPath id={`${uid}-clip`}>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
        </clipPath>
        {yTicks.map((k) => (
          <g key={`y${k}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(k)} y2={py(k)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.l - 6} y={py(k) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {tick10(k)}
            </text>
          </g>
        ))}
        {xTicks.map((k) => (
          <g key={`x${k}`}>
            <line x1={px(k)} x2={px(k)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" strokeWidth="1" />
            <text x={px(k)} y={H - PAD.b + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {tick10(k)}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text)">
          System size (times the smallest)
        </text>
        <text
          transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          Relative cost (not time)
        </text>
        <g clipPath={`url(#${uid}-clip)`}>
          {visible.map((x) => (
            <path
              key={x.id}
              d={curvePath(x.id)}
              fill="none"
              stroke={x.id === method ? 'var(--accent)' : 'var(--text-muted)'}
              strokeWidth={x.id === method ? 3 : 1.5}
              strokeDasharray={DASH[x.id]}
              opacity={x.id === method ? 1 : 0.8}
            />
          ))}
        </g>
        <line
          x1={px(logSize)}
          x2={px(logSize)}
          y1={PAD.t}
          y2={H - PAD.b}
          stroke="var(--text)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle
          cx={px(logSize)}
          cy={py(cost)}
          r="5"
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth="2"
        />
        {clipped && (
          <text x={px(logSize) + 8} y={PAD.t + 12} fontSize="11" fill="var(--text)">
            off the chart
          </text>
        )}
      </svg>
      <p className="costlab-note">
        Straight lines on this chart are powers of the size. Illustrative: costs are relative to the smallest
        system, with all prefactors set equal, so no timing is implied.
      </p>
    </LabShell>
  );
}
