"""Unit tests for the Screening Studio pipeline (M9.1). No test touches the network.

    python -m unittest discover -s scripts/mp/tests -v
"""

from __future__ import annotations

import copy
import json
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import build_shards  # noqa: E402
import fetch  # noqa: E402
import make_sample  # noqa: E402
import mpdata  # noqa: E402

SAMPLE = mpdata.PUBLIC_MP / "sample"
FIXTURES = json.loads((HERE / "fixtures.json").read_text(encoding="utf-8"))["cases"]
CFG = fetch.load_config(mpdata.HERE / "config.yaml")
FAKE_KEY = "x" * 32  # a dummy value; the tests check it never reaches a file


def _no_network(*_a, **_k):
    raise AssertionError("a test tried to open a network connection")


def setUpModule():
    global _patch
    _patch = mock.patch.object(socket.socket, "connect", _no_network)
    _patch.start()


def tearDownModule():
    _patch.stop()


def sample_reader(files: dict[str, bytes]):
    return lambda rel: files.get(rel)


def load_sample() -> dict[str, bytes]:
    return {str(p.relative_to(SAMPLE)): p.read_bytes() for p in SAMPLE.rglob("*.json")}


def apply_case(files: dict[str, bytes], case: dict) -> dict[str, bytes]:
    """Python twin of applyCase in src/lib/mp/validate.test.ts."""
    out = dict(files)
    man = json.loads(out["manifest.json"])
    for e in case.get("edits", []):
        f = e["file"]
        if e.get("remove"):
            out.pop(f)
            continue
        if "appendText" in e:
            out[f] = out[f] + e["appendText"].encode()
        else:
            doc = man if f == "manifest.json" else json.loads(out[f])
            path = e.get("set") or e.get("delete")
            node = doc
            for k in path[:-1]:
                node = node[k]
            if "set" in e:
                node[path[-1]] = e["value"]
            else:
                del node[path[-1]]
            if f != "manifest.json":
                out[f] = mpdata.encode(doc)
        if e.get("rehash") and f != "manifest.json":
            for row in man["files"]:
                if row["path"] == f:
                    row["sha256"] = mpdata.sha256(out[f])
                    row["bytes"] = len(out[f])
    out["manifest.json"] = mpdata.encode(man)
    return out


class TestConfig(unittest.TestCase):
    def test_exclusions_match_pymatgen(self):
        from pymatgen.core import Element

        ex = CFG["exclude_elements"]
        self.assertEqual(set(ex["noble_gases"]), {e.symbol for e in Element if e.Z <= 118 and e.is_noble_gas})
        self.assertEqual(
            set(ex["radioactive"]),
            {e.symbol for e in Element if e.Z <= 118 and e.is_radioactive and not e.is_noble_gas},
        )
        self.assertNotIn("Bi", fetch.excluded(CFG))
        self.assertIn("No", fetch.excluded(CFG))  # nobelium, not YAML "false"

    def test_starter_is_inside_index(self):
        for k in ("energy_above_hull", "num_sites", "num_elements"):
            lo, hi = CFG["starter"][k]
            ilo, ihi = CFG["index"][k]
            self.assertTrue(ilo <= lo and hi <= ihi, k)

    def test_unknown_filter_is_refused(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "c.yaml"
            p.write_text("index: {nsites: [1, 2]}\nstarter: {}\n")
            with self.assertRaises(fetch.FetchError):
                fetch.load_config(p)


def fake_rester(docs=None, version="2026.04.13"):
    """A unittest.mock stand-in for MPRester: search() answers from synthetic documents."""
    inner = fetch.MockRester(docs)
    m = mock.MagicMock()
    m.__enter__.return_value = m
    m.current_db_version = version
    m.db_version = version
    m.materials.summary.search.side_effect = inner.materials.summary.search
    return m


class TestFetch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_fetch(self, rester, **kw):
        logs: list[str] = []
        with mock.patch.dict(os.environ, {"MP_API_KEY": FAKE_KEY}):
            out = fetch.fetch(CFG, rester, mock=False, cache_dir=self.cache, sleep=lambda s: None, log=logs.append, **kw)
        return out, logs

    def test_queries_records_and_never_writes_the_key(self):
        r = fake_rester()
        out, _ = self.run_fetch(r)
        self.assertEqual(out.name, "raw-2026.04.13.json")
        raw = json.loads(out.read_text())
        meta = raw["meta"]
        self.assertEqual(meta["dbVersion"], "2026.04.13")
        self.assertFalse(meta["mock"])
        self.assertRegex(meta["fetched"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertEqual(meta["client"], "mp-api")
        self.assertTrue(meta["clientVersion"])
        calls = r.materials.summary.search.call_args_list
        self.assertEqual(len(calls), 2)
        idx, st = calls[0].kwargs, calls[1].kwargs
        self.assertEqual(idx["energy_above_hull"], (0, 0.05))
        self.assertEqual(st["num_sites"], (1, 20))
        self.assertIn("structure", st["fields"])
        self.assertNotIn("structure", idx["fields"])
        self.assertIn("Xe", idx["exclude_elements"])
        self.assertEqual(meta["query"]["index"]["energy_above_hull"], [0, 0.05])
        for p in self.cache.rglob("*"):
            if p.is_file():
                self.assertNotIn(FAKE_KEY, p.read_text(errors="replace"))

    def test_retries_with_backoff(self):
        r = fake_rester()
        good = r.materials.summary.search.side_effect
        r.materials.summary.search.side_effect = [ConnectionError("reset"), TimeoutError("slow"), good(fields=None),
                                                  good(fields=None)]
        waits: list[float] = []
        with mock.patch.dict(os.environ, {"MP_API_KEY": FAKE_KEY}):
            fetch.fetch(CFG, r, mock=False, cache_dir=self.cache, sleep=waits.append, log=lambda s: None)
        self.assertEqual(waits, [5.0, 10.0])

    def test_gives_up(self):
        calls = []

        def boom():
            calls.append(1)
            raise ConnectionError("down")

        with self.assertRaises(fetch.FetchError):
            fetch.with_retries(boom, 3, 1, sleep=lambda s: None, log=lambda s: None)
        self.assertEqual(len(calls), 3)

    def test_db_version_pin(self):
        cfg = {**CFG, "db_version": "2025.01.01"}
        with self.assertRaises(fetch.FetchError):
            fetch.fetch(cfg, fake_rester(), mock=False, cache_dir=self.cache, log=lambda s: None)
        out = fetch.fetch(cfg, fake_rester(), mock=False, accept_db_version=True, cache_dir=self.cache,
                          log=lambda s: None)
        self.assertTrue(out.exists())

    def test_missing_key(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(fetch.FetchError):
                fetch.real_rester()

    def test_real_client_reads_key_from_environment(self):
        with mock.patch.dict(os.environ, {"MP_API_KEY": FAKE_KEY}), mock.patch("mp_api.client.MPRester") as M:
            fetch.real_rester()
        M.assert_called_once_with(use_document_model=False)

    def test_mock_cli_dry_run_builds_a_valid_synthetic_dataset(self):
        self.assertEqual(fetch.main(["--mock", "--cache-dir", str(self.cache)]), 0)
        raw = json.loads((self.cache / "raw-mock.json").read_text())
        self.assertTrue(raw["meta"]["mock"])
        out = self.cache / "out"
        self.assertEqual(build_shards.main(["--raw", str(self.cache / "raw-mock.json"), "--out", str(out)]), 0)
        man = json.loads((out / "mock" / "manifest.json").read_text())
        self.assertIs(man["synthetic"], True)
        self.assertEqual(mpdata.validate_dir(out / "mock"), [])
        self.assertFalse((out / "current.json").exists())


class TestBuild(unittest.TestCase):
    def raw(self, version="2026.04.13", mock_flag=False, docs=None):
        r = fake_rester(docs, version)
        with tempfile.TemporaryDirectory() as t:
            out = fetch.fetch(CFG, r, mock=mock_flag, cache_dir=Path(t), log=lambda s: None)
            return json.loads(out.read_text())

    def test_real_build_is_valid_and_not_synthetic(self):
        files = build_shards.build_from_raw(self.raw(), CFG)
        errs = mpdata.validate_files(sample_reader(files))
        self.assertEqual(errs, [])
        man = json.loads(files["manifest.json"])
        self.assertIs(man["synthetic"], False)
        self.assertIn("2026.04.13", man["attribution"])
        self.assertEqual(man["licence"], CFG["licence"])
        idx = json.loads(files["index.json"])
        # The mock filter applies the config: eHull <= 0.05 keeps entries whose synthetic eHull is 0, 0, 0.01, 0.02, 0.05.
        self.assertTrue(all(e <= 0.05 for e in idx["columns"]["energy_above_hull"]))
        self.assertEqual(man["starterCount"], sum(s is not None for s in idx["columns"]["shard"]))

    def test_mock_raw_is_always_synthetic(self):
        raw = self.raw(version="mock", mock_flag=True)
        files = build_shards.build_from_raw(raw, CFG)
        self.assertIs(json.loads(files["manifest.json"])["synthetic"], True)

    def test_shards_are_sorted_and_within_target(self):
        docs = mpdata.synthetic_docs("mp", 30)
        files = mpdata.build_dataset(index_docs=docs, starter_docs=docs, db_version="t", synthetic=True, licence="x",
                                     attribution="x", source={"client": "t", "clientVersion": "1", "query": {},
                                                              "fetched": "2026-01-01T00:00:00Z", "mock": True},
                                     generated="2026-01-01T00:00:00Z", shard_target=1500)
        shards = sorted(k for k in files if k.startswith("s/"))
        self.assertGreater(len(shards), 2)
        keys = []
        for s in shards:
            self.assertLessEqual(mpdata.gzip_size(files[s]), 1500 + 1500)  # one entry may overshoot an empty shard
            keys += [e["summary"]["chemsys"] for e in json.loads(files[s])["entries"]]
        self.assertEqual(keys, sorted(keys))

    def test_skips_unusable_and_disordered(self):
        docs = copy.deepcopy(mpdata.synthetic_docs("mp", 4))
        docs[0]["band_gap"] = None
        docs[1]["structure"]["sites"][0]["species"] = [{"element": "Fe", "occu": 0.5}, {"element": "Co", "occu": 0.5}]
        files = mpdata.build_dataset(index_docs=docs, starter_docs=docs, db_version="t", synthetic=True, licence="x",
                                     attribution="x", source={"client": "t", "clientVersion": "1", "query": {},
                                                              "fetched": "2026-01-01T00:00:00Z", "mock": True},
                                     generated="2026-01-01T00:00:00Z")
        man = json.loads(files["manifest.json"])
        self.assertEqual(man["count"], 3)
        self.assertEqual(man["source"]["skipped"]["missing band_gap"], 1)
        self.assertEqual(man["source"]["skipped"]["starter without an ordered structure"], 1)
        self.assertEqual(mpdata.validate_files(sample_reader(files)), [])

    def test_document_models_are_read_with_real_ids(self):
        from emmet.core.summary import SummaryDoc

        d = SummaryDoc.model_construct(material_id="mp-30", band_gap=0.0)
        self.assertEqual(mpdata.to_plain(d)["material_id"], "mp-30")


class TestValidate(unittest.TestCase):
    def test_sample_is_valid_and_synthetic(self):
        files = load_sample()
        self.assertEqual(mpdata.validate_files(sample_reader(files)), [])
        man = json.loads(files["manifest.json"])
        self.assertIs(man["synthetic"], True)
        self.assertEqual(man["dbVersion"], "sample")
        self.assertIn("made up", man["attribution"])
        ids = json.loads(files["index.json"])["columns"]["material_id"]
        self.assertEqual(ids[0], "sample-0001")
        self.assertEqual(len(ids), 30)
        self.assertGreater(sum(1 for k in files if k.startswith("s/")), 1)

    def test_sample_is_reproducible(self):
        self.assertEqual(make_sample.sample_files(), load_sample())

    def test_fixtures_are_rejected(self):
        base = load_sample()
        for case in FIXTURES:
            with self.subTest(case["name"]):
                files = apply_case(base, case)
                codes = {e["code"] for e in mpdata.validate_files(sample_reader(files), case.get("budgets"))}
                for c in case["expect"]:
                    self.assertIn(c, codes)

    def test_current_pointer(self):
        import validate

        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / "current.json").write_bytes(mpdata.encode({"schemaVersion": 1, "dbVersion": "v1",
                                                               "manifest": "v1/manifest.json"}))
            self.assertEqual([e["code"] for e in validate.check_current(root)], ["missing-file"])


if __name__ == "__main__":
    unittest.main()
