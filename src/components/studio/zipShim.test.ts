import { describe, expect, it } from 'vitest';
import { MiniZip } from './zipShim';

describe('MiniZip (JSZip subset on fflate)', () => {
  it('round trips folders and text files', async () => {
    const z = new MiniZip();
    z.file('README.txt', 'hello');
    z.folder('run').file('INCAR', 'ENCUT = 520\n');
    const bytes = (await z.generateAsync({ type: 'uint8array' })) as Uint8Array;
    const back = await MiniZip.loadAsync(bytes);
    const names = Object.keys(back.files).sort();
    expect(names).toContain('README.txt');
    expect(names).toContain('run/INCAR');
    expect(await back.files['run/INCAR']!.async('string')).toBe('ENCUT = 520\n');
  });
});
