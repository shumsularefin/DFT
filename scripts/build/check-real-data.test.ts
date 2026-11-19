import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRealData } from './check-real-data.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE = path.join(ROOT, 'public', 'data', 'mp', 'sample');
const SCRIPT = path.join(__dirname, 'check-real-data.mjs');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function fakeDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dft-real-'));
  dirs.push(d);
  fs.mkdirSync(path.join(d, 'data', 'mp'), { recursive: true });
  return d;
}
const run = (dist: string) => {
  try {
    execFileSync(process.execPath, [SCRIPT, '--dist', dist], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return (e as { status: number }).status;
  }
};

describe('check-real-data deploy gate', () => {
  it('fails on the committed sample manifest copied into a fake dist', () => {
    const dist = fakeDist();
    fs.cpSync(SAMPLE, path.join(dist, 'data', 'mp', 'sample'), { recursive: true });
    expect(checkRealData(dist).ok).toBe(false);
    expect(run(dist)).toBe(1);
  });

  it('passes a fixture marked synthetic:false with a current.json that points to it', () => {
    const dist = fakeDist();
    const v = path.join(dist, 'data', 'mp', '2026.04.13');
    fs.mkdirSync(v);
    fs.writeFileSync(
      path.join(v, 'manifest.json'),
      JSON.stringify({ synthetic: false, dbVersion: '2026.04.13' }),
    );
    fs.writeFileSync(
      path.join(dist, 'data', 'mp', 'current.json'),
      JSON.stringify({ schemaVersion: 1, dbVersion: '2026.04.13', manifest: '2026.04.13/manifest.json' }),
    );
    expect(checkRealData(dist).ok).toBe(true);
    expect(run(dist)).toBe(0);
  });

  it('fails when real and sample data ship together, or current.json is dangling', () => {
    const dist = fakeDist();
    fs.cpSync(SAMPLE, path.join(dist, 'data', 'mp', 'sample'), { recursive: true });
    fs.mkdirSync(path.join(dist, 'data', 'mp', 'v1'));
    fs.writeFileSync(path.join(dist, 'data', 'mp', 'v1', 'manifest.json'), '{"synthetic":false}');
    expect(checkRealData(dist).ok).toBe(false);
    const d2 = fakeDist();
    fs.writeFileSync(path.join(d2, 'data', 'mp', 'current.json'), '{"manifest":"v9/manifest.json"}');
    expect(checkRealData(d2).ok).toBe(false);
  });

  it('passes when there are no Materials Project data, and when deploy removed the sample', () => {
    const dist = fakeDist();
    expect(run(dist)).toBe(0);
    fs.cpSync(SAMPLE, path.join(dist, 'data', 'mp', 'sample'), { recursive: true });
    fs.rmSync(path.join(dist, 'data', 'mp', 'sample'), { recursive: true });
    expect(run(dist)).toBe(0);
  });
});
