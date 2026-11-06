import { useMemo, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import { radial, radialNodeRadii } from '../../lib/physics/hydrogen';
import './LabPlots.css';

const W = 480;
const H = 230;
const P = { l: 40, r: 12, t: 12, b: 34 };
const RMAX = 25; // bohr
const N = 3; // stand-in: hydrogen-like 3s, which has two radial nodes
const L = 0;

/**
 * Lab "paw-picture" (illustrative): a wiggly "all-electron" radial function (the hydrogen-like 3s, used only as a
 * stand-in with nodes) and a smooth nodeless pseudo function that matches it in value and slope at r_c.
 */
export default function PawLab() {
  const nodes = radialNodeRadii(N, L);
  const minRc = Math.ceil((nodes.at(-1)! + 0.5) * 2) / 2;
  const [rc, setRc] = useState(Math.max(minRc, 10));
  const u = (r: number) => r * radial(N, L, r);
  const curves = useMemo(() => {
    // pseudo inside rc: u_ps = r (a + b r^2), matched to u and u' at rc
    const h = 1e-4;
    const u0 = u(rc);
    const du = (u(rc + h) - u(rc - h)) / (2 * h);
    // u_ps(rc) = a rc + b rc^3, u_ps'(rc) = a + 3 b rc^2
    const b = (du - u0 / rc) / (2 * rc * rc);
    const a = u0 / rc - b * rc * rc;
    const rs: number[] = [];
    for (let r = 0; r <= RMAX + 1e-9; r += 0.05) rs.push(r);
    const ae = rs.map(u);
    const ps = rs.map((r) => (r < rc ? r * (a + b * r * r) : u(r)));
    return { rs, ae, ps };
  }, [rc]);
  const lo = Math.min(...curves.ae, ...curves.ps);
  const hi = Math.max(...curves.ae, ...curves.ps);
  const px = (r: number) => P.l + (r / RMAX) * (W - P.l - P.r);
  const py = (v: number) => P.t + ((hi - v) / (hi - lo)) * (H - P.t - P.b);
  const path = (ys: number[]) =>
    curves.rs.map((r, i) => `${i ? 'L' : 'M'}${px(r).toFixed(1)},${py(ys[i]!).toFixed(1)}`).join('');
  return (
    <LabShell
      title="All-electron and pseudo wavefunctions"
      goal="See how a pseudopotential replaces the wiggles near the nucleus by a smooth curve that agrees outside a cutoff radius."
      badge="illustrative"
      onReset={() => setRc(Math.max(minRc, 10))}
      controls={
        <Slider
          label="Cutoff radius r_c"
          min={minRc}
          max={20}
          step={0.5}
          value={rc}
          unit="bohr"
          onChange={setRc}
        />
      }
      readouts={[
        { label: 'Nodes inside r_c (all-electron)', value: nodes.filter((x) => x < rc).length },
        { label: 'Nodes of the pseudo function', value: 0 },
        {
          label: 'Trade-off',
          value:
            rc > 14
              ? 'very smooth, less transferable'
              : 'smoother than the original, still close to the core',
        },
      ]}
      notice="Outside r_c the two curves are the same, and that is where bonding happens. Inside, the pseudo function has no nodes, so far fewer plane waves are needed. A larger r_c makes it smoother (cheaper) but less faithful when the atom's environment changes. PAW keeps the smooth function for the plane waves and adds back the true shape inside r_c with stored atomic functions."
      description={`The plot shows r times a radial function from 0 to ${RMAX} bohr. The solid curve is the all-electron stand-in with ${nodes.length} nodes; the dashed curve is the smooth pseudo function, identical beyond r_c = ${rc} bohr and nodeless inside.`}
    >
      <figure className="lp-fig">
        <figcaption>r times radial function, against r (bohr)</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
          <line x1={P.l} x2={W - P.r} y1={py(0)} y2={py(0)} stroke="var(--border)" />
          <rect
            x={P.l}
            y={P.t}
            width={px(rc) - P.l}
            height={H - P.t - P.b}
            fill="var(--surface-2)"
            opacity="0.6"
          />
          <line x1={px(rc)} x2={px(rc)} y1={P.t} y2={H - P.b} stroke="var(--text-muted)" />
          <text x={px(rc) + 4} y={P.t + 12} fontSize="12" fill="currentColor">
            r_c
          </text>
          <path d={path(curves.ae)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          <path d={path(curves.ps)} fill="none" stroke="var(--text)" strokeWidth="2" strokeDasharray="6 4" />
          {[0, 5, 10, 15, 20, 25].map((r) => (
            <text key={r} x={px(r)} y={H - 12} textAnchor="middle" fontSize="12" fill="currentColor">
              {r}
            </text>
          ))}
        </svg>
        <p className="lp-legend">
          <span className="lp-key lp-solid" /> all-electron stand-in <span className="lp-key lp-dash" />{' '}
          pseudo (shaded: inside r_c)
        </p>
      </figure>
      <p className="lp-muted">
        Illustrative: the wiggly curve is the hydrogen-like 3s function, used only because it has nodes. It is
        not data for any real POTCAR, and real pseudo functions are built differently.
      </p>
    </LabShell>
  );
}
