import { useEffect, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import './input-builder.css';
import CheckStep from './CheckStep';
import GeneratedFiles from './GeneratedFiles';
import JobStep from './JobStep';
import KpointsStep from './KpointsStep';
import SeriesPanel from './SeriesPanel';
import SettingsStep from './SettingsStep';
import StructureStep from './StructureStep';
import TagCard, { tagByName } from './TagCard';
import TaskStep from './TaskStep';
import { downloadBlob, useLevel } from './hooks';
import { STEPS, canDownload, filesOf, issuesOf, useBuilder } from './store';

export default function InputBuilder() {
  const s = useBuilder();
  const { step, setStep, selectedTag, applyShare, set, entries, structure } = s;
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

  const zip = () => {
    const state = useBuilder.getState();
    if (!state.structure || !canDownload(state, issuesOf(state))) return;
    const data: Record<string, Uint8Array> = {};
    for (const f of filesOf(state)) data[f.name] = strToU8(f.text);
    downloadBlob('vasp-inputs.zip', zipSync(data) as BlobPart, 'application/zip');
  };
  const ok = canDownload(s, issuesOf(s));

  return (
    <div className="ib">
      <header className="page-h ib-head">
        <div>
          <h1>Input builder</h1>
          <p>
            Prepare INCAR, KPOINTS, POSCAR and a job script step by step. Each setting is explained, and risky
            combinations are flagged before you submit a job.
          </p>
        </div>
        <div className="row">
          <div role="group" aria-label="Builder mode" className="seg">
            <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
              Single calculation
            </button>
            <button type="button" aria-pressed={mode === 'series'} onClick={() => setMode('series')}>
              Convergence series
            </button>
          </div>
          {mode === 'single' && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ok}
              title={
                ok
                  ? 'Download INCAR, KPOINTS, POSCAR, job.sh and README as a zip'
                  : 'Fix or accept the checks first'
              }
              onClick={zip}
            >
              <svg className="ib-ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" />
              </svg>
              Download bundle
            </button>
          )}
        </div>
      </header>
      <p className="notice ib-banner" role="note">
        This tool generates input files, not guarantees. It targets VASP 5.4 to 6.4. Checks are rules of thumb
        and sources are linked from each message. Everything runs in your browser and nothing is uploaded.
        POTCAR files are never generated.
      </p>
      {mode === 'series' ? (
        <div className="ib-body">
          <SeriesPanel />
        </div>
      ) : (
        <>
          <nav aria-label="Builder steps" className="card ib-stepcard">
            <ol className="steps">
              {STEPS.map((name, i) => (
                <li key={name}>
                  {i > 0 && <hr aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={i === step ? 'on' : i < step ? 'done' : 'todo'}
                  >
                    <span className="n">
                      {i < step ? (
                        <>
                          <svg className="ib-check" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m5 12 5 5 9-10" />
                          </svg>
                          <span className="sr-only">{i + 1}</span>
                        </>
                      ) : (
                        i + 1
                      )}
                    </span>{' '}
                    {name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="grid g2 ib-layout">
            <div className="card ib-main ib-body">
              <Body />
              <div className="ib-nav">
                <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={step === last}
                  onClick={() => setStep(step + 1)}
                >
                  Next step
                </button>
              </div>
            </div>
            <div className="stack ib-side">
              {step === 2 && (
                <div className="card ib-aside ib-body">
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
              <GeneratedFiles />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
