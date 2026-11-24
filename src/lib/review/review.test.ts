import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectVaspFileKind, ingestCalculationFiles, parsePotcarHeadersOnly } from './intake';
import { reviewCalculation, reviewToMarkdown } from './postflight';

describe('M14.1 calculation review (intake, preflight, postflight)', () => {
  it('detects misnamed files by content and never retains raw POTCAR body in state', () => {
    const fakePotcar = [
      ' PAW_PBE Ti_pv 07Sep2000',
      '   12.00000000000000',
      ' parameters from PSCTR are:',
      '   VRHFIN =Ti: 3p4s3d',
      '   LEXCH  = PE',
      '   TITEL  = PAW_PBE Ti_pv 07Sep2000',
      '   ENMAX  =  222.338; ENMIN  =  166.753 eV',
      '   ZVAL   =   12.000    mass and valenz',
      '   SECRET_PSEUDOPOTENTIAL_GRID_LINE_123456789',
    ].join('\n');

    expect(detectVaspFileKind('my_pseudo.txt', fakePotcar)).toBe('POTCAR');
    const headers = parsePotcarHeadersOnly(fakePotcar);
    expect(headers).toEqual([{ titel: 'PAW_PBE Ti_pv 07Sep2000', enmax: 222.338, zval: 12 }]);

    const intake = ingestCalculationFiles([
      { name: 'my_pseudo.txt', text: fakePotcar },
      { name: 'tags.txt', text: 'ENCUT = 520\nISMEAR = 0\nSIGMA = 0.05\nKSPACING = 0.25\n' },
    ]);
    expect(intake.files[1]!.kind).toBe('INCAR');
    // Raw POTCAR text must never be stored in intake state
    expect(JSON.stringify(intake)).not.toContain('SECRET_PSEUDOPOTENTIAL_GRID_LINE_123456789');
  });

  it('passes ENMAX check when ENCUT >= 1.3 * ENMAX and fails on ISIF=3 when below', () => {
    const pot = '   TITEL = PAW_PBE O 08Apr2002\n   ENMAX = 400.000; ENMIN = 300.000\n   ZVAL = 6.000\n';
    const good = reviewCalculation(
      ingestCalculationFiles([
        { name: 'POTCAR', text: pot },
        { name: 'INCAR', text: 'ENCUT = 520\nISMEAR = 0\nSIGMA = 0.05\nKSPACING = 0.25\n' },
      ]),
    );
    expect(good.preflight.find((c) => c.id === 'PF-ENMAX')?.status).toBe('pass');

    const bad = reviewCalculation(
      ingestCalculationFiles([
        { name: 'POTCAR', text: pot },
        { name: 'INCAR', text: 'ENCUT = 400\nISIF = 3\nIBRION = 2\nNSW = 50\nKSPACING = 0.25\n' },
      ]),
    );
    expect(bad.preflight.find((c) => c.id === 'PF-ENMAX')?.status).toBe('fail');
  });

  it('reads golden OSZICAR_relax_spin and exports Markdown report without claiming correctness', () => {
    const oszText = readFileSync('tests/reference/vasp-outputs/OSZICAR_relax_spin', 'utf8');
    const expected = JSON.parse(readFileSync('tests/reference/vasp-outputs/expected.json', 'utf8'));
    const intake = ingestCalculationFiles([{ name: 'OSZICAR', text: oszText }]);
    const report = reviewCalculation(intake);
    const oszCheck = report.postflight.find((c) => c.id === 'POST-OSZICAR');
    expect(oszCheck?.status).toBe('pass');
    expect(intake.oszicar?.ionic.length).toBe(expected.OSZICAR_relax_spin.ionic_steps.length);

    const md = reviewToMarkdown(report);
    expect(md).toContain('# VASP Calculation Review');
    expect(md).toContain('does not prove a calculation is physically correct');
    expect(md).toContain('S-041');
  });
});
