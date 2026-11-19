// Sample output files for the output reader (M7.3). Every one is SYNTHETIC: written to the documented line formats, with
// invented numbers, so the reader has something to read. They are never results (Q-008). The first equals the golden file
// tests/reference/vasp-outputs/OSZICAR_relax_spin (a test checks that).
export interface OutputSample {
  id: string;
  label: string;
  kind: 'OSZICAR' | 'OUTCAR';
  text: string;
}

const OSZICAR_RELAX_SPIN = `       N       E                     dE             d eps       ncg     rms          rms(c)
DAV:   1    -0.123456789012E+02   -0.12346E+02   -0.45678E+02   560   0.123E+02
DAV:   2    -0.234567890123E+02   -0.11111E+02   -0.12345E+01   600   0.456E+00
RMM:   3    -0.234590000000E+02   -0.22100E-02   -0.34567E-03   580   0.789E-01    0.123E+00
   1 F= -.23459000E+02 E0= -.23458500E+02  d E =-.234590E+02  mag=     2.0000
DAV:   1    -0.234600000000E+02   -0.10000E-02   -0.20000E-03   560   0.100E-01
RMM:   2    -0.234601000000E+02   -0.10000E-03   -0.10000E-04   560   0.500E-02    0.600E-02
   2 F= -.23460100E+02 E0= -.23459600E+02  d E =-.110000E-02  mag=     1.9998
`;

const OSZICAR_STUCK = `       N       E                     dE             d eps       ncg     rms          rms(c)
DAV:   1     0.100000000000E+02   0.10000E+02   -0.20000E+02   400   0.300E+01
DAV:   2    -0.500000000000E+01  -0.15000E+02   -0.40000E+01   420   0.100E+01
DAV:   3    -0.300000000000E+01   0.20000E+01   -0.30000E+00   410   0.900E+00
DAV:   4    -0.600000000000E+01  -0.30000E+01   -0.20000E+00   410   0.800E+00
DAV:   5    -0.350000000000E+01   0.25000E+01   -0.20000E+00   410   0.900E+00
DAV:   6    -0.580000000000E+01  -0.23000E+01   -0.10000E+00   410   0.700E+00
   1 F= -.58000000E+01 E0= -.57000000E+01  d E =-.580000E+01
`;

const OSZICAR_NOSPIN = `       N       E                     dE             d eps       ncg     rms          rms(c)
DAV:   1     0.100000000000E+02   0.10000E+02   -0.20000E+02   400   0.300E+01
DAV:   2    -0.500000000000E+01  -0.15000E+02   -0.40000E+01   420   0.100E+01
RMM:   3    -0.800000000000E+01  -0.30000E+01   -0.50000E+00   410   0.200E+00   0.150E+00
   1 F= -.80000000E+01 E0= -.79000000E+01  d E =-.800000E+01
DAV:   1    -0.810000000000E+01  -0.10000E+00   -0.20000E-01   400   0.100E+00
RMM:   2    -0.811000000000E+01  -0.10000E-01   -0.30000E-02   410   0.200E-01   0.150E-01
   2 F= -.81100000E+01 E0= -.80900000E+01  d E =-.110000E+00
DAV:   1    -0.811500000000E+01  -0.50000E-02   -0.10000E-02   400   0.100E+00
   3 F= -.81150000E+01 E0= -.80950000E+01  d E =-.500000E-02
`;

const OUTCAR_V54 = ` vasp.5.4.4.18Apr17-6-g9f103f2a35 (build Mar 01 2018 12:00:00) complex
 
   ENMAX  =  400.000; ENMIN  =  300.000 eV
   ENMAX  =  250.000; ENMIN  =  200.000 eV
   ENCUT  =  520.0 eV  38.22 Ry    6.18 a.u.
   number of ions     NIONS =      2
   k-points           NKPTS =     10   k-points in BZ     NKDIM =     10   number of bands    NBANDS=     16
 aborting loop because EDIFF is reached
  free  energy   TOTEN  =       -10.12345678 eV
  energy  without entropy=      -10.20000000  energy(sigma->0) =      -10.16000000
  external pressure =       12.50 kB  Pullay stress =        3.00 kB
 aborting loop because EDIFF is reached
  free  energy   TOTEN  =       -10.50000000 eV
  energy  without entropy=      -10.60000000  energy(sigma->0) =      -10.55000000
  external pressure =       -0.40 kB  Pullay stress =        0.00 kB
 POSITION                                       TOTAL-FORCE (eV/Angst)
 -----------------------------------------------------------------------------------
      0.00000      0.00000      0.00000         0.000000      0.000000      0.030000
      1.50000      1.50000      1.50000         0.000000      0.000000     -0.030000
 -----------------------------------------------------------------------------------
    total drift:                               -0.000001      0.000000      0.000002
 number of electron      16.0000000 magnetization       2.0000000
 E-fermi :   5.1234     XC(G=0):  -9.5   alpha+bet :-10.1
 reached required accuracy - stopping structural energy minimisation
  Elapsed time (sec):       12.345
`;

const OUTCAR_V63 = ` vasp.6.3.2 20Jan22 (build Feb 10 2022 10:00:00) complex
 
   ENMAX  =  400.000; ENMIN  =  300.000 eV
   ENCUT  =  450.0 eV
   number of ions     NIONS =      8
   k-points           NKPTS =     29   k-points in BZ     NKDIM =     29   number of bands    NBANDS=     24
 aborting loop EDIFF was not reached (unconverged)
  free  energy   TOTEN  =       -34.12345678 eV
  energy  without entropy=      -34.20000000  energy(sigma->0) =      -34.00000000
  external pressure =        2.00 kB  Pullay stress =        1.00 kB
`;

export const OUTPUT_SAMPLES: readonly OutputSample[] = [
  {
    id: 'oszicar-relax-spin',
    label: 'OSZICAR: spin-polarised relaxation, 2 ionic steps',
    kind: 'OSZICAR',
    text: OSZICAR_RELAX_SPIN,
  },
  {
    id: 'oszicar-nospin',
    label: 'OSZICAR: relaxation without spin, 3 ionic steps',
    kind: 'OSZICAR',
    text: OSZICAR_NOSPIN,
  },
  {
    id: 'oszicar-stuck',
    label: 'OSZICAR: a loop that does not converge',
    kind: 'OSZICAR',
    text: OSZICAR_STUCK,
  },
  {
    id: 'outcar-v54',
    label: 'OUTCAR excerpt: relaxation that converged (5.4 style)',
    kind: 'OUTCAR',
    text: OUTCAR_V54,
  },
  {
    id: 'outcar-v63',
    label: 'OUTCAR excerpt: loop that did not converge (6.3 style)',
    kind: 'OUTCAR',
    text: OUTCAR_V63,
  },
];
