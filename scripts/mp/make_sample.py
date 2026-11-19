"""Write the synthetic sample dataset to public/data/mp/sample/ (M9.1).

    python scripts/mp/make_sample.py

About 30 entries built from the test structures in tests/reference/kpaths.json, ids sample-0001 ...
Structure-derived fields come from pymatgen; every property value is made up. manifest.synthetic is
true, and the Studio shows a "Synthetic demo data" banner. Rerunning gives byte-identical files.
@source S-034 (pymatgen structure analysis)
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mpdata  # noqa: E402

N = 30
# Small shards so the sample exercises several of them (real data use the schema's 100 KB target).
SAMPLE_SHARD_TARGET = 1200
# Fixed so reruns are byte-identical: the day this generator was written.
GENERATED = "2026-11-19T00:00:00Z"
STARTER = {"energy_above_hull": [0, 0.025], "num_sites": [1, 20]}


def sample_files() -> dict[str, bytes]:
    docs = mpdata.synthetic_docs("sample", N)
    starters = [d for d in docs if mpdata.matches(d, STARTER)]
    return mpdata.build_dataset(
        index_docs=[mpdata.pick_fields(d, mpdata.INDEX_FIELDS) for d in docs],
        starter_docs=starters,
        db_version="sample",
        synthetic=True,
        licence="None: synthetic demo data, not from the Materials Project",
        attribution=(
            "Synthetic demo data made by scripts/mp/make_sample.py from the test structures in "
            "tests/reference/kpaths.json. Formulas, volumes, densities and space groups are computed from those "
            "test cells; every energy, band gap and magnetic value is made up. Do not use these numbers."
        ),
        source={
            "client": "make_sample.py",
            "clientVersion": "1",
            "query": {"structures": f"first {N} of tests/reference/kpaths.json", "starter": STARTER},
            "fetched": GENERATED,
            "mock": True,
        },
        generated=GENERATED,
        shard_target=SAMPLE_SHARD_TARGET,
    )


def main() -> int:
    out = mpdata.PUBLIC_MP / "sample"
    if out.exists():
        shutil.rmtree(out)
    files = sample_files()
    mpdata.write_dataset(files, out)
    errs = mpdata.validate_dir(out)
    for e in errs:
        print(f"  {e['code']}: {e['message']}", file=sys.stderr)
    print(f"Wrote {out.relative_to(mpdata.ROOT)} ({len(files)} files)" + (" with ERRORS" if errs else ""))
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
