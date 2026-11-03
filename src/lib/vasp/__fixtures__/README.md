# VASP output fixtures

Written by hand to the documented line formats (Field Handbook OSZICAR and OUTCAR entries, S-041; Workflow Handbook S-042). **Not real VASP output**: none of these patterns has been validated on a real file yet (Q-008). Numbers are invented for parser tests only and are not results.

| File | Format shown |
|---|---|
| `oszicar-nospin.txt` | relaxation, 3 ionic steps, no `mag=` |
| `oszicar-spin.txt` | relaxation, 3 ionic steps, `mag=`, one number glued to its `=` |
| `oszicar-md.txt` | MD lines with `T=` |
| `outcar-v54.txt` | OUTCAR excerpt in the VASP 5.4.4 style, 2 ionic steps, 2 ions |
| `outcar-v63.txt` | OUTCAR excerpt in the VASP 6.3.2 style, 1 ionic step, 1 species, no `reached required accuracy` |
