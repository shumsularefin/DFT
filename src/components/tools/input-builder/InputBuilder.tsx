import { useEffect, useState } from 'react';
import './input-builder.css';
import CheckStep from './CheckStep';
import JobStep from './JobStep';
import KpointsStep from './KpointsStep';
import SeriesPanel from './SeriesPanel';
import SettingsStep from './SettingsStep';
import StructureStep from './StructureStep';
import TagCard, { tagByName } from './TagCard';
import TaskStep from './TaskStep';
import { useLevel } from './hooks';
import { STEPS, useBuilder } from './store';

export default function InputBuilder() {
  const { step, setStep, selectedTag, applyShare, set, entries, structure } = useBuilder();
  const incar = Object.fromEntries(entries.map((e) => [e.name, e.value]));
  const level = useLevel();
  const [mode, setMode] = useState<'single' | 'series'>('single');

  useEffect(() => {
    const m = /(?:^|[#&])s=([^&]+)/.exec(location.hash);
    if (!m?.[1]) return;
    applyShare(m[1]);
  }, [applyShare]);

  // Deep link from the command palette: /tools/input-builder/?tag=ENCUT opens the settings step on that tag card.
  useEffect(() => {
    const name = new URLSearchParams(location.search).get('tag');
    if (!name || !tagByName(name)) return;
    set('selectedTag', name);
    setStep(2);
  }, [set, setStep]);

  const body = [StructureStep, TaskStep, SettingsStep, CheckStep, KpointsStep, JobStep][step];
  const Body = body ?? StructureStep;
  const last = STEPS.length - 1;

  return (
    <div className="ib">
      <p className="ib-banner" role="note">
        This tool generates input files, not guarantees. It targets VASP 5.4 to 6.4. Checks are rules of thumb
        and sources are linked from each message. Everything runs in your browser and nothing is uploaded.
        POTCAR files are never generated.
      </p>
      <div role="group" aria-label="Builder mode" className="ib-mode">
        <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
          Single calculation
        </button>
        <button type="button" aria-pressed={mode === 'series'} onClick={() => setMode('series')}>
          Convergence series
        </button>
      </div>
      {mode === 'series' ? (
        <SeriesPanel />
      ) : (
        <>
          <nav aria-label="Builder steps">
            <ol className="ib-steps">
              {STEPS.map((name, i) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={i === step ? 'is-current' : undefined}
                  >
                    <span className="ib-num">{i + 1}</span> {name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="ib-layout">
            <div className="ib-main">
              <Body />
              <div className="ib-nav">
                <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
                  Back
                </button>
                <button type="button" disabled={step === last} onClick={() => setStep(step + 1)}>
                  Next
                </button>
              </div>
            </div>
            {step === 2 && (
              <div className="ib-aside">
                <TagCard
                  name={selectedTag}
                  level={level}
                  onSelect={(n) => set('selectedTag', n)}
                  value={selectedTag ? incar[selectedTag] : undefined}
                  structure={structure}
                  incar={incar}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
