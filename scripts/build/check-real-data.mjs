#!/usr/bin/env node
// Deploy gate: the live site must not ship synthetic Screening Studio data.
// If dist/data/mp/manifest.json exists and says synthetic: true, fail. If it does not exist, pass
// (the Studio is not built yet, or ships without data and says so).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = path.join(root, 'dist', 'data', 'mp', 'manifest.json');

if (!fs.existsSync(manifest)) {
  console.log('check-real-data: no Materials Project manifest in dist, nothing to check.');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
if (data.synthetic !== false) {
  console.error('check-real-data: dist/data/mp/manifest.json is not marked synthetic:false. Refusing to deploy sample data to the live site.');
  process.exit(1);
}
console.log(`check-real-data: real data version ${data.dbVersion ?? 'unknown'} OK.`);
