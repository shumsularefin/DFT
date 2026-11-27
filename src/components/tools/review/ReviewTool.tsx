import { useState, type ChangeEvent } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import Badge from '../../ui/Badge';
import { ingestCalculationFiles, type RawInputFile } from '../../../lib/review/intake';
import { reviewCalculation, reviewToMarkdown, type ReviewReport } from '../../../lib/review/postflight';
import '../../../styles/tools.css';
import './review.css';

const SAMPLE_FILES: RawInputFile[] = [
  {
    name: 'INCAR',
    text: 'ENCUT = 520\nISMEAR = 0\nSIGMA = 0.05\nISIF = 3\nIBRION = 2\nNSW = 40\nEDIFF = 1E-6\nEDIFFG = -0.02\nISPIN = 2\nMAGMOM = 2*4.0 2*-4.0 6*0.0\nLORBIT = 11\nKSPACING = 0.25\n',
  },
  {
    name: 'OSZICAR',
    text: [
      '       N       E                     dE             d eps       ncg     rms          rms(c)',
      'DAV:   1    -0.58123456E+02    0.12345E+02   -0.12345E+02   240   0.123E+01',
      'DAV:   2    -0.61456789E+02   -0.33333E+01   -0.23456E+00   240   0.123E-03    0.456E-04',
      '   1 F= -.61456789E+02 E0= -.61456100E+02  d E =-.614568E+02  mag=     0.0012',
    ].join('\n'),
  },
];

async function readDroppedFiles(fileList: FileList): Promise<RawInputFile[]> {
  const out: RawInputFile[] = [];
  for (const file of Array.from(fileList)) {
    if (file.size > 25 * 1024 * 1024) continue;
    if (file.name.toLowerCase().endsWith('.zip')) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const entries = unzipSync(buf);
      for (const [entryName, data] of Object.entries(entries)) {
        if (entryName.endsWith('/') || data.byteLength === 0 || data.byteLength > 25 * 1024 * 1024) continue;
        out.push({ name: entryName, text: strFromU8(data) });
      }
    } else {
      out.push({ name: file.name, text: await file.text() });
    }
  }
  return out;
}

export default function ReviewTool() {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [isSample, setIsSample] = useState(false);

  async function onFilesChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    const raw = await readDroppedFiles(e.target.files);
    const intake = ingestCalculationFiles(raw);
    setReport(reviewCalculation(intake));
    setIsSample(false);
  }

  function loadSample() {
    const intake = ingestCalculationFiles(SAMPLE_FILES);
    setReport(reviewCalculation(intake));
    setIsSample(true);
  }

  function downloadMarkdown() {
    if (!report) return;
    const blob = new Blob([reviewToMarkdown(report)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vasp-calculation-review.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  const count = (list: ReviewReport['preflight']) => ({
    pass: list.filter((c) => c.status === 'pass').length,
    total: list.length,
    fail: list.filter((c) => c.status === 'fail').length,
    warn: list.filter((c) => c.status === 'warn').length,
  });
  const pre = report ? count(report.preflight) : null;
  const post = report ? count(report.postflight) : null;

  return (
    <div className="rev-root" data-tool-id="review">
      <header className="page-h tool-head">
        <div>
          <h1>Calculation review (pre-flight and post-flight)</h1>
          <p>
            Drop your VASP input and output files (or a zip archive) to run a sourced pre-flight consistency
            check and post-flight convergence review locally in your browser. Export the transcript as
            Markdown for your lab notebook.
          </p>
        </div>
        <div className="row">
          {report && (
            <button type="button" className="btn btn-primary" onClick={downloadMarkdown}>
              Export Markdown report
            </button>
          )}
        </div>
      </header>
      <div className="split left">
        <div className="card tool-inputs">
          <h2 className="card-h">Inputs</h2>
          <p>
            Select VASP input/output files (<code>INCAR</code>, <code>POSCAR</code>, <code>CONTCAR</code>,{' '}
            <code>KPOINTS</code>, <code>OSZICAR</code>, <code>OUTCAR</code>, optional <code>POTCAR</code>) or
            a <code>.zip</code> archive. Everything is parsed locally in your browser; if a{' '}
            <code>POTCAR</code> is included, only its <code>TITEL</code>, <code>ENMAX</code> and{' '}
            <code>ZVAL</code> headers are read and the body is discarded immediately.
          </p>
          <div className="rev-actions">
            <label className="btn btn-primary rev-file">
              Choose files or .zip
              <input
                type="file"
                multiple
                onChange={onFilesChange}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              />
            </label>
            <button type="button" className="pill" onClick={loadSample}>
              Load synthetic sample
            </button>
          </div>
          {isSample && (
            <p className="notice rev-sample">
              <strong>Synthetic sample loaded:</strong> these numbers are synthetic test inputs to demonstrate
              the review transcript, not a real VASP calculation.
            </p>
          )}
          {report && (
            <section aria-label="Recognised files">
              <h3>Recognised files ({report.files.length})</h3>
              <ul className="rev-transcript">
                {report.files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="rev-line rev-not-checked">
                    <code>{f.name}</code> <span className="rev-meta">detected as {f.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="notice rev-sample">
            This tool reports whether your files pass or fail named checks from the VASP wiki and handbooks.
            Passing all checks does not guarantee that a calculation is physically correct.
          </p>
        </div>

        <div className="stack tool-results">
          <div className="grid g3 tool-tiles">
            <div className="tile">
              <div className="k">Files recognised</div>
              <div className={`v${report ? '' : ' is-empty'}`}>{report ? report.files.length : 0}</div>
              <div className="tile-sub">{isSample ? 'synthetic sample' : 'parsed locally'}</div>
            </div>
            <div className="tile">
              <div className="k">Pre-flight passed</div>
              <div className={`v${pre ? '' : ' is-empty'}`}>{pre ? `${pre.pass}/${pre.total}` : 'n/a'}</div>
              <div className="tile-sub">{pre ? `${pre.fail} fail, ${pre.warn} warn` : 'no files yet'}</div>
            </div>
            <div className="tile">
              <div className="k">Post-flight passed</div>
              <div className={`v${post ? '' : ' is-empty'}`}>
                {post ? `${post.pass}/${post.total}` : 'n/a'}
              </div>
              <div className="tile-sub">{post ? `${post.fail} fail, ${post.warn} warn` : 'no files yet'}</div>
            </div>
          </div>
          {report ? (
            <>
              <section aria-label="Pre-flight checks" className="card tool-card">
                <h2 className="card-h">Pre-flight checks</h2>
                <ul className="rev-transcript">
                  {report.preflight.map((c) => (
                    <li key={c.id} className={`rev-line rev-${c.status}`}>
                      <strong>[{c.status.toUpperCase()}]</strong> {c.title}{' '}
                      {c.kind === 'heuristic' ? (
                        <Badge variant="heuristic" />
                      ) : c.kind === 'computed' ? (
                        <Badge variant="computed" />
                      ) : null}
                      <span className="rev-meta">
                        ({c.kind}, {c.source})
                      </span>
                      <p style={{ margin: '0.35rem 0 0' }}>{c.reason}</p>
                      {c.fix && (
                        <p style={{ margin: '0.25rem 0 0' }}>
                          <strong>Suggested fix:</strong> {c.fix}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Post-flight checks" className="card tool-card">
                <h2 className="card-h">Post-flight checks</h2>
                <ul className="rev-transcript">
                  {report.postflight.map((c) => (
                    <li key={c.id} className={`rev-line rev-${c.status}`}>
                      <strong>[{c.status.toUpperCase()}]</strong> {c.title}{' '}
                      {c.kind === 'heuristic' ? (
                        <Badge variant="heuristic" />
                      ) : c.kind === 'computed' ? (
                        <Badge variant="computed" />
                      ) : null}
                      <span className="rev-meta">
                        ({c.kind}, {c.source})
                      </span>
                      <p style={{ margin: '0.35rem 0 0' }}>{c.reason}</p>
                      {c.fix && (
                        <p style={{ margin: '0.25rem 0 0' }}>
                          <strong>Suggested fix:</strong> {c.fix}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <div className="card tool-card">
              <p className="ph">Choose files or load the synthetic sample to see the checks.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
