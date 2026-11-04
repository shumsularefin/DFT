// Converts seekpath 2.2.2 (MIT) HPKOT band-path tables to JSON, reproducibly.
// Usage: node scripts/build/convert-hpkot-tables.mjs <seekpath-package-dir> [out-dir]
//   <seekpath-package-dir> is the unpacked wheel's "seekpath" folder (pip download seekpath==2.2.2 --no-deps; unzip the wheel).
// Reads seekpath/hpkot/band_path_data/<variant>/{k_vector_parameters,points,path}.txt and seekpath/hpkot/spg_db.py.
// Writes <out-dir>/variants.json and <out-dir>/spacegroups.json (default src/data/kpath/hpkot).
// Copyright (c) 2016-2023 Giovanni Pizzi et al., MIT licence (see THIRD_PARTY_NOTICES.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const lines = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((t) => t.length > 0 && t[0] !== '');

/** Parse the band_path_data tables. Throws on any malformed line, like seekpath's own loader. */
export function convertVariants(dataDir) {
  const variants = {};
  for (const name of fs.readdirSync(dataDir).sort()) {
    const dir = path.join(dataDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const kparams = lines(path.join(dir, 'k_vector_parameters.txt')).map((t) => {
      if (t.length !== 2) throw new Error(`${name}: bad k-parameter line ${t.join(' ')}`);
      return [t[0], t[1]];
    });
    const points = {};
    for (const t of lines(path.join(dir, 'points.txt'))) {
      if (t.length !== 4) throw new Error(`${name}: bad point line ${t.join(' ')}`);
      if (t[0] in points) throw new Error(`${name}: point ${t[0]} defined twice`);
      points[t[0]] = [t[1], t[2], t[3]];
    }
    const segs = lines(path.join(dir, 'path.txt')).map((t) => {
      if (t.length !== 2) throw new Error(`${name}: bad path line ${t.join(' ')}`);
      for (const p of t) if (!(p in points)) throw new Error(`${name}: path point ${p} is not defined`);
      return [t[0], t[1]];
    });
    variants[name] = { kparams, points, path: segs };
  }
  return variants;
}

/** spg_db.py: `N: ('family', 'centring', has_inversion),` for N = 1..230. */
export function convertSpaceGroups(pyFile) {
  const src = fs.readFileSync(pyFile, 'utf8');
  const out = {};
  for (const m of src.matchAll(/^\s*(\d+):\s*\('([a-z])',\s*'([A-Z])',\s*(True|False)\),/gm)) {
    out[m[1]] = [m[2], m[3], m[4] === 'True'];
  }
  if (Object.keys(out).length !== 230)
    throw new Error(`expected 230 space groups, found ${Object.keys(out).length}`);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const pkg = process.argv[2];
  if (!pkg) {
    console.error('usage: node scripts/build/convert-hpkot-tables.mjs <seekpath-package-dir> [out-dir]');
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const out = path.resolve(process.argv[3] ?? path.join(root, 'src/data/kpath/hpkot'));
  const meta = {
    source: 'seekpath 2.2.2, seekpath/hpkot (MIT, Copyright (c) 2016-2023 Giovanni Pizzi et al.)',
    reference: 'Y. Hinuma, G. Pizzi, Y. Kumagai, F. Oba, I. Tanaka, Comput. Mater. Sci. 128, 140 (2017)',
    generatedBy: 'scripts/build/convert-hpkot-tables.mjs',
  };
  const variants = convertVariants(path.join(pkg, 'hpkot/band_path_data'));
  const spacegroups = convertSpaceGroups(path.join(pkg, 'hpkot/spg_db.py'));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, 'variants.json'),
    JSON.stringify({ _meta: meta, variants }, null, 1) + '\n',
  );
  fs.writeFileSync(
    path.join(out, 'spacegroups.json'),
    JSON.stringify(
      {
        _meta: { ...meta, columns: ['crystal family letter', 'centring', 'has inversion'] },
        groups: spacegroups,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(
    `wrote ${Object.keys(variants).length} variants and ${Object.keys(spacegroups).length} space groups to ${out}`,
  );
}
