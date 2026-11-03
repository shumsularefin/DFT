import { useEffect } from 'react';
import './input-builder.css';
import CheckStep from './CheckStep';
import JobStep from './JobStep';
import KpointsStep from './KpointsStep';
import SettingsStep from './SettingsStep';
import StructureStep from './StructureStep';
import TagCard from './TagCard';
import TaskStep from './TaskStep';
import { useLevel } from './hooks';
import { STEPS, useBuilder } from './store';

export default function InputBuilder() {
  const { step, setStep, selectedTag, applyShare, set } = useBuilder();
  const level = useLevel();

  useEffect(() => {
    const m = /(?:^|[#&])s=([^&]+)/.exec(location.hash);
    if (!m?.[1]) return;
    applyShare(m[1]);
  }, [applyShare]);

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
            <TagCard name={selectedTag} level={level} onSelect={(n) => set('selectedTag', n)} />
          </div>
        )}
      </div>
    </div>
  );
}
