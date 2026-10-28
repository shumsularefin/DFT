import fs from 'node:fs';
import { initSync, analyze_cell } from '@spglib/moyo-wasm';
initSync({ module: fs.readFileSync('node_modules/@spglib/moyo-wasm/moyo_wasm_bg.wasm') });
const a = 3.61;
// conventional fcc Cu: 4 atoms; basis is column-major flat [ax,ay,az,bx,by,bz,cx,cy,cz]
const cell = { lattice: { basis: [a,0,0, 0,a,0, 0,0,a] }, positions: [[0,0,0],[0,0.5,0.5],[0.5,0,0.5],[0.5,0.5,0]], numbers: [29,29,29,29] };
for (const setting of ['Standard', 'Spglib']) {
  try {
    const d = analyze_cell(JSON.stringify(cell), 1e-4, setting);
    console.log(setting, d.number, d.hm_symbol, d.hall_number, d.pearson_symbol, 'ops', d.operations.length, 'wyck', d.wyckoffs.join(''), 'prim n', d.prim_std_cell.numbers.length, 'std n', d.std_cell.numbers.length);
    console.log('  prim basis', d.prim_std_cell.lattice.basis.map(x=>+x.toFixed(4)));
    console.log('  op0', JSON.stringify(d.operations[1]).slice(0,160));
  } catch (e) { console.log(setting, 'ERROR', String(e).slice(0,200)); }
}
// hcp Mg in a strange setting
const h = { lattice: { basis: [3.21,0,0, -1.605,2.780,0, 0,0,5.21] }, positions: [[1/3,2/3,0.25],[2/3,1/3,0.75]], numbers: [12,12] };
const dh = analyze_cell(JSON.stringify(h), 1e-3, 'Standard');
console.log('hcp', dh.number, dh.hm_symbol, dh.wyckoffs.join(''), dh.site_symmetry_symbols.join(' '));
