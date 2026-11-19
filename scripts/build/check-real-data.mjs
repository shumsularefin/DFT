#!/usr/bin/env node
// Deploy gate: the live site must not ship synthetic Screening Studio data.
// Usage: node scripts/build/check-real-data.mjs [--dist <dir>]   (default: dist)
// Fails if any manifest.json under <dist>/data/mp/ is not marked synthetic:false, or if
// <dist>/data/mp/current.json points to a missing or synthetic manifest. Passes when there are no
// Materials Project data at all (the Studio then says the data are not published yet).
// deploy.yml deletes dist/data/mp/sample before running this (D-072).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function manifests(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...manifests(p));
    else if (d.name === 'manifest.json') out.push(p);
  }
  return out;
}

/** @returns {{ ok: boolean, messages: string[] }} */
export function checkRealData(dist) {
  const mp = path.join(dist, 'data', 'mp');
  const found = manifests(mp);
  const messages = [];
  let ok = true;
  const current = path.join(mp, 'current.json');
  if (!found.length && !fs.existsSync(current)) {
    return { ok, messages: ['check-real-data: no Materials Project data in dist, nothing to check.'] };
  }
  for (const m of found) {
    const rel = path.relative(dist, m);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(m, 'utf8'));
    } catch {
      ok = false;
      messages.push(`check-real-data: ${rel} is not valid JSON.`);
      continue;
    }
    if (data.synthetic !== false) {
      ok = false;
      messages.push(`check-real-data: ${rel} is not marked synthetic:false. Refusing to deploy sample data to the live site.`);
    } else messages.push(`check-real-data: ${rel}: real data version ${data.dbVersion ?? 'unknown'} OK.`);
  }
  if (fs.existsSync(current)) {
    let cur;
    try {
      cur = JSON.parse(fs.readFileSync(current, 'utf8'));
    } catch {
      cur = {};
    }
    const target = typeof cur.manifest === 'string' ? path.join(mp, cur.manifest) : '';
    if (!target || !fs.existsSync(target)) {
      ok = false;
      messages.push(`check-real-data: data/mp/current.json points to ${cur.manifest ?? 'nothing'}, which is missing.`);
    }
  }
  return { ok, messages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--dist');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dist = i > -1 ? path.resolve(process.argv[i + 1]) : path.join(root, 'dist');
  const { ok, messages } = checkRealData(dist);
  for (const m of messages) (ok ? console.log : console.error)(m);
  process.exit(ok ? 0 : 1);
}
