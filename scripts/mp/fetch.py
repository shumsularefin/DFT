"""Fetch the Screening Studio data from the Materials Project (M9.1).

    export MP_API_KEY=...            # in your shell only; never in a file
    python scripts/mp/fetch.py --config scripts/mp/config.yaml
    python scripts/mp/fetch.py --mock  # dry run with synthetic documents, no network, no key

Writes one raw cache file, scripts/mp/.cache/raw-<db_version>.json (git-ignored), holding the
documents and how they were obtained (database version, query, date, client version). The API key
is read by mp-api from the MP_API_KEY variable; this script never reads its value, prints it or
writes it anywhere.
@source S-044
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mpdata  # noqa: E402

FILTER_KEYS = {"energy_above_hull", "num_sites", "num_elements", "band_gap", "is_stable", "theoretical"}


class FetchError(Exception):
    pass


def load_config(path: Path) -> dict:
    import yaml

    cfg = yaml.safe_load(path.read_text(encoding="utf-8"))
    for block in ("index", "starter"):
        bad = set(cfg[block]) - FILTER_KEYS
        if bad:
            raise FetchError(f"config {block}: unknown filter(s) {sorted(bad)}; allowed: {sorted(FILTER_KEYS)}")
    return cfg


def excluded(cfg: dict) -> list[str]:
    ex = cfg.get("exclude_elements") or {}
    return sorted({str(s) for group in ex.values() for s in group})


def query_args(cfg: dict, block: str) -> dict:
    """Keyword arguments for summary.search(). Ranges become tuples, as mp-api expects."""
    args: dict[str, Any] = {}
    for k, v in cfg[block].items():
        args[k] = tuple(v) if isinstance(v, list) else v
    ex = excluded(cfg)
    if ex:
        args["exclude_elements"] = ex
    return args


def with_retries(fn: Callable[[], Any], attempts: int, backoff: float, sleep: Callable[[float], None] = time.sleep,
                 log: Callable[[str], None] = print) -> Any:
    """Call fn; on an exception wait backoff, 2*backoff, 4*backoff ... and try again, up to `attempts` calls."""
    for n in range(1, attempts + 1):
        try:
            return fn()
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 (the client raises several types)
            if n == attempts:
                raise FetchError(f"gave up after {attempts} attempts: {type(e).__name__}: {e}") from e
            wait = backoff * 2 ** (n - 1)
            log(f"  attempt {n} failed ({type(e).__name__}: {e}); retrying in {wait:g} s")
            sleep(wait)
    raise AssertionError("unreachable")


class MockSummary:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.calls: list[dict] = []

    def search(self, fields: list[str] | None = None, **kw: Any) -> list[dict]:
        self.calls.append({"fields": fields, **kw})
        flt = {k: (list(v) if isinstance(v, tuple) else v) for k, v in kw.items()}
        return [mpdata.pick_fields(d, fields) for d in self.docs if mpdata.matches(d, flt)]


class MockRester:
    """Stands in for MPRester in --mock runs and in tests: synthetic documents, no network."""

    db_version = "mock"
    current_db_version = "mock"

    def __init__(self, docs: list[dict] | None = None):
        self.materials = type("M", (), {})()
        self.materials.summary = MockSummary(docs if docs is not None else mpdata.synthetic_docs("mock", 30))

    def __enter__(self):
        return self

    def __exit__(self, *exc: Any) -> None:
        return None


def client_version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("mp-api")
    except PackageNotFoundError:
        return "not installed"


def real_rester():
    if not os.environ.get("MP_API_KEY"):
        raise FetchError("MP_API_KEY is not set. Run: export MP_API_KEY=... in this shell (never put it in a file).")
    from mp_api.client import MPRester

    # The key is read from the environment by mp-api. use_document_model=False returns plain data.
    return MPRester(use_document_model=False)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(cfg: dict, rester: Any, *, mock: bool, accept_db_version: bool = False, cache_dir: Path = mpdata.CACHE_DIR,
          sleep: Callable[[float], None] = time.sleep, log: Callable[[str], None] = print) -> Path:
    with rester as mpr:
        served = str(getattr(mpr, "current_db_version", None) or getattr(mpr, "db_version", None) or "")
        if not served:
            raise FetchError("the server did not report a database version")
        pin = str(cfg.get("db_version") or "")
        if pin and pin != served and not accept_db_version:
            raise FetchError(
                f"config pins db_version {pin} but the API serves {served}. REST queries always use the served "
                f"version. Set db_version: \"{served}\" in the config, or pass --accept-db-version."
            )
        attempts = int(cfg.get("retries", 4))
        backoff = float(cfg.get("backoff_seconds", 5))
        index_q = query_args(cfg, "index")
        starter_q = query_args(cfg, "starter")
        log(f"Materials Project database {served}. Querying the index ({len(mpdata.INDEX_FIELDS)} fields)...")
        index_docs = with_retries(lambda: mpr.materials.summary.search(**index_q, fields=mpdata.INDEX_FIELDS),
                                  attempts, backoff, sleep, log)
        log(f"  {len(index_docs)} documents. Querying the starter subset with structures...")
        starter_docs = with_retries(lambda: mpr.materials.summary.search(**starter_q, fields=mpdata.STARTER_FIELDS),
                                    attempts, backoff, sleep, log)
        log(f"  {len(starter_docs)} documents.")
    meta = {
        "dbVersion": served,
        "fetched": now_iso(),
        "client": "mock" if mock else "mp-api",
        "clientVersion": "mock" if mock else client_version(),
        "mock": mock,
        "query": {
            "index": {**{k: list(v) if isinstance(v, tuple) else v for k, v in index_q.items()},
                      "fields": mpdata.INDEX_FIELDS},
            "starter": {**{k: list(v) if isinstance(v, tuple) else v for k, v in starter_q.items()},
                        "fields": mpdata.STARTER_FIELDS},
        },
    }
    raw = {"meta": meta, "index": mpdata.to_plain(list(index_docs)), "starter": mpdata.to_plain(list(starter_docs))}
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"raw-{'mock' if mock else served}.json"
    out.write_text(json.dumps(raw), encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, default=mpdata.HERE / "config.yaml")
    ap.add_argument("--mock", action="store_true", help="synthetic documents, no network, no key")
    ap.add_argument("--accept-db-version", action="store_true", help="fetch even if the served version differs from the pin")
    ap.add_argument("--cache-dir", type=Path, default=mpdata.CACHE_DIR)
    a = ap.parse_args(argv)
    try:
        cfg = load_config(a.config)
        rester = MockRester() if a.mock else real_rester()
        out = fetch(cfg, rester, mock=a.mock, accept_db_version=a.accept_db_version, cache_dir=a.cache_dir)
    except FetchError as e:
        print(f"fetch.py: {e}", file=sys.stderr)
        return 2
    print(f"Wrote {out.relative_to(mpdata.ROOT) if out.is_relative_to(mpdata.ROOT) else out}")
    print("Next: python scripts/mp/build_shards.py" + (" (mock data go to scripts/mp/.cache/mock-out/)" if a.mock else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
