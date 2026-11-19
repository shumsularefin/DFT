"""Build the published dataset from a raw cache written by fetch.py (M9.1).

    python scripts/mp/build_shards.py                 # newest raw cache in scripts/mp/.cache/
    python scripts/mp/build_shards.py --raw scripts/mp/.cache/raw-2026.04.13.json

Real data go to public/data/mp/<db_version>/ (manifest.json, index.json, s/NNN.json) and
public/data/mp/current.json points the site at them. Mock data (from fetch.py --mock) are always
marked synthetic and go to scripts/mp/.cache/mock-out/ instead, so a dry run never touches public/.
@source S-044, S-024
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402
import mpdata  # noqa: E402


def newest_raw(cache_dir: Path) -> Path:
    raws = sorted(cache_dir.glob("raw-*.json"), key=lambda p: p.stat().st_mtime)
    if not raws:
        raise fetch.FetchError(f"no raw cache in {cache_dir}; run fetch.py first")
    return raws[-1]


def build_from_raw(raw: dict, cfg: dict, *, shard_target: int | None = None) -> dict[str, bytes]:
    meta = raw["meta"]
    mock = bool(meta.get("mock"))
    v = meta["dbVersion"]
    if mock:
        licence = "None: synthetic mock data, not from the Materials Project"
        attribution = "Synthetic mock data from scripts/mp/fetch.py --mock. Property values are made up."
    else:
        licence = cfg["licence"]
        attribution = " ".join(str(cfg["attribution"]).split()).replace("{db_version}", v)
    return mpdata.build_dataset(
        index_docs=raw["index"],
        starter_docs=raw["starter"],
        db_version=v,
        synthetic=mock,
        licence=licence,
        attribution=attribution,
        source={
            "client": meta["client"],
            "clientVersion": meta["clientVersion"],
            "query": meta["query"],
            "fetched": meta["fetched"],
            "mock": mock,
        },
        generated=fetch.now_iso(),
        shard_target=shard_target,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, help="raw cache file (default: newest in scripts/mp/.cache/)")
    ap.add_argument("--config", type=Path, default=mpdata.HERE / "config.yaml")
    ap.add_argument("--out", type=Path, help="output root (default: public/data/mp, or .cache/mock-out for mock data)")
    ap.add_argument("--force", action="store_true", help="replace an existing output folder for this version")
    a = ap.parse_args(argv)
    try:
        raw_path = a.raw or newest_raw(mpdata.CACHE_DIR)
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
        cfg = fetch.load_config(a.config)
        files = build_from_raw(raw, cfg)
    except (fetch.FetchError, ValueError, KeyError) as e:
        print(f"build_shards.py: {e}", file=sys.stderr)
        return 2
    mock = bool(raw["meta"].get("mock"))
    v = raw["meta"]["dbVersion"]
    root = a.out or (mpdata.CACHE_DIR / "mock-out" if mock else mpdata.PUBLIC_MP)
    if not mock and v == "sample":
        print("build_shards.py: 'sample' is reserved for make_sample.py", file=sys.stderr)
        return 2
    out = root / v
    if out.exists():
        if not a.force:
            print(f"build_shards.py: {out} exists; pass --force to replace it", file=sys.stderr)
            return 2
        shutil.rmtree(out)
    mpdata.write_dataset(files, out)
    errs = mpdata.validate_dir(out)
    if errs:
        for e in errs:
            print(f"  {e['code']}: {e['message']}", file=sys.stderr)
        print(f"build_shards.py: the dataset in {out} does not validate (see above)", file=sys.stderr)
        return 1
    if not mock:
        (root / "current.json").write_bytes(
            mpdata.encode({"schemaVersion": mpdata.SCHEMA_VERSION, "dbVersion": v, "manifest": f"{v}/manifest.json"})
        )
    man = json.loads(files["manifest.json"])
    total = sum(f["gzipBytes"] for f in man["files"])
    print(f"Wrote {out}: {man['count']} materials, {man['starterCount']} with structures in "
          f"{len(man['files']) - 1} shard(s), {total / 1024:.0f} KB gzipped. synthetic: {str(man['synthetic']).lower()}")
    if man["source"].get("skipped"):
        print(f"  skipped: {man['source']['skipped']}")
    print("Next: python scripts/mp/validate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
